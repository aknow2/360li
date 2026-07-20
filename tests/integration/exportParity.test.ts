import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { TestContext } from 'node:test';
import type { BufferGeometry } from 'three';
import { DEFAULT_PARAMS, type LithophaneParams, type SplitField } from '../../src/domain/params';
import { generateSphereLithophane } from '../../src/lithophane/sphereLithophane';
import { buildPartSolidComplex } from '../../src/lithophane/partSolid';
import { resolveSplitCell, type SplitCell } from '../../src/lithophane/splitCell';
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

type StlTriangle = Readonly<{
  normal: readonly [number, number, number];
  vertices: readonly [
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
  ];
}>;

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

function parseBinaryStl(stl: Uint8Array): StlTriangle[] {
  assert.ok(stl.byteLength >= 84, `binary STL must contain an 80-byte header and count, got ${stl.byteLength} bytes`);
  const view = new DataView(stl.buffer, stl.byteOffset, stl.byteLength);
  const triangleCount = view.getUint32(80, true);
  assert.equal(stl.byteLength, 84 + triangleCount * 50, 'binary STL length must exactly match its triangle count');
  const readVector = (offset: number): readonly [number, number, number] => [
    view.getFloat32(offset, true),
    view.getFloat32(offset + 4, true),
    view.getFloat32(offset + 8, true),
  ];
  return Array.from({ length: triangleCount }, (_, triangleIndex) => {
    const offset = 84 + triangleIndex * 50;
    return {
      normal: readVector(offset),
      vertices: [readVector(offset + 12), readVector(offset + 24), readVector(offset + 36)],
    };
  });
}

function coordinateKey(value: number): string {
  return Object.is(value, -0) ? '-0' : String(value);
}

function vertexKey(vertex: readonly number[]): string {
  return vertex.map(coordinateKey).join(',');
}

function triangleKey(triangle: StlTriangle): string {
  return triangle.vertices.map(vertexKey).sort().join('|');
}

function triangleSignatures(triangles: readonly StlTriangle[]): Set<string> {
  return new Set(triangles.map(triangleKey));
}

function assertExactFloat32(actual: number, expected: number, message: string): void {
  assert.ok(Object.is(actual, expected), `${message}: expected ${coordinateKey(expected)}, got ${coordinateKey(actual)}`);
}

function assertStlMatchesIndexedGeometry(geometry: BufferGeometry, triangles: readonly StlTriangle[]): void {
  const positions = geometry.getAttribute('position');
  const index = geometry.getIndex();
  assert.ok(positions && index, 'export parity requires indexed position geometry');
  assert.equal(triangles.length, index.count / 3, 'STL triangle count must equal displayed index count / 3');
  for (let triangleIndex = 0; triangleIndex < triangles.length; triangleIndex += 1) {
    const triangle = triangles[triangleIndex];
    const ordered: Array<readonly [number, number, number]> = [];
    for (let corner = 0; corner < 3; corner += 1) {
      const vertexIndex = index.getX(triangleIndex * 3 + corner);
      const expected = [positions.getX(vertexIndex), positions.getY(vertexIndex), positions.getZ(vertexIndex)] as const;
      ordered.push(expected);
      for (let axis = 0; axis < 3; axis += 1) {
        assertExactFloat32(
          triangle.vertices[corner][axis],
          expected[axis],
          `triangle ${triangleIndex} vertex ${corner} axis ${axis}`,
        );
      }
    }
    assert.ok(triangle.normal.every(Number.isFinite), `triangle ${triangleIndex} stored normal must be finite`);
    const [a, b, c] = ordered;
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    const crossLength = Math.hypot(...cross);
    const normalLength = Math.hypot(...triangle.normal);
    assert.ok(crossLength > 0, `triangle ${triangleIndex} must have a nonzero ordered cross product`);
    assert.ok(normalLength > 0, `triangle ${triangleIndex} stored normal must be nonzero`);
    const dot = cross.reduce((sum, component, axis) => sum + component * triangle.normal[axis], 0);
    assert.ok(dot > 0, `triangle ${triangleIndex} stored normal must agree with ordered winding`);
  }
}

