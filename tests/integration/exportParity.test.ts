import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { TestContext } from 'node:test';
import { DEFAULT_PARAMS, type LithophaneParams, type SplitField } from '../../src/domain/params';
import { generateSphereLithophane } from '../../src/lithophane/sphereLithophane';
import { exportGeometryToStlBlob } from '../../src/three/exporter';
import { exportBuiltPart } from '../../src/three/exporter';
import { createBuildSnapshot, deriveStlFileName, type BuiltPart } from '../../src/domain/builtPart';

const fixturesDirectory = resolve(import.meta.dirname, '../fixtures');
const manifestPath = resolve(fixturesDirectory, 'legacy-1x1-geometry.json');

type FixtureCase = {
  id: string;
  image: { width: number; height: number; recipe: string };
  /** Immutable Phase 0 recipe, deliberately predating split parameters. */
  params: Omit<LithophaneParams, SplitField>;
  geometry: {
    attributes: Record<string, { byteLength: number; sha256: string }>;
    index: { constructor: string; byteLength: number; sha256: string };
    groups: Array<{ start: number; count: number; materialIndex: number }>;
    vertexCount: number;
    triangleCount: number;
  };
  stl: { file: string; byteLength: number; triangleCount: number; sha256: string };
};

type Manifest = { cases: FixtureCase[] };

const outwardImage = {
  width: 7,
  height: 5,
  recipe: 'seed=17; rgba=(seed+37*x+19*y, seed+11*x+53*y, seed+71*x+7*y, 255) mod 256',
};
const inwardImage = {
  width: 9,
  height: 6,
  recipe: 'seed=91; rgba=(seed+37*x+19*y, seed+11*x+53*y, seed+71*x+7*y, 255) mod 256',
};
const inwardParams: LithophaneParams = {
  ...DEFAULT_PARAMS,
  thicknessDirection: 'inward',
  holeDiameterMm: 24,
  topHoleDiameterMm: 24,
  standWallThicknessMm: 2,
  holeLatitude: 23,
  holeLongitude: 37,
  widthSegments: 48,
  heightSegments: 24,
};

function hashBytes(view: ArrayBufferView): string {
  return createHash('sha256')
    .update(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))
    .digest('hex');
}

function makeImageData(caseId: string, width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const seed = caseId === 'outward-default' ? 17 : 91;
      data[offset] = (seed + x * 37 + y * 19) % 256;
      data[offset + 1] = (seed + x * 11 + y * 53) % 256;
      data[offset + 2] = (seed + x * 71 + y * 7) % 256;
      data[offset + 3] = 255;
    }
  }
  return { width, height, data } as ImageData;
}

async function capture(fixture: FixtureCase) {
  const params = effectiveFixtureParams(fixture);
  const generated = generateSphereLithophane(
    makeImageData(fixture.id, fixture.image.width, fixture.image.height),
    params,
  );
  try {
    const stl = new Uint8Array(await exportGeometryToStlBlob(generated.geometry).arrayBuffer());
    return { geometry: generated.geometry, summary: generated.summary, stl };
  } catch (error) {
    generated.geometry.dispose();
    throw error;
  }
}

function effectiveFixtureParams(fixture: FixtureCase): LithophaneParams {
  return {
    ...fixture.params,
    horizontalSplitCount: 1,
    verticalSplitCount: 1,
    splitIndex: 1,
  };
}

function legacyRecipe(params: LithophaneParams): Omit<LithophaneParams, SplitField> {
  const recipe = { ...params } as Record<string, unknown>;
  Reflect.deleteProperty(recipe, 'horizontalSplitCount');
  Reflect.deleteProperty(recipe, 'verticalSplitCount');
  Reflect.deleteProperty(recipe, 'splitIndex');
  return recipe as Omit<LithophaneParams, SplitField>;
}

