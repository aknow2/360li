import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { DEFAULT_PARAMS, type LithophaneParams } from '../../src/domain/params';
import { buildPartSolidComplex, type CanonicalVolumeComplex } from '../../src/lithophane/partSolid';
import { resolveSplitCell } from '../../src/lithophane/splitCell';
import {
  clipCanonicalVolumeComplex,
  clipTetrahedronDeterministically,
  type ClipInputVertex,
  type ClippedVolumeComplex,
  type NamedInterfaceName,
  type PartitionedFace,
} from '../../src/lithophane/tetraClip';

type Point = readonly [number, number, number];

function image(width = 9, height = 7): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = (i * 29 + 17) % 256;
    data[i * 4 + 1] = (i * 43 + 31) % 256;
    data[i * 4 + 2] = (i * 61 + 47) % 256;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data } as ImageData;
}

function params(overrides: Partial<LithophaneParams> = {}): LithophaneParams {
  return {
    ...DEFAULT_PARAMS,
    widthSegments: 8,
    heightSegments: 6,
    horizontalSplitCount: 2,
    verticalSplitCount: 2,
    splitIndex: 1,
    holeDiameterMm: 30,
    standWallThicknessMm: 3,
    ...overrides,
  };
}

function build(p: LithophaneParams): CanonicalVolumeComplex {
  return buildPartSolidComplex(image(), p, resolveSplitCell(p));
}

function clip(p: LithophaneParams): ClippedVolumeComplex {
  return clipCanonicalVolumeComplex(build(p));
}

function pointKey(point: Point, scalar: number, key: string): ClipInputVertex {
  return { key, position: point, scalars: Object.freeze({ plane: scalar }) };
}

function f32Bytes(point: Point): number[] {
  return [...new Uint8Array(new Float32Array(point).buffer)];
}

const NAMED_INTERFACES = ['shellCollar', 'collarTaper', 'taperTube'] as const;

function splitIndex(row: number, column: number, horizontalCount: number): number {
  return (row - 1) * horizontalCount + column;
}

function gcd(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : gcd(b, a % b);
}

function rationalBoundary(axis: 'u' | 'v', numerator: number, denominator: number): string {
  const divisor = gcd(numerator, denominator);
  return `${axis}:${numerator / divisor}/${denominator / divisor}`;
}

function stableTriangleKey(keys: readonly string[]): string {
  return [...keys].sort().join('\u0001');
}

function sameCycle(a: readonly string[], b: readonly string[]): boolean {
  return a.some((_, offset) => a.every((value, index) => value === b[(index + offset) % b.length]));
}

function oppositeCycle(a: readonly string[], b: readonly string[]): boolean {
  return sameCycle(a, [...b].reverse());
}

function splitWallFaces(
  result: ClippedVolumeComplex,
  boundaryId: string,
  side: 'lower' | 'upper',
): PartitionedFace[] {
  return result.faces.filter((face) => face.provenance.kind === 'splitWall'
    && face.provenance.boundaryId === boundaryId && face.provenance.side === side);
}