/**
 * Intersects triangles by exact unordered Float32 coordinate keys. This is
 * deliberately stronger than a nearest-neighbor/tolerance comparison: every
 * matched coordinate must already be bit-for-bit identical, so maxDifference
 * is expected to remain zero and is also checked against the 0.00001 mm gate.
 */
function exactSharedTriangleCoordinates(
  first: readonly StlTriangle[],
  second: readonly StlTriangle[],
): { count: number; maxDifference: number; vertices: Set<string> } {
  const secondByKey = new Map(second.map((triangle) => [triangleKey(triangle), triangle]));
  let count = 0;
  let maxDifference = 0;
  const vertices = new Set<string>();
  for (const triangle of first) {
    const other = secondByKey.get(triangleKey(triangle));
    if (!other) continue;
    count += 1;
    const orderedFirst = [...triangle.vertices].sort((a, b) => vertexKey(a).localeCompare(vertexKey(b)));
    const orderedSecond = [...other.vertices].sort((a, b) => vertexKey(a).localeCompare(vertexKey(b)));
    for (let corner = 0; corner < 3; corner += 1) {
      vertices.add(vertexKey(orderedFirst[corner]));
      for (let axis = 0; axis < 3; axis += 1) {
        maxDifference = Math.max(maxDifference, Math.abs(orderedFirst[corner][axis] - orderedSecond[corner][axis]));
      }
    }
  }
  return { count, maxDifference, vertices };
}

const ANGLE_RECONSTRUCTION_ALLOWANCE = 1e-6;
const POLE_DIRECTION_ALLOWANCE = 1e-7;

function sphericalSplitCoordinates(vertex: readonly number[]): { u: number | null; v: number } {
  const radius = Math.hypot(vertex[0], vertex[1], vertex[2]);
  assert.ok(Number.isFinite(radius) && radius > 0, `split ownership requires a finite nonzero radius, got ${radius}`);
  const normalizedY = Math.max(-1, Math.min(1, vertex[1] / radius));
  const v = 1 - Math.acos(normalizedY) / Math.PI;
  if (Math.hypot(vertex[0], vertex[2]) / radius <= POLE_DIRECTION_ALLOWANCE) {
    return { u: null, v };
  }
  let phi = Math.atan2(vertex[2], -vertex[0]);
  if (phi < 0) phi += Math.PI * 2;
  return { u: 1 - phi / (Math.PI * 2), v };
}

function periodicDistanceToUCell(u: number, cell: SplitCell): number {
  const distanceToInterval = (value: number): number => (
    value < cell.uMin ? cell.uMin - value : value > cell.uMax ? value - cell.uMax : 0
  );
  return Math.min(distanceToInterval(u - 1), distanceToInterval(u), distanceToInterval(u + 1));
}

function assertDirectionOwnedByCell(vertex: readonly number[], cell: SplitCell, message: string): void {
  const { u, v } = sphericalSplitCoordinates(vertex);
  assert.ok(
    v >= cell.vMin - ANGLE_RECONSTRUCTION_ALLOWANCE && v <= cell.vMax + ANGLE_RECONSTRUCTION_ALLOWANCE,
    `${message}: reconstructed V=${v} is outside selected V=${cell.vMin}:${cell.vMax}`,
  );
  if (u === null) {
    const ownsPole = cell.vMin <= ANGLE_RECONSTRUCTION_ALLOWANCE
      || cell.vMax >= 1 - ANGLE_RECONSTRUCTION_ALLOWANCE;
    assert.ok(ownsPole, `${message}: U is undefined only at a pole owned by the selected V domain`);
    return;
  }
  assert.ok(
    periodicDistanceToUCell(u, cell) <= ANGLE_RECONSTRUCTION_ALLOWANCE,
    `${message}: reconstructed U=${u} is outside selected U=${cell.uMin}:${cell.uMax}, including the equivalent 0/1 seam`,
  );
}