function assertGeometry(fixture: FixtureCase, captureResult: Awaited<ReturnType<typeof capture>>) {
  const { geometry, summary } = captureResult;
  assert.equal(summary.vertexCount, fixture.geometry.vertexCount);
  assert.equal(summary.triangleCount, fixture.geometry.triangleCount);
  for (const attributeName of ['position', 'uv', 'normal']) {
    const attribute = geometry.getAttribute(attributeName);
    const expected = fixture.geometry.attributes[attributeName];
    assert.ok(attribute, `${fixture.id} is missing ${attributeName}`);
    assert.equal(attribute.array.byteLength, expected.byteLength);
    assert.equal(hashBytes(attribute.array), expected.sha256);
  }
  const index = geometry.getIndex();
  assert.ok(index, `${fixture.id} is missing its index`);
  assert.equal(index.array.constructor.name, fixture.geometry.index.constructor);
  assert.equal(index.array.byteLength, fixture.geometry.index.byteLength);
  assert.equal(hashBytes(index.array), fixture.geometry.index.sha256);
  assert.deepEqual(geometry.groups, fixture.geometry.groups);
}

function triangleCountFromBinaryStl(stl: Uint8Array): number {
  return new DataView(stl.buffer, stl.byteOffset, stl.byteLength).getUint32(80, true);
}