function assertComplementaryBoundary(
  lower: ClippedVolumeComplex,
  upper: ClippedVolumeComplex,
  boundaryId: string,
  requireCutVertices: boolean,
): { triangleCount: number; vertexCount: number; cutCount: number } {
  const lowerFaces = splitWallFaces(lower, boundaryId, 'upper');
  const upperFaces = splitWallFaces(upper, boundaryId, 'lower');
  const indexed = (faces: readonly PartitionedFace[]) => new Map(faces.map((face) => [stableTriangleKey(face.vertexKeys), face]));
  const lowerByKey = indexed(lowerFaces);
  const upperByKey = indexed(upperFaces);
  assert.ok(lowerFaces.length > 0, `${boundaryId} must contain split-wall triangles`);
  assert.equal(lowerByKey.size, lowerFaces.length, `${boundaryId} lower triangle identity`);
  assert.equal(upperByKey.size, upperFaces.length, `${boundaryId} upper triangle identity`);
  assert.deepEqual(new Set(upperByKey.keys()), new Set(lowerByKey.keys()), `${boundaryId} undirected triangles`);
  for (const [key, lowerFace] of lowerByKey) {
    const upperFace = upperByKey.get(key)!;
    assert.ok(oppositeCycle(lowerFace.vertexKeys, upperFace.vertexKeys), `${boundaryId}/${key} winding`);
  }

  const lowerVertexKeys = new Set(lowerFaces.flatMap((face) => face.vertexKeys));
  const upperVertexKeys = new Set(upperFaces.flatMap((face) => face.vertexKeys));
  assert.deepEqual(upperVertexKeys, lowerVertexKeys, `${boundaryId} boundary vertices`);
  const cutKeys = [...lowerVertexKeys].filter((key) => key.startsWith(`cut:${boundaryId}:`));
  if (requireCutVertices) assert.ok(cutKeys.length > 0, `${boundaryId} must contain interpolated cut vertices`);
  for (const key of lowerVertexKeys) {
    const lowerVertex = lower.vertices.find((vertex) => vertex.key === key)!;
    const upperVertex = upper.vertices.find((vertex) => vertex.key === key)!;
    assert.deepEqual(upperVertex.position, lowerVertex.position, `${boundaryId}/${key} Float64 position`);
    assert.deepEqual(
      [...upper.positions.slice(upperVertex.id * 3, upperVertex.id * 3 + 3)],
      [...lower.positions.slice(lowerVertex.id * 3, lowerVertex.id * 3 + 3)],
      `${boundaryId}/${key} Float64 position buffer`,
    );
    assert.deepEqual(upperVertex.float32Position, lowerVertex.float32Position, `${boundaryId}/${key} Float32 position`);
    assert.deepEqual(f32Bytes(upperVertex.float32Position), f32Bytes(lowerVertex.float32Position), `${boundaryId}/${key} Float32 bytes`);
  }
  return { triangleCount: lowerFaces.length, vertexCount: lowerVertexKeys.size, cutCount: cutKeys.length };
}

function assertNamedInterfacePairs(result: ClippedVolumeComplex): Record<NamedInterfaceName, number> {
  const counts = { shellCollar: 0, collarTaper: 0, taperTube: 0 };
  for (const name of NAMED_INTERFACES) {
    const groups = new Map<string, PartitionedFace[]>();
    for (const face of result.faces) {
      if (face.provenance.kind !== 'namedInterface' || face.provenance.name !== name) continue;
      const key = stableTriangleKey(face.vertexKeys);
      groups.set(key, [...(groups.get(key) ?? []), face]);
    }
    for (const [key, pair] of groups) {
      assert.equal(pair.length, 2, `${name}/${key} incidence`);
      assert.ok(pair.every((face) => face.provenance.kind === 'namedInterface' && face.provenance.name === name), `${name}/${key} provenance`);
      assert.ok(oppositeCycle(pair[0].vertexKeys, pair[1].vertexKeys), `${name}/${key} winding`);
    }
    counts[name] = groups.size;
    assert.equal(groups.size, result.diagnostics.namedInterfaces[name].retained, `${name} independently counted pairs`);
  }
  return counts;
}

function assertGenerationFailed(run: () => unknown, pattern?: RegExp): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal((error as Error & { code?: string }).code, 'GENERATION_FAILED');
    if (pattern) assert.match(error.message, pattern);
    return true;
  });
}

function serialized(result: ClippedVolumeComplex): unknown {
  return {
    vertices: result.vertices.map((vertex) => [vertex.key, [...vertex.position], [...vertex.float32Position], vertex.lineage]),
    faces: result.faces.map((face) => [face.vertexKeys, face.provenance, face.sourceTetraIndex, face.order]),
    tetrahedra: result.tetrahedra.map((tetra) => [tetra.vertexKeys, tetra.signedVolume6, tetra.sourceTetraIndex, tetra.pieceIndex, tetra.clipSides]),
  };
}