function triangleCentroid(triangle: StlTriangle): readonly [number, number, number] {
  return [
    (triangle.vertices[0][0] + triangle.vertices[1][0] + triangle.vertices[2][0]) / 3,
    (triangle.vertices[0][1] + triangle.vertices[1][1] + triangle.vertices[2][1]) / 3,
    (triangle.vertices[0][2] + triangle.vertices[1][2] + triangle.vertices[2][2]) / 3,
  ];
}

function materialTriangles(
  geometry: BufferGeometry,
  triangles: readonly StlTriangle[],
  materialIndex: number,
): readonly StlTriangle[] {
  const groups = geometry.groups.filter((group) => group.materialIndex === materialIndex);
  assert.equal(groups.length, 1, `expected exactly one material ${materialIndex} group`);
  const [group] = groups;
  assert.equal(group.start % 3, 0, `material ${materialIndex} group start must align to a triangle`);
  assert.equal(group.count % 3, 0, `material ${materialIndex} group count must contain whole triangles`);
  return triangles.slice(group.start / 3, (group.start + group.count) / 3);
}

async function exportGenerated(params: LithophaneParams): Promise<{
  geometry: BufferGeometry;
  triangles: StlTriangle[];
}> {
  const generated = generateSphereLithophane(makeImageData('outward-default', 7, 5), params);
  const bytes = new Uint8Array(await exportGeometryToStlBlob(generated.geometry, { binary: true }).arrayBuffer());
  return { geometry: generated.geometry, triangles: parseBinaryStl(bytes) };
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
    const builtParams: LithophaneParams = {
      ...DEFAULT_PARAMS,
      widthSegments: 10,
      heightSegments: 5,
      horizontalSplitCount: 3,
      verticalSplitCount: 2,
      splitIndex: 5,
    };
    const generated = generateSphereLithophane(makeImageData('outward-default', 7, 5), builtParams);
    const geometry = generated.geometry;
    const snapshot = createBuildSnapshot(
      new File(['fixture'], 'fixture.png', { type: 'image/png', lastModified: 1 }),
      builtParams,
    );
    const part: BuiltPart = Object.freeze({
      geometry,
      summary: generated.summary,
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
      assert.deepEqual(snapshot.params, builtParams);
      assert.notEqual(liveParams.horizontalSplitCount, snapshot.params.horizontalSplitCount);
      assert.notEqual(liveParams.verticalSplitCount, snapshot.params.verticalSplitCount);
      assert.notEqual(liveParams.splitIndex, snapshot.params.splitIndex);
      assert.notEqual(liveParams.imageScale, snapshot.params.imageScale);
      assert.notEqual(liveParams.flipHorizontal, snapshot.params.flipHorizontal);
      assert.notEqual(liveParams.flipVertical, snapshot.params.flipVertical);
      assert.notEqual(liveParams.paddingMode, snapshot.params.paddingMode);
      assert.notEqual(deriveStlFileName(liveParams), part.fileName);
      const exported = new Uint8Array(await blob.arrayBuffer());
      assert.deepEqual(exported, new Uint8Array(await exportGeometryToStlBlob(geometry, { binary: true }).arrayBuffer()));
      assertStlMatchesIndexedGeometry(geometry, parseBinaryStl(exported));
    } finally {
      geometry.dispose();
    }
  });

  await t.test('split STL exactly preserves selected indexed geometry and independently proves angular cell ownership', async () => {
    const base: LithophaneParams = {
      ...DEFAULT_PARAMS,
      widthSegments: 10,
      heightSegments: 5,
      horizontalSplitCount: 3,
      verticalSplitCount: 2,
      holeDiameterMm: 0,
      topHoleDiameterMm: 0,
      standWallThicknessMm: 0,
      holeLatitude: 0,
      holeLongitude: 0,
      splitIndex: 6,
    };
    const selected = await exportGenerated(base);
    const siblings = await Promise.all(Array.from({ length: 6 }, async (_, offset) => (
      offset + 1 === base.splitIndex ? null : exportGenerated({ ...base, splitIndex: offset + 1 })
    )));
    try {
      assertStlMatchesIndexedGeometry(selected.geometry, selected.triangles);
      const selectedSignatures = triangleSignatures(selected.triangles);
      assert.equal(selectedSignatures.size, selected.triangles.length, 'selected STL must not duplicate triangles');
      const selectedCell = resolveSplitCell(base);
      let selectedPoleVertices = 0;
      for (let triangleIndex = 0; triangleIndex < selected.triangles.length; triangleIndex += 1) {
        const triangle = selected.triangles[triangleIndex];
        for (let corner = 0; corner < triangle.vertices.length; corner += 1) {
          if (sphericalSplitCoordinates(triangle.vertices[corner]).u === null) selectedPoleVertices += 1;
          assertDirectionOwnedByCell(triangle.vertices[corner], selectedCell, `selected STL triangle ${triangleIndex} vertex ${corner}`);
        }
        assertDirectionOwnedByCell(triangleCentroid(triangle), selectedCell, `selected STL triangle ${triangleIndex} centroid`);
      }
      assert.ok(selectedPoleVertices > 0, 'selected north-pole cell must exercise explicit pole ownership handling');

      const safeUMargin = 1 / (base.widthSegments * 4);
      const safeVMargin = 1 / (base.heightSegments * 4);
      const foreignOuterCandidates = new Set<string>();
      const siblingSignatures = new Set<string>();
      for (const sibling of siblings) {
        if (!sibling) continue;
        for (const signature of triangleSignatures(sibling.triangles)) siblingSignatures.add(signature);
        for (const triangle of materialTriangles(sibling.geometry, sibling.triangles, 0)) {
          const centroid = sphericalSplitCoordinates(triangleCentroid(triangle));
          const strictlyOutsideV = centroid.v < selectedCell.vMin - safeVMargin
            || centroid.v > selectedCell.vMax + safeVMargin;
          const strictlyOutsideU = centroid.u !== null
            && periodicDistanceToUCell(centroid.u, selectedCell) > safeUMargin;
          if (strictlyOutsideU || strictlyOutsideV) foreignOuterCandidates.add(triangleKey(triangle));
        }
      }
      assert.ok(
        foreignOuterCandidates.size > 0,
        'independent sibling OUTER triangles must provide centroid-owned candidates safely outside the selected cell',
      );
      const legitimateSharedBoundary = [...selectedSignatures].filter((signature) => siblingSignatures.has(signature));
      assert.ok(legitimateSharedBoundary.length > 0, 'selected and sibling Builds must expose nonempty exact shared-boundary triangles');
      assert.equal(
        legitimateSharedBoundary.filter((signature) => foreignOuterCandidates.has(signature)).length,
        0,
        'safe-margin foreign classification must exclude legitimate exact shared-boundary triangles',
      );
      const foreignIntersection = [...selectedSignatures].filter((signature) => foreignOuterCandidates.has(signature));
      assert.equal(
        foreignIntersection.length,
        0,
        'selected STL must have zero exact-signature intersection with independently classified foreign OUTER triangles',
      );
    } finally {
      selected.geometry.dispose();
      for (const sibling of siblings) sibling?.geometry.dispose();
    }
  });

  await t.test('all-index split STL families retain exact horizontal and vertical shared boundaries after Float32 reparse', async () => {
    const families = [
      { label: '2x2', horizontal: 2, vertical: 2, width: 9, height: 5, stand: false },
      { label: '3x2', horizontal: 3, vertical: 2, width: 10, height: 5, stand: false },
      { label: '4x3-stand', horizontal: 4, vertical: 3, width: 9, height: 7, stand: true },
    ] as const;
    for (const family of families) {
      const base: LithophaneParams = {
        ...DEFAULT_PARAMS,
        widthSegments: family.width,
        heightSegments: family.height,
        horizontalSplitCount: family.horizontal,
        verticalSplitCount: family.vertical,
        holeDiameterMm: family.stand ? 30 : 0,
        topHoleDiameterMm: family.stand ? 18 : 0,
        standWallThicknessMm: family.stand ? 3 : DEFAULT_PARAMS.standWallThicknessMm,
        splitIndex: 1,
      };
      const builds = await Promise.all(Array.from(
        { length: family.horizontal * family.vertical },
        (_, offset) => exportGenerated({ ...base, splitIndex: offset + 1 }),
      ));
      try {
        let horizontalPairs = 0;
        let verticalPairs = 0;
        let horizontalMax = 0;
        let verticalMax = 0;
        const standBoundaryVerticesByY = new Map<number, Set<string>>();
        for (let row = 0; row < family.vertical; row += 1) {
          for (let column = 0; column < family.horizontal; column += 1) {
            const index = row * family.horizontal + column;
            assertStlMatchesIndexedGeometry(builds[index].geometry, builds[index].triangles);
            if (column + 1 < family.horizontal) {
              const shared = exactSharedTriangleCoordinates(builds[index].triangles, builds[index + 1].triangles);
              assert.ok(shared.count > 0, `${family.label} horizontal pair ${index + 1}/${index + 2} must share exact unordered-coordinate triangles`);
              assert.ok(shared.vertices.size > 0);
              assert.ok(shared.maxDifference <= 0.00001, `${family.label} exact horizontal matches differ by ${shared.maxDifference} mm`);
              horizontalPairs += 1;
              horizontalMax = Math.max(horizontalMax, shared.maxDifference);
              if (family.stand && row === 0) {
                for (const key of shared.vertices) {
                  const y = Number(key.split(',')[1]);
                  const atY = standBoundaryVerticesByY.get(y) ?? new Set<string>();
                  atY.add(key);
                  standBoundaryVerticesByY.set(y, atY);
                }
              }
            }
            if (row + 1 < family.vertical) {
              const other = index + family.horizontal;
              const shared = exactSharedTriangleCoordinates(builds[index].triangles, builds[other].triangles);
              assert.ok(shared.count > 0, `${family.label} vertical pair ${index + 1}/${other + 1} must share exact unordered-coordinate triangles`);
              assert.ok(shared.vertices.size > 0);
              assert.ok(shared.maxDifference <= 0.00001, `${family.label} exact vertical matches differ by ${shared.maxDifference} mm`);
              verticalPairs += 1;
              verticalMax = Math.max(verticalMax, shared.maxDifference);
            }
          }
        }
        assert.equal(horizontalPairs, family.vertical * (family.horizontal - 1));
        assert.equal(verticalPairs, family.horizontal * (family.vertical - 1));
        assert.equal(horizontalMax, 0, `${family.label} exact-key Float32 horizontal matches must have zero coordinate difference`);
        assert.equal(verticalMax, 0, `${family.label} exact-key Float32 vertical matches must have zero coordinate difference`);
        if (family.stand) {
          const expectedComplex = buildPartSolidComplex(
            makeImageData('outward-default', 7, 5),
            base,
            resolveSplitCell(base),
          );
          const scalars = expectedComplex.diagnostics.stand.scalars;
          assert.ok(expectedComplex.diagnostics.stand.enabled && scalars, 'stand-family diagnostic complex must enable stand scalars');
          for (const [label, expected] of [
            ['collar Yc', Math.fround(scalars.Yc)],
            ['stand-top Ys', Math.fround(scalars.Ys)],
            ['annular-bottom Yb', Math.fround(scalars.Yb)],
          ] as const) {
            assert.ok(
              standBoundaryVerticesByY.has(expected),
              `stand-family exact shared STL boundary vertices must contain independently computed ${label}=${expected}`,
            );
          }
        }
      } finally {
        for (const build of builds) build.geometry.dispose();
      }
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
