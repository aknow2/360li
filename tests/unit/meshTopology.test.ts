import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { DEFAULT_PARAMS, type LithophaneParams } from '../../src/domain/params';
import { buildPartSolidComplex, directedTetraFaces, type FaceIntent } from '../../src/lithophane/partSolid';
import {
  classifyTrianglePair,
  collectAabbCandidatePairs,
  chooseMeshIndexArray,
  extractBoundaryMesh,
  validateClosedSolid,
  type ClosedSolidInput,
} from '../../src/lithophane/meshTopology';
import { resolveSplitCell } from '../../src/lithophane/splitCell';
import {
  clipCanonicalVolumeComplex,
  type ClippedVolumeComplex,
  type NamedInterfaceName,
  type PartitionedFace,
  type PartitionedTetrahedron,
  type Position3,
} from '../../src/lithophane/tetraClip';

const INTENTS = {
  outer: Object.freeze({ kind: 'outer', materialIndex: 0, uv: Object.freeze({ kind: 'image' }) }),
  inner: Object.freeze({ kind: 'inner', materialIndex: 1, uv: Object.freeze({ kind: 'neutral' }) }),
  wall: Object.freeze({ kind: 'wall', materialIndex: 2, uv: Object.freeze({ kind: 'neutral' }) }),
} satisfies Record<string, FaceIntent>;

type Surface = { positions: Float32Array; indices: Uint16Array | Uint32Array };
type TetraFixture = readonly [number, number, number, number];

function determinant(a: Position3, b: Position3, c: Position3, d: Position3): number {
  const bax = b[0] - a[0]; const bay = b[1] - a[1]; const baz = b[2] - a[2];
  const cax = c[0] - a[0]; const cay = c[1] - a[1]; const caz = c[2] - a[2];
  const dax = d[0] - a[0]; const day = d[1] - a[1]; const daz = d[2] - a[2];
  return bax * (cay * daz - caz * day) - bay * (cax * daz - caz * dax) + baz * (cax * day - cay * dax);
}

function stableFace(keys: readonly string[]): string {
  return [...keys].sort().join('\u0001');
}

function complexFromTetrahedra(
  points: readonly Position3[],
  tetrahedraInput: readonly TetraFixture[],
  intentForFace: (ids: readonly [number, number, number], points: readonly Position3[]) => FaceIntent = () => INTENTS.wall,
): ClippedVolumeComplex {
  const keys = points.map((_, index) => `v:${index}`);
  const oriented = tetrahedraInput.map((tetra): TetraFixture => determinant(
    points[tetra[0]], points[tetra[1]], points[tetra[2]], points[tetra[3]],
  ) > 0 ? tetra : [tetra[0], tetra[2], tetra[1], tetra[3]]);
  const tetrahedra: PartitionedTetrahedron[] = oriented.map((ids, sourceTetraIndex) => {
    const signedVolume6 = determinant(points[ids[0]], points[ids[1]], points[ids[2]], points[ids[3]]);
    return {
      vertexIds: ids,
      vertexKeys: ids.map((id) => keys[id]) as [string, string, string, string],
      signedVolume6,
      clipSides: Object.freeze([]),
      sourceTetraIndex,
      sourceUSegment: sourceTetraIndex,
      sourceVSegment: 0,
      region: 'shell',
      cellId: `cell:${sourceTetraIndex}`,
      pieceIndex: 0,
    };
  });
  const incidences = new Map<string, { ids: readonly [number, number, number]; tetra: number; order: number }[]>();
  tetrahedra.forEach((tetra, tetraIndex) => directedTetraFaces(tetra.vertexIds).forEach((ids, order) => {
    const key = stableFace(ids.map((id) => keys[id]));
    incidences.set(key, [...(incidences.get(key) ?? []), { ids, tetra: tetraIndex, order }]);
  }));
  const faces: PartitionedFace[] = [];
  for (const [originFaceKey, list] of incidences) if (list.length === 1) {
    const entry = list[0];
    const intent = intentForFace(entry.ids, points);
    const vertexKeys = entry.ids.map((id) => keys[id]) as [string, string, string];
    faces.push({
      vertexIds: entry.ids,
      vertexKeys,
      provenance: { kind: 'original', originFaceKey, surface: intent.kind === 'outer' ? 'shell-outer' : intent.kind === 'inner' ? 'shell-inner' : 'split-or-interior-wall', intent },
      area2: 1,
      sourceTetraIndex: entry.tetra,
      order: entry.order,
    });
  }
  const vertices = points.map((position, id) => ({
    id,
    key: keys[id],
    position,
    float32Position: [...new Float32Array(position)] as unknown as Position3,
    lineage: { kind: 'canonical' as const },
  }));
  const params = { ...DEFAULT_PARAMS, widthSegments: 8, heightSegments: 4, horizontalSplitCount: 1, verticalSplitCount: 1, splitIndex: 1 };
  return {
    positions: new Float64Array(points.flat()),
    vertices,
    faces,
    tetrahedra,
    cell: resolveSplitCell(params),
    diagnostics: {
      namedInterfaces: {
        shellCollar: { retained: 0, valid: true },
        collarTaper: { retained: 0, valid: true },
        taperTube: { retained: 0, valid: true },
      },
      omittedDegeneratePieces: 0,
    },
  };
}