export async function registerTests(t: TestContext): Promise<void> {
  await t.test('canonical edge lineage and independent Phase-4 neighboring rows share exact directed split walls', () => {
    const sharedA = pointKey([-1, 0, 0], -1, 'shared:a');
    const sharedB = pointKey([3, 2, -4], 3, 'shared:b');
    const left = clipTetrahedronDeterministically({
      sourceKey: 'left',
      vertices: [sharedA, sharedB, pointKey([0, 3, 0], 1, 'left:c'), pointKey([0, 0, 2], 1, 'left:d')],
      boundaries: [{ id: 'v:1/3', scalar: 'plane', keep: 'positive', side: 'lower' }],
    });
    const right = clipTetrahedronDeterministically({
      sourceKey: 'right',
      vertices: [sharedB, sharedA, pointKey([0, 0, -2], -1, 'right:d'), pointKey([0, -3, 0], -1, 'right:c')],
      boundaries: [{ id: 'v:1/3', scalar: 'plane', keep: 'negative', side: 'upper' }],
    });
    assert.ok(left && right);
    const leftCut = left.vertices.find((vertex) => vertex.key.includes('shared:a') && vertex.key.includes('shared:b'))!;
    const rightCut = right.vertices.find((vertex) => vertex.key === leftCut.key)!;
    assert.deepEqual(rightCut.position, leftCut.position);
    assert.deepEqual(rightCut.float32Position, leftCut.float32Position);
    assert.deepEqual(f32Bytes(rightCut.position), f32Bytes(leftCut.position));
    assert.equal(leftCut.key, 'cut:v:1/3:[shared:a|shared:b]');

    const horizontalCount = 2;
    const verticalCount = 3;
    const lowerRow = 1;
    const upperRow = lowerRow + 1;
    const column = 1;
    for (const thicknessDirection of ['outward', 'inward'] as const) {
      const shared = {
        thicknessDirection,
        heightSegments: 11,
        horizontalSplitCount: horizontalCount,
        verticalSplitCount: verticalCount,
        holeDiameterMm: 110,
      };
      const lowerParams = params({ ...shared, splitIndex: splitIndex(lowerRow, column, horizontalCount) });
      const upperParams = params({ ...shared, splitIndex: splitIndex(upperRow, column, horizontalCount) });
      const lower = clipCanonicalVolumeComplex(build(lowerParams));
      const upper = clipCanonicalVolumeComplex(build(upperParams));
      assert.equal(lower.cell.vSegments.end, upper.cell.vSegments.start);
      const boundaryId = rationalBoundary('v', lower.cell.vSegments.end, lowerParams.heightSegments);
      const evidence = assertComplementaryBoundary(lower, upper, boundaryId, true);
      assert.deepEqual(evidence, { triangleCount: 16, vertexCount: 18, cutCount: 18 });
    }
  });

  await t.test('closed zero contact is retained while complementary half-open tags cover volume exactly once', () => {
    const vertices = [
      pointKey([0, 0, 0], 0, 'a'),
      pointKey([2, 0, 0], 2, 'b'),
      pointKey([0, 2, 0], -2, 'c'),
      pointKey([0, 0, 2], 0, 'd'),
    ] as const;
    const lower = clipTetrahedronDeterministically({
      sourceKey: 'zero-contact', vertices,
      boundaries: [{ id: 'v:1/2', scalar: 'plane', keep: 'positive', side: 'lower' }],
    });
    const upper = clipTetrahedronDeterministically({
      sourceKey: 'zero-contact', vertices,
      boundaries: [{ id: 'v:1/2', scalar: 'plane', keep: 'negative', side: 'upper' }],
    });
    assert.ok(lower && upper);
    assert.ok(lower.vertices.some((vertex) => vertex.key === 'a'));
    assert.ok(upper.vertices.some((vertex) => vertex.key === 'a'));
    assert.deepEqual(new Set(lower.tetrahedra.flatMap((tetra) => tetra.clipSides)), new Set(['v:1/2:lower:positive']));
    assert.deepEqual(new Set(upper.tetrahedra.flatMap((tetra) => tetra.clipSides)), new Set(['v:1/2:upper:negative']));
    const original = 8 / 6;
    const pieces = [...lower.tetrahedra, ...upper.tetrahedra];
    const total = pieces.reduce((sum, tetra) => sum + tetra.signedVolume6 / 6, 0);
    assert.ok(Math.abs(total - original) <= 1e-12);
    assert.equal(pieces.some((tetra) => tetra.signedVolume6 <= 0), false);
  });

  await t.test('normalization, outward winding, lexicographic rotation, fan order, and repeated runs are deterministic', () => {
    const input = {
      sourceKey: 'determinism',
      vertices: [
        pointKey([-1, -1, -1], -1, 'z'), pointKey([2, 0, 0], 2, 'a'),
        pointKey([0, 2, 0], 2, 'm'), pointKey([0, 0, 2], 2, 'b'),
      ] as const,
      boundaries: [{ id: 'v:2/5', scalar: 'plane', keep: 'positive' as const, side: 'lower' as const }],
    };
    const first = clipTetrahedronDeterministically(input)!;
    const second = clipTetrahedronDeterministically(input)!;
    assert.deepEqual(second, first);
    assert.ok(first.faces.some((face) => face.provenance.kind === 'splitWall'));
    for (const face of first.faces) {
      assert.equal(new Set(face.vertexKeys).size, 3);
      assert.equal(face.vertexKeys[0], [...face.vertexKeys].sort()[0], 'triangle rotates to smallest stable key');
      const [a, b, c] = face.vertexKeys.map((key) => first.vertices.find((vertex) => vertex.key === key)!.position);
      const center = first.centroid.position;
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const outward = (ab[1] * ac[2] - ab[2] * ac[1]) * (a[0] - center[0])
        + (ab[2] * ac[0] - ab[0] * ac[2]) * (a[1] - center[1])
        + (ab[0] * ac[1] - ab[1] * ac[0]) * (a[2] - center[2]);
      assert.ok(outward > 0);
    }
  });

  await t.test('real whole-V and clipped outward/inward rows prove named-interface incidence directly', () => {
    for (const thicknessDirection of ['outward', 'inward'] as const) {
      const whole = clip(params({ thicknessDirection, verticalSplitCount: 1, splitIndex: 1 }));
      const expectedPairs = whole.cell.uSegments.count * 2;
      assert.ok(expectedPairs > 0);
      assert.deepEqual(assertNamedInterfacePairs(whole), {
        shellCollar: expectedPairs,
        collarTaper: expectedPairs,
        taperTube: expectedPairs,
      });

      const horizontalCount = 2;
      const contactBase = {
        thicknessDirection,
        heightSegments: 8,
        horizontalSplitCount: horizontalCount,
        verticalSplitCount: 2,
        holeDiameterMm: 2 * DEFAULT_PARAMS.radiusMm,
      };
      const lowerParams = params({ ...contactBase, splitIndex: splitIndex(1, 1, horizontalCount) });
      const upperParams = params({ ...contactBase, splitIndex: splitIndex(2, 1, horizontalCount) });
      const lowerComplex = build(lowerParams);
      const upperComplex = build(upperParams);
      const lower = clipCanonicalVolumeComplex(lowerComplex);
      const upper = clipCanonicalVolumeComplex(upperComplex);
      assert.deepEqual(assertNamedInterfacePairs(lower), {
        shellCollar: 0,
        collarTaper: lower.cell.uSegments.count * 2,
        taperTube: lower.cell.uSegments.count * 2,
      });
      assert.deepEqual(assertNamedInterfacePairs(upper), { shellCollar: 0, collarTaper: 0, taperTube: 0 });
      const boundaryId = rationalBoundary('v', lower.cell.vSegments.end, lowerParams.heightSegments);
      const contact = assertComplementaryBoundary(lower, upper, boundaryId, false);
      assert.equal(contact.triangleCount, lower.cell.uSegments.count * 2, 'contacted shellCollar becomes a proven split wall');
      assert.equal(contact.cutCount, 0, 'exact contact retains canonical vertices');
      const canonicalShellCollar = new Set(upperComplex.diagnostics.interfaces.shellCollar.map((numericKey) => stableTriangleKey(
        numericKey.split(':').map((id) => upperComplex.vertices[Number(id)].key),
      )));
      assert.equal(canonicalShellCollar.size, upper.cell.uSegments.count * 2);
      assert.deepEqual(
        new Set(splitWallFaces(lower, boundaryId, 'upper').map((face) => stableTriangleKey(face.vertexKeys))),
        canonicalShellCollar,
        'lower split wall is exactly the contacted canonical shellCollar',
      );
      assert.deepEqual(
        new Set(splitWallFaces(upper, boundaryId, 'lower').map((face) => stableTriangleKey(face.vertexKeys))),
        canonicalShellCollar,
        'upper split wall is exactly the contacted canonical shellCollar',
      );
      for (const result of [lower, upper]) {
        assert.ok(Object.values(result.diagnostics.namedInterfaces).every((entry) => entry.valid));
      }
    }
  });

  await t.test('missing, multiply-owned, and same-directed named interface fixtures fail recoverably', () => {
    const base = build(params());
    const namedKey = base.diagnostics.interfaces.collarTaper[0];
    const ids = namedKey.split(':').map(Number);
    const incidents = base.tetrahedra.map((tetra, index) => ({ tetra, index })).filter(({ tetra }) => ids.every((id) => tetra.vertexIds.includes(id)));
    assert.equal(incidents.length, 2);
    const withTetrahedra = (tetrahedra: CanonicalVolumeComplex['tetrahedra']): CanonicalVolumeComplex => ({ ...base, tetrahedra });
    assertGenerationFailed(() => clipCanonicalVolumeComplex(withTetrahedra(base.tetrahedra.filter((_, index) => index !== incidents[0].index))), /named interface/i);
    assertGenerationFailed(() => clipCanonicalVolumeComplex(withTetrahedra([...base.tetrahedra, incidents[0].tetra])), /named interface/i);
    const flipped = [...base.tetrahedra];
    const target = incidents[0];
    const [a, b, c, d] = target.tetra.vertexIds;
    flipped[target.index] = { ...target.tetra, vertexIds: [a, c, b, d] };
    assertGenerationFailed(() => clipCanonicalVolumeComplex(withTetrahedra(flipped)), /named interface/i);
  });

  await t.test('degenerate source/cut pieces never publish zero area or zero volume', () => {
    assertGenerationFailed(() => clipTetrahedronDeterministically({
      sourceKey: 'flat',
      vertices: [
        pointKey([0, 0, 0], 1, 'a'), pointKey([1, 0, 0], 1, 'b'),
        pointKey([0, 1, 0], 1, 'c'), pointKey([1, 1, 0], 1, 'd'),
      ],
      boundaries: [],
    }), /degenerate/i);
    const result = clip(params());
    assert.ok(result.tetrahedra.every((tetra) => tetra.signedVolume6 > 0));
    assert.ok(result.faces.every((face) => face.area2 > 0));
    assert.equal(result.diagnostics.omittedDegeneratePieces >= 0, true);
  });

  await t.test('U and shell V use exact integer ownership; H=1/V=1 add no unnecessary cut faces', () => {
    const selected = clip(params({ horizontalSplitCount: 8, verticalSplitCount: 3, splitIndex: 14 }));
    assert.ok(selected.tetrahedra.every((tetra) => tetra.sourceUSegment === selected.cell.uSegments.start));
    assert.ok(selected.tetrahedra.filter((tetra) => tetra.region === 'shell').every((tetra) => tetra.sourceVSegment !== null
      && tetra.sourceVSegment >= selected.cell.vSegments.start && tetra.sourceVSegment < selected.cell.vSegments.end));
    assert.ok(selected.tetrahedra.filter((tetra) => tetra.region !== 'shell').every((tetra) => tetra.sourceVSegment === null));

    const noV = clip(params({ verticalSplitCount: 1, splitIndex: 1 }));
    assert.equal(noV.faces.some((face) => face.provenance.kind === 'splitWall' && face.provenance.axis === 'v'), false);
    const noU = clip(params({ horizontalSplitCount: 1, splitIndex: 1 }));
    assert.equal(noU.faces.some((face) => face.provenance.kind === 'splitWall' && face.provenance.axis === 'u'), false);
    const seam = clip(params({ horizontalSplitCount: 8, verticalSplitCount: 1, splitIndex: 8 }));
    assert.deepEqual(new Set(seam.tetrahedra.map((tetra) => tetra.sourceUSegment)), new Set([7]));
  });

  await t.test('identity is behavioral, exact, unrounded, and output ordering is repeatable', () => {
    const nearA = clipTetrahedronDeterministically({
      sourceKey: 'near-a',
      vertices: [
        pointKey([-1, 0, 0], -1, 'a:exact'), pointKey([1, 0, 0], 1, 'b'),
        pointKey([0, 1, 0], 1, 'c'), pointKey([0, 0, 1], 1, 'd'),
      ], boundaries: [{ id: 'v:1/2', scalar: 'plane', keep: 'positive', side: 'lower' }],
    })!;
    const nearB = clipTetrahedronDeterministically({
      sourceKey: 'near-b',
      vertices: [
        pointKey([-1 + 1e-13, 0, 0], -1, 'a:different'), pointKey([1, 0, 0], 1, 'b'),
        pointKey([0, 1, 0], 1, 'c'), pointKey([0, 0, 1], 1, 'd'),
      ], boundaries: [{ id: 'v:1/2', scalar: 'plane', keep: 'positive', side: 'lower' }],
    })!;
    const keysA = new Set(nearA.vertices.map((vertex) => vertex.key));
    const keysB = new Set(nearB.vertices.map((vertex) => vertex.key));
    assert.notDeepEqual(keysB, keysA, 'near coordinates cannot weld different canonical identities');
    const first = clip(params({ splitIndex: 3 }));
    const second = clip(params({ splitIndex: 3 }));
    assert.deepEqual(serialized(second), serialized(first));
    assert.ok(first.vertices.every((vertex) => !/toFixed|rounded|epsilon|tolerance/i.test(vertex.key)));
  });
}