function exactBytes(view: ArrayBufferView): Uint8Array {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

async function readVerifiedManifest(): Promise<[FixtureCase, FixtureCase]> {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Manifest;
  assert.deepEqual(manifest.cases.map((fixture) => fixture.id), [
    'outward-default',
    'inward-holes-stand-rotation',
  ]);
  const [outward, inward] = manifest.cases;
  assert.ok(outward && inward, 'fixture manifest must contain both exact cases');
  assert.deepEqual(outward.image, outwardImage);
  assert.equal(outward.stl.file, 'legacy-1x1-outward.stl');
  assert.deepEqual(outward.params, legacyRecipe(DEFAULT_PARAMS));
  assert.deepEqual(inward.image, inwardImage);
  assert.equal(inward.stl.file, 'legacy-1x1-holes-stand-inward.stl');
  assert.deepEqual(inward.params, legacyRecipe(inwardParams));
  for (const fixture of [outward, inward]) {
    const { horizontalSplitCount, verticalSplitCount, splitIndex } = effectiveFixtureParams(fixture);
    const effectiveSplitTuple = { horizontalSplitCount, verticalSplitCount, splitIndex };
    assert.deepEqual(effectiveSplitTuple, {
      horizontalSplitCount: 1,
      verticalSplitCount: 1,
      splitIndex: 1,
    });
  }
  return [outward, inward];
}

async function assertStlFixture(fixture: FixtureCase, stl: Uint8Array): Promise<void> {
  const expectedStl = new Uint8Array(await readFile(resolve(fixturesDirectory, fixture.stl.file)));
  assert.equal(stl.byteLength, fixture.stl.byteLength);
  assert.equal(triangleCountFromBinaryStl(stl), fixture.stl.triangleCount);
  assert.ok(triangleCountFromBinaryStl(stl) > 0, `${fixture.id} STL must contain triangles`);
  assert.equal(stl.byteLength, 84 + 50 * triangleCountFromBinaryStl(stl));
  assert.equal(hashBytes(stl), fixture.stl.sha256);
  assert.deepEqual(stl, expectedStl);
}

export async function registerTests(t: TestContext): Promise<void> {
  await t.test('Built Part export retains captured geometry identity and filename after live edits', async () => {
    const geometry = generateSphereLithophane(makeImageData('outward-default', 7, 5), DEFAULT_PARAMS).geometry;
    const snapshot = createBuildSnapshot(
      new File(['fixture'], 'fixture.png', { type: 'image/png', lastModified: 1 }),
      { ...DEFAULT_PARAMS, horizontalSplitCount: 3, verticalSplitCount: 2, splitIndex: 5 },
    );
    const part: BuiltPart = Object.freeze({
      geometry,
      summary: { vertexCount: geometry.getAttribute('position').count, triangleCount: (geometry.getIndex()?.count ?? 0) / 3 },
      workingImage: makeImageData('outward-default', 7, 5),
      snapshot,
      fileName: deriveStlFileName(snapshot.params),
    });
    const liveParams = {
      ...snapshot.params,
      horizontalSplitCount: 4,
      verticalSplitCount: 3,
      splitIndex: 7,
      imageScale: 0.63,
      flipHorizontal: true,
      flipVertical: true,
      paddingMode: 'stretch' as const,
    };
    const downloads: Array<{ blob: Blob; fileName: string }> = [];
    try {
      const blob = exportBuiltPart(part, (receivedBlob, fileName) => {
        downloads.push({ blob: receivedBlob, fileName });
      });
      assert.equal(downloads[0]?.blob, blob);
      assert.equal(downloads[0]?.fileName, 'spherical-lithophane-h3-v2-part-5-of-6.stl');
      assert.equal(part.geometry, geometry);
      assert.equal(part.fileName, deriveStlFileName(snapshot.params));
      assert.deepEqual(snapshot.params, {
        ...DEFAULT_PARAMS,
        horizontalSplitCount: 3,
        verticalSplitCount: 2,
        splitIndex: 5,
      });
      assert.notEqual(liveParams.horizontalSplitCount, snapshot.params.horizontalSplitCount);
      assert.notEqual(liveParams.verticalSplitCount, snapshot.params.verticalSplitCount);
      assert.notEqual(liveParams.splitIndex, snapshot.params.splitIndex);
      assert.notEqual(liveParams.imageScale, snapshot.params.imageScale);
      assert.notEqual(liveParams.flipHorizontal, snapshot.params.flipHorizontal);
      assert.notEqual(liveParams.flipVertical, snapshot.params.flipVertical);
      assert.notEqual(liveParams.paddingMode, snapshot.params.paddingMode);
      assert.notEqual(deriveStlFileName(liveParams), part.fileName);
      assert.deepEqual(
        new Uint8Array(await blob.arrayBuffer()),
        new Uint8Array(await exportGeometryToStlBlob(geometry, { binary: true }).arrayBuffer()),
      );
    } finally {
      geometry.dispose();
    }
  });

  await t.test('default geometry/STL fixture parity', async () => {
    const [outward] = await readVerifiedManifest();
    const result = await capture(outward);
    try {
      assertGeometry(outward, result);
      await assertStlFixture(outward, result.stl);
    } finally {
      result.geometry.dispose();
    }
  });

  await t.test('inward holes/stand/rotation geometry/STL fixture parity', async () => {
    const [, inward] = await readVerifiedManifest();
    const result = await capture(inward);
    try {
      assertGeometry(inward, result);
      await assertStlFixture(inward, result.stl);
    } finally {
      result.geometry.dispose();
    }
  });

  await t.test('two clean captures of each case are byte-identical', async () => {
    const fixtures = await readVerifiedManifest();
    for (const fixture of fixtures) {
      const first = await capture(fixture);
      const second = await capture(fixture);
      try {
        assertGeometry(fixture, first);
        assertGeometry(fixture, second);
        await assertStlFixture(fixture, first.stl);
        await assertStlFixture(fixture, second.stl);
        for (const attributeName of ['position', 'uv', 'normal']) {
          assert.deepEqual(
            exactBytes(first.geometry.getAttribute(attributeName).array),
            exactBytes(second.geometry.getAttribute(attributeName).array),
          );
        }
        const firstIndex = first.geometry.getIndex();
        const secondIndex = second.geometry.getIndex();
        assert.ok(firstIndex && secondIndex, `${fixture.id} is missing an index for determinism proof`);
        assert.deepEqual(exactBytes(firstIndex.array), exactBytes(secondIndex.array));
        assert.deepEqual(first.stl, second.stl);
      } finally {
        first.geometry.dispose();
        second.geometry.dispose();
      }
    }
  });
}