function tetraComplex(): ClippedVolumeComplex {
  return complexFromTetrahedra([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]], [[0, 1, 2, 3]], (face) => (
    face.includes(0) ? INTENTS.wall : INTENTS.outer
  ));
}

function boundaryOrderingComplex(): ClippedVolumeComplex {
  const base = complexFromTetrahedra(
    [[0, 0, 0], [2, 0, 0], [0, 2, 0], [0, 0, 2], [0, 0, -2]],
    [[0, 1, 2, 3], [0, 2, 1, 4]],
  );
  const sourceTetraIndices = [0, 10];
  const tetrahedra = base.tetrahedra.map((tetra, index) => ({
    ...tetra,
    cellId: 'cell:shared',
    sourceTetraIndex: sourceTetraIndices[index],
    sourceUSegment: sourceTetraIndices[index],
  }));
  const boundaryIdByFace = new Map<string, string>([
    ['v:0\u0001v:2\u0001v:3', 'beta'],
    ['v:0\u0001v:1\u0001v:4', 'beta'],
    ['v:1\u0001v:2\u0001v:3', 'zeta'],
    ['v:0\u0001v:1\u0001v:3', 'zeta'],
    ['v:1\u0001v:2\u0001v:4', 'alpha'],
    ['v:0\u0001v:2\u0001v:4', 'alpha'],
  ]);
  const faces = base.faces.map((face) => {
    const stable = stableFace(face.vertexKeys);
    const boundaryId = boundaryIdByFace.get(stable);
    if (boundaryId === undefined) throw new Error(`missing boundary ID for ${stable}`);
    return {
      ...face,
      sourceTetraIndex: sourceTetraIndices[face.sourceTetraIndex],
      provenance: {
        kind: 'original' as const,
        surface: 'shell-outer' as const,
        intent: INTENTS.outer,
        originFaceKey: boundaryId,
      },
    };
  });
  return { ...base, tetrahedra, faces };
}

function tubeComplex(segments = 8, height = 2): ClippedVolumeComplex {
  const points: Position3[] = [];
  for (const z of [0, height]) for (const radius of [1, 2]) for (let i = 0; i < segments; i += 1) {
    const angle = i * Math.PI * 2 / segments;
    points.push([radius * Math.cos(angle), radius * Math.sin(angle), z]);
  }
  const id = (z: number, radius: number, i: number) => z * segments * 2 + radius * segments + (i % segments);
  const tetrahedra: TetraFixture[] = [];
  for (let i = 0; i < segments; i += 1) {
    const next = (i + 1) % segments;
    for (const triangle of [
      [id(1, 0, i), id(1, 0, next), id(1, 1, next), id(0, 0, i), id(0, 0, next), id(0, 1, next)],
      [id(1, 0, i), id(1, 1, next), id(1, 1, i), id(0, 0, i), id(0, 1, next), id(0, 1, i)],
    ] as const) {
      tetrahedra.push([triangle[0], triangle[1], triangle[5], triangle[2]]);
      tetrahedra.push([triangle[0], triangle[1], triangle[4], triangle[5]]);
      tetrahedra.push([triangle[0], triangle[3], triangle[5], triangle[4]]);
    }
  }
  return complexFromTetrahedra(points, tetrahedra, (face, allPoints) => {
    const radii = face.map((vertex) => Math.hypot(allPoints[vertex][0], allPoints[vertex][1]));
    if (radii.every((radius) => Math.abs(radius - 2) < 1e-6)) return INTENTS.outer;
    if (radii.every((radius) => Math.abs(radius - 1) < 1e-6)) return INTENTS.inner;
    return INTENTS.wall;
  });
}

function surface(points: readonly Position3[], triangles: readonly (readonly [number, number, number])[]): Surface {
  return { positions: new Float32Array(points.flat()), indices: chooseMeshIndexArray(points.length, triangles.flat()) };
}

function tetraSurface(offset: Position3 = [0, 0, 0]): Surface {
  const points = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]].map((p) => (
    [p[0] + offset[0], p[1] + offset[1], p[2] + offset[2]] as Position3
  ));
  return surface(points, [[1, 2, 3], [0, 3, 2], [0, 1, 3], [0, 2, 1]]);
}

function expectGenerationFailed(run: () => unknown, pattern: RegExp): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal((error as Error & { code?: string }).code, 'GENERATION_FAILED');
    assert.match(error.message, pattern);
    return true;
  });
}

function params(overrides: Partial<LithophaneParams>): LithophaneParams {
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

function image(): ImageData {
  const data = new Uint8ClampedArray(9 * 7 * 4);
  for (let i = 0; i < 9 * 7; i += 1) {
    data[i * 4] = (i * 17 + 11) % 256;
    data[i * 4 + 1] = (i * 31 + 23) % 256;
    data[i * 4 + 2] = (i * 47 + 37) % 256;
    data[i * 4 + 3] = 255;
  }
  return { width: 9, height: 7, data } as ImageData;
}

function serializeMesh(mesh: ReturnType<typeof extractBoundaryMesh>): Uint8Array {
  const metadata = new TextEncoder().encode(JSON.stringify({
    groups: mesh.groups,
    stableVertexKeys: mesh.stableVertexKeys,
    triangles: mesh.triangles,
    counts: mesh.counts,
    diagnostics: mesh.diagnostics,
  }));
  const result = new Uint8Array(mesh.positions.byteLength + mesh.indices.byteLength + metadata.byteLength);
  result.set(new Uint8Array(mesh.positions.buffer, mesh.positions.byteOffset, mesh.positions.byteLength));
  result.set(new Uint8Array(mesh.indices.buffer, mesh.indices.byteOffset, mesh.indices.byteLength), mesh.positions.byteLength);
  result.set(metadata, mesh.positions.byteLength + mesh.indices.byteLength);
  return result;
}

function withNamedInterface(
  name: NamedInterfaceName,
  mode: 'valid' | 'missing' | 'multiply' | 'same-directed',
): ClippedVolumeComplex {
  const base = complexFromTetrahedra(
    [[0, 0, 0], [2, 0, 0], [0, 2, 0], [0, 0, 2], [0, 0, -2]],
    [[0, 1, 2, 3], [0, 2, 1, 4]],
  );
  const shared = new Set(['v:0', 'v:1', 'v:2']);
  const incidences = base.tetrahedra.flatMap((tetra) => directedTetraFaces(tetra.vertexIds).map((ids, order) => ({ tetra, ids, order })))
    .filter(({ ids }) => ids.every((id) => shared.has(base.vertices[id].key)));
  assert.equal(incidences.length, 2);
  const makeFace = (entry: typeof incidences[number], reverse = false): PartitionedFace => {
    const vertexIds = (reverse ? [entry.ids[0], entry.ids[2], entry.ids[1]] : entry.ids) as [number, number, number];
    const vertexKeys = vertexIds.map((id) => base.vertices[id].key) as [string, string, string];
    return {
      vertexIds,
      vertexKeys,
      provenance: { kind: 'namedInterface', originFaceKey: stableFace(vertexKeys), name },
      area2: 4,
      sourceTetraIndex: entry.tetra.sourceTetraIndex,
      order: entry.order,
    };
  };
  const pair = [makeFace(incidences[0]), makeFace(incidences[1], mode === 'same-directed')];
  const namedFaces = mode === 'missing' ? pair.slice(0, 1) : mode === 'multiply' ? [...pair, pair[0]] : pair;
  return {
    ...base,
    faces: [...base.faces, ...namedFaces],
    diagnostics: {
      ...base.diagnostics,
      namedInterfaces: {
        ...base.diagnostics.namedInterfaces,
        [name]: { retained: 1, valid: true },
      },
    },
  };
}

function octahedron(points: readonly Position3[]): Surface {
  return surface(points, [
    [0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4],
    [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5],
  ]);
}

function classifyPair(
  points: readonly Position3[],
  left: readonly [number, number, number],
  right: readonly [number, number, number],
  scale = 1,
): ReturnType<typeof classifyTrianglePair> {
  return classifyTrianglePair(
    new Float32Array(points.flatMap((point) => point.map((coordinate) => coordinate * scale))),
    left,
    right,
  );
}

function bruteForceAabbPairs(input: ClosedSolidInput): string[] {
  const bounds = Array.from({ length: input.indices.length / 3 }, (_, triangle) => {
    const points = [0, 1, 2].map((corner) => {
      const vertex = input.indices[triangle * 3 + corner];
      return [input.positions[vertex * 3], input.positions[vertex * 3 + 1], input.positions[vertex * 3 + 2]] as Position3;
    });
    return {
      min: [0, 1, 2].map((axis) => Math.min(...points.map((point) => point[axis]))),
      max: [0, 1, 2].map((axis) => Math.max(...points.map((point) => point[axis]))),
    };
  });
  const result: string[] = [];
  for (let left = 0; left < bounds.length; left += 1) for (let right = left + 1; right < bounds.length; right += 1) {
    if ([0, 1, 2].every((axis) => bounds[left].max[axis] >= bounds[right].min[axis]
      && bounds[right].max[axis] >= bounds[left].min[axis])) result.push(`${left}:${right}`);
  }
  return result;
}

export async function registerTests(t: TestContext): Promise<void> {
  await t.test('closed outward tetrahedron extracts exact groups, counts, positive volume, and deterministic bytes', () => {
    const first = extractBoundaryMesh(tetraComplex());
    const second = extractBoundaryMesh(tetraComplex());
    assert.ok(first.positions instanceof Float32Array);
    assert.ok(first.indices instanceof Uint16Array);
    assert.deepEqual(first.groups, [
      { start: 0, count: 3, materialIndex: 0 },
      { start: 3, count: 0, materialIndex: 1 },
      { start: 3, count: 9, materialIndex: 2 },
    ]);
    assert.deepEqual(first.counts, { vertices: 4, triangles: 4, outerTriangles: 1, innerTriangles: 0, wallTriangles: 3 });
    assert.ok(first.diagnostics.signedVolume > 0);
    assert.deepEqual(serializeMesh(second), serializeMesh(first));
  });

  await t.test('connected closed annular tube is accepted with outer, inner, and wall groups', () => {
    const mesh = extractBoundaryMesh(tubeComplex());
    assert.deepEqual(mesh.counts, { vertices: 32, triangles: 64, outerTriangles: 16, innerTriangles: 16, wallTriangles: 32 });
    assert.deepEqual(mesh.groups.map((group) => group.materialIndex), [0, 1, 2]);
    assert.ok(mesh.groups.every((group) => group.count > 0));
    assert.equal(mesh.diagnostics.connectedComponents, 1);
    assert.ok(mesh.diagnostics.signedVolume > 0);
  });

  await t.test('representative real T5.1 outward and inward split parts extract deterministically with all material groups', () => {
    for (const thicknessDirection of ['outward', 'inward'] as const) {
      const p = params({ thicknessDirection, splitIndex: 1 });
      const clipped = clipCanonicalVolumeComplex(buildPartSolidComplex(image(), p, resolveSplitCell(p)));
      const first = extractBoundaryMesh(clipped);
      const second = extractBoundaryMesh(clipped);
      assert.ok(first.counts.outerTriangles > 0);
      assert.ok(first.counts.innerTriangles > 0);
      assert.ok(first.counts.wallTriangles > 0);
      assert.equal(first.diagnostics.connectedComponents, 1);
      assert.ok(first.diagnostics.signedVolume > 0);
      assert.deepEqual(serializeMesh(second), serializeMesh(first));
    }
  });

  await t.test('open, duplicate, same-winding, non-manifold, disconnected, and zero-area surfaces fail specifically', () => {
    const valid = tetraSurface();
    expectGenerationFailed(() => validateClosedSolid({ ...valid, indices: valid.indices.slice(0, 9) }), /open edge/i);
    expectGenerationFailed(() => validateClosedSolid({ ...valid, indices: chooseMeshIndexArray(4, [...valid.indices, 1, 2, 3]) }), /duplicate/i);
    expectGenerationFailed(() => validateClosedSolid(surface(
      [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]],
      [[1, 2, 3], [0, 2, 3], [0, 1, 3], [0, 2, 1]],
    )), /same winding/i);
    expectGenerationFailed(() => validateClosedSolid(surface(
      [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [0, -1, 0]],
      [[1, 2, 3], [0, 3, 2], [0, 1, 3], [0, 2, 1], [0, 1, 4]],
    )), /non-manifold/i);
    const other = tetraSurface([3, 0, 0]);
    const disconnected: ClosedSolidInput = {
      positions: new Float32Array([...valid.positions, ...other.positions]),
      indices: chooseMeshIndexArray(8, [...valid.indices, ...[...other.indices].map((index) => index + 4)]),
    };
    expectGenerationFailed(() => validateClosedSolid(disconnected), /connected component/i);
    expectGenerationFailed(() => validateClosedSolid(surface(
      [[0, 0, 0], [1, 0, 0], [2, 0, 0], [0, 0, 1]],
      [[1, 2, 3], [0, 3, 2], [0, 1, 3], [0, 2, 1]],
    )), /zero-area/i);
  });

  await t.test('non-positive and zero signed volume fail after closed topology checks', () => {
    const valid = tetraSurface();
    const reversed = [] as number[];
    for (let i = 0; i < valid.indices.length; i += 3) reversed.push(valid.indices[i], valid.indices[i + 2], valid.indices[i + 1]);
    expectGenerationFailed(() => validateClosedSolid({ positions: valid.positions, indices: chooseMeshIndexArray(4, reversed) }), /positive.*volume/i);
    const flat = surface([[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]], [[1, 2, 3], [0, 3, 2], [0, 1, 3], [0, 2, 1]]);
    expectGenerationFailed(() => validateClosedSolid(flat), /zero-area|positive.*volume/i);
    const belowVolumeGate = surface(
      [[0, 0, 0], [1e-9, 0, 0], [0, 1e-9, 0], [0, 0, 1e-9]],
      [[1, 2, 3], [0, 3, 2], [0, 1, 3], [0, 2, 1]],
    );
    expectGenerationFailed(() => validateClosedSolid(belowVolumeGate), /positive.*volume/i);
  });

  await t.test('connected proper crossing and coplanar overlap are rejected, while exact neighbor loci are accepted', () => {
    validateClosedSolid(tetraSurface());
    validateClosedSolid(octahedron([
      [-2, 0, 0], [2, 0, 0], [0, -2, 0], [0, 2, 0], [0, 0, 2], [0, 0, -2],
    ]));
    const crossing = octahedron([
      [-1.7399343624711037, 0.6995796775445342, 0.8070367071777582],
      [1.7192869493737817, 1.053678285330534, -1.2078383015468717],
      [-0.10461041517555714, -1.7070482028648257, 0.5343983173370361],
      [0.303437321446836, -0.04824681393802166, 0.9163017058745027],
      [0.04124264791607857, -1.6372055979445577, -0.7036467734724283],
      [-0.7013423023745418, -0.8515880927443504, -0.725803398527205],
    ]);
    expectGenerationFailed(() => validateClosedSolid(crossing), /intersection|crossing/i);
    const overlap = octahedron([
      [-2, 0, 0], [2, 0, 0], [0, -2, 0], [0, 2, 0], [3, 0, 0], [0, 0, -2],
    ]);
    expectGenerationFailed(() => validateClosedSolid(overlap), /coplanar overlap/i);
  });

  await t.test('triangle pairs distinguish zero-area coplanar contacts from legal exact neighbor loci', () => {
    const vertexOnEdge = [
      [0, 0, 0], [2, 0, 0], [0, 1, 0],
      [1, 0, 0], [2, -1, 0], [0, -1, 0],
    ] as const;
    assert.equal(classifyPair(vertexOnEdge, [0, 1, 2], [3, 4, 5]), 'coplanar contact');

    const collinearEdgeOverlap = [
      [0, 0, 0], [2, 0, 0], [0, 1, 0],
      [1, 0, 0], [3, 0, 0], [1, -1, 0],
    ] as const;
    assert.equal(classifyPair(collinearEdgeOverlap, [0, 1, 2], [3, 4, 5]), 'coplanar contact');

    const legalVertex = [[0, 0, 0], [2, 0, 0], [0, 1, 0], [-1, 0, 0], [0, -1, 0]] as const;
    assert.equal(classifyPair(legalVertex, [0, 1, 2], [0, 3, 4]), null);
    const legalEdge = [[0, 0, 0], [2, 0, 0], [0, 1, 0], [0, -1, 0]] as const;
    assert.equal(classifyPair(legalEdge, [0, 1, 2], [1, 0, 3]), null);
    const weldedVertex = [[0, 0, 0], [2, 0, 0], [0, 1, 0], [0, 0, 0], [-1, 0, 0], [0, -1, 0]] as const;
    assert.equal(classifyPair(weldedVertex, [0, 1, 2], [3, 4, 5]), null);
    const weldedEdge = [[0, 0, 0], [2, 0, 0], [0, 1, 0], [2, 0, 0], [0, 0, 0], [0, -1, 0]] as const;
    assert.equal(classifyPair(weldedEdge, [0, 1, 2], [3, 4, 5]), null);

    const beyondSharedVertex = [[0, 0, 0], [2, 0, 0], [0, 2, 0], [0.5, 0.5, -1], [0.5, 0.5, 1]] as const;
    assert.equal(classifyPair(beyondSharedVertex, [0, 1, 2], [0, 3, 4]), 'proper intersection');

    expectGenerationFailed(
      () => classifyTrianglePair(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, Number.NaN]), [0, 1, 2], [0, 2, 1]),
      /nonfinite/i,
    );
    expectGenerationFailed(
      () => classifyTrianglePair(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), [0, 1, 3], [0, 2, 1]),
      /index/i,
    );
  });

  await t.test('triangle pair classifications are invariant across approved model scales', () => {
    const valid = [[0, 0, 0], [2, 0, 0], [0, 1, 0], [0, -1, 0]] as const;
    const contact = [[0, 0, 0], [2, 0, 0], [0, 1, 0], [1, 0, 0], [2, -1, 0], [0, -1, 0]] as const;
    const overlap = [[0, 0, 0], [2, 0, 0], [0, 2, 0], [0.25, 0.25, 0], [1, 0.25, 0], [0.25, 1, 0]] as const;
    const proper = [[0, 0, 0], [2, 0, 0], [0, 2, 0], [0.5, 0.5, -1], [0.5, 0.5, 1], [1.5, 0.5, 0]] as const;
    for (const scale of [1e-2, 1, 1e4]) {
      assert.equal(classifyPair(valid, [0, 1, 2], [1, 0, 3], scale), null);
      assert.equal(classifyPair(contact, [0, 1, 2], [3, 4, 5], scale), 'coplanar contact');
      assert.equal(classifyPair(overlap, [0, 1, 2], [3, 4, 5], scale), 'coplanar overlap');
      assert.equal(classifyPair(proper, [0, 1, 2], [3, 4, 5], scale), 'proper intersection');
    }
  });

  await t.test('BVH candidate traversal exactly matches brute-force AABB pairs on deterministic small sets', () => {
    const fixtures = [
      surface(
        [[0, 0, 0], [2, 0, 0], [0, 2, 0], [1, 1, -1], [1, 1, 1], [3, 1, 0], [5, 0, 0], [6, 0, 0], [5, 1, 0]],
        [[0, 1, 2], [3, 4, 5], [6, 7, 8]],
      ),
      surface(
        [[-2, -2, 0], [0, -2, 0], [-2, 0, 0], [-1, -1, 0], [1, -1, 0], [-1, 1, 0], [0, 0, 0], [2, 0, 0], [0, 2, 0], [3, 3, 0], [4, 3, 0], [3, 4, 0]],
        [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11]],
      ),
    ];
    for (const fixture of fixtures) {
      const actual = collectAabbCandidatePairs(fixture).map(([left, right]) => `${left}:${right}`);
      assert.deepEqual([...actual].sort(), bruteForceAabbPairs(fixture).sort());
      assert.equal(new Set(actual).size, actual.length);
      assert.deepEqual(collectAabbCandidatePairs(fixture), collectAabbCandidatePairs(fixture));
    }
  });

  await t.test('missing, multiply-owned, same-directed, and surviving interior provenance fail recoverably', () => {
    const missing = tetraComplex();
    expectGenerationFailed(() => extractBoundaryMesh({ ...missing, faces: missing.faces.slice(1) }), /missing.*provenance/i);
    expectGenerationFailed(() => extractBoundaryMesh({ ...missing, faces: [...missing.faces, missing.faces[0]] }), /ambiguous.*provenance/i);
    expectGenerationFailed(() => extractBoundaryMesh({
      ...missing,
      faces: missing.faces.map((face, index) => index === 0 ? { ...face, provenance: { kind: 'interior', originFaceKey: stableFace(face.vertexKeys) } } : face),
    }), /surviving interior/i);
    for (const name of ['shellCollar', 'collarTaper', 'taperTube'] as const) {
      expectGenerationFailed(() => extractBoundaryMesh(withNamedInterface(name, 'missing')), new RegExp(name, 'i'));
      expectGenerationFailed(() => extractBoundaryMesh(withNamedInterface(name, 'multiply')), new RegExp(name, 'i'));
      expectGenerationFailed(() => extractBoundaryMesh(withNamedInterface(name, 'same-directed')), new RegExp(name, 'i'));
      assert.ok(extractBoundaryMesh(withNamedInterface(name, 'valid')).diagnostics.signedVolume > 0);
    }
  });

  await t.test('internal and named-interface provenance must name the tetra that actually owns each directed face', () => {
    const named = withNamedInterface('shellCollar', 'valid');
    const namedIndex = named.faces.findIndex((face) => face.provenance.kind === 'namedInterface');
    assert.notEqual(namedIndex, -1);
    const malformedNamed = named.faces.map((face, index) => index === namedIndex
      ? { ...face, sourceTetraIndex: face.sourceTetraIndex === 0 ? 1 : 0 }
      : face);
    expectGenerationFailed(() => extractBoundaryMesh({ ...named, faces: malformedNamed }), /provenance source mismatch.*shellCollar/i);

    const base = complexFromTetrahedra(
      [[0, 0, 0], [2, 0, 0], [0, 2, 0], [0, 0, 2], [0, 0, -2]],
      [[0, 1, 2, 3], [0, 2, 1, 4]],
    );
    const shared = new Set(['v:0', 'v:1', 'v:2']);
    const incidents = base.tetrahedra.flatMap((tetra) => directedTetraFaces(tetra.vertexIds)
      .map((ids, order) => ({ tetra, ids, order })))
      .filter(({ ids }) => ids.every((id) => shared.has(base.vertices[id].key)));
    const interiorFaces = incidents.map((entry): PartitionedFace => ({
      vertexIds: entry.ids,
      vertexKeys: entry.ids.map((id) => base.vertices[id].key) as [string, string, string],
      provenance: { kind: 'interior', originFaceKey: stableFace(entry.ids.map((id) => base.vertices[id].key)) },
      area2: 4,
      sourceTetraIndex: entry.tetra.sourceTetraIndex,
      order: entry.order,
    }));
    const malformedInterior = interiorFaces.map((face, index) => index === 0
      ? { ...face, sourceTetraIndex: face.sourceTetraIndex === 0 ? 1 : 0 }
      : face);
    expectGenerationFailed(
      () => extractBoundaryMesh({ ...base, faces: [...base.faces, ...malformedInterior] }),
      /provenance source mismatch/i,
    );
  });

  await t.test('Float32-bit welding joins coordinate-identical keys, but one-ULP-near positions remain open', () => {
    const base = tetraSurface();
    const duplicatedPositions = new Float32Array(12 * 3);
    const duplicatedIndices: number[] = [];
    for (let triangle = 0; triangle < 4; triangle += 1) for (let corner = 0; corner < 3; corner += 1) {
      const source = base.indices[triangle * 3 + corner];
      const target = triangle * 3 + corner;
      duplicatedPositions.set(base.positions.slice(source * 3, source * 3 + 3), target * 3);
      duplicatedIndices.push(target);
    }
    assert.equal(validateClosedSolid({ positions: duplicatedPositions, indices: new Uint16Array(duplicatedIndices) }).weldedVertexCount, 4);
    const near = duplicatedPositions.slice();
    const view = new DataView(near.buffer);
    const offset = duplicatedIndices.findIndex((_, index) => index > 0 && near[index * 3] === 1) * 12;
    view.setUint32(offset, view.getUint32(offset, true) + 1, true);
    expectGenerationFailed(() => validateClosedSolid({ positions: near, indices: new Uint16Array(duplicatedIndices) }), /open edge/i);
  });

  await t.test('index width threshold and deterministic material/source/provenance sort are exact', () => {
    assert.ok(chooseMeshIndexArray(65_535, [0, 65_534]) instanceof Uint16Array);
    assert.ok(chooseMeshIndexArray(65_536, [0, 65_535]) instanceof Uint32Array);
    const mesh = extractBoundaryMesh(tubeComplex(12));
    assert.deepEqual(mesh.triangles.map((triangle) => triangle.materialIndex), [...mesh.triangles].map((triangle) => triangle.materialIndex).sort());
    for (let i = 1; i < mesh.groups.length; i += 1) assert.equal(mesh.groups[i].start, mesh.groups[i - 1].start + mesh.groups[i - 1].count);
    assert.deepEqual(serializeMesh(extractBoundaryMesh(tubeComplex(12))), serializeMesh(mesh));
  });

  await t.test('retained faces sort by boundary key then stable face key before source provenance', () => {
    const mesh = extractBoundaryMesh(boundaryOrderingComplex());
    assert.deepEqual(mesh.triangles.map((triangle) => triangle.boundaryKey), [
      'shell-outer:alpha',
      'shell-outer:alpha',
      'shell-outer:beta',
      'shell-outer:beta',
      'shell-outer:zeta',
      'shell-outer:zeta',
    ]);
    assert.deepEqual(
      mesh.triangles.filter((triangle) => triangle.boundaryKey === 'shell-outer:beta').map((triangle) => triangle.stableFaceKey),
      ['v:0\u0001v:1\u0001v:4', 'v:0\u0001v:2\u0001v:3'],
    );
  });

  await t.test('deterministic balanced longest-axis BVH avoids adversarial active-list quadratic work', () => {
    const first = extractBoundaryMesh(tubeComplex(256, 100));
    const second = extractBoundaryMesh(tubeComplex(256, 100));
    const mesh = first;
    const allPairs = mesh.counts.triangles * (mesh.counts.triangles - 1) / 2;
    assert.equal(mesh.diagnostics.broadPhase, 'longest-axis-bvh');
    assert.equal(mesh.diagnostics.bvhLeafCount, mesh.counts.triangles);
    assert.equal(mesh.diagnostics.bvhNodeCount, mesh.counts.triangles * 2 - 1);
    assert.ok(mesh.diagnostics.bvhMaxDepth <= Math.ceil(Math.log2(mesh.counts.triangles)) + 1);
    assert.deepEqual(second.diagnostics, first.diagnostics);
    assert.ok(mesh.diagnostics.intersectionCandidates > 0);
    assert.ok(mesh.diagnostics.intersectionCandidates < allPairs / 20, `${mesh.diagnostics.intersectionCandidates} vs ${allPairs}`);
    assert.ok(mesh.diagnostics.broadPhaseNodePairsTested < allPairs / 8,
      `${mesh.diagnostics.broadPhaseNodePairsTested} BVH node pairs vs ${allPairs} triangle pairs`);
    assert.equal(mesh.diagnostics.intersectionPairsTested, mesh.diagnostics.intersectionCandidates);
  });
}
