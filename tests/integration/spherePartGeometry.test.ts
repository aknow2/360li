import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { DEFAULT_PARAMS, type LithophaneParams } from '../../src/domain/params';
import { generateSphereLithophane } from '../../src/lithophane/sphereLithophane';
import {
  buildPartSolidComplex,
  directedTetraFaces,
  type CanonicalVolumeComplex,
  type DirectedFace,
} from '../../src/lithophane/partSolid';
import { resolveSplitCell } from '../../src/lithophane/splitCell';

type Point = readonly [number, number, number];
type StandScalars = {
  theta: number; s: number; y0: number; delta: number; halfDelta: number;
  q: number; w: number; h: number; tau: readonly number[]; tauMin: number; j: number;
  Yradial: number; YcutMin: number; Yc: number; Ys: number; Yb: number;
};
type StandDiagnostics = {
  enabled: boolean;
  scalars: StandScalars | null;
  float64Rings: Readonly<Record<string, Float64Array>>;
  float32Rings: Readonly<Record<string, Float32Array>>;
};
type CellDiagnostic = {
  id: string;
  region: string;
  sourceUSegment: number;
  tetraIndices: readonly number[];
  tetraVolume: number;
  boundaryVolume: number;
};

function image(width = 11, height = 7): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = (17 + x * 37 + y * 19) % 256;
      data[offset + 1] = (29 + x * 11 + y * 53) % 256;
      data[offset + 2] = (43 + x * 71 + y * 7) % 256;
      data[offset + 3] = 255;
    }
  }
  return { width, height, data } as ImageData;
}

function params(overrides: Partial<LithophaneParams> = {}): LithophaneParams {
  return {
    ...DEFAULT_PARAMS,
    widthSegments: 8,
    heightSegments: 6,
    horizontalSplitCount: 2,
    verticalSplitCount: 1,
    splitIndex: 1,
    holeDiameterMm: 30,
    standWallThicknessMm: 3,
    ...overrides,
  };
}

function build(p: LithophaneParams, pixels = image()): CanonicalVolumeComplex {
  return buildPartSolidComplex(pixels, p, resolveSplitCell(p));
}

function point(complex: CanonicalVolumeComplex, id: number): Point {
  return [complex.positions[id * 3], complex.positions[id * 3 + 1], complex.positions[id * 3 + 2]];
}

function determinant(a: Point, b: Point, c: Point, d: Point): number {
  const bax = b[0] - a[0]; const bay = b[1] - a[1]; const baz = b[2] - a[2];
  const cax = c[0] - a[0]; const cay = c[1] - a[1]; const caz = c[2] - a[2];
  const dax = d[0] - a[0]; const day = d[1] - a[1]; const daz = d[2] - a[2];
  return bax * (cay * daz - caz * day) - bay * (cax * daz - caz * dax) + baz * (cax * day - cay * dax);
}

function faceKey(face: DirectedFace): string {
  return [...face].sort((a, b) => a - b).join(':');
}

function sameCycle(a: DirectedFace, b: DirectedFace): boolean {
  return (a[0] === b[0] && a[1] === b[1] && a[2] === b[2])
    || (a[0] === b[1] && a[1] === b[2] && a[2] === b[0])
    || (a[0] === b[2] && a[1] === b[0] && a[2] === b[1]);
}

function opposite(a: DirectedFace, b: DirectedFace): boolean {
  return sameCycle(a, [b[0], b[2], b[1]]);
}

function incidences(complex: CanonicalVolumeComplex): Map<string, DirectedFace[]> {
  const result = new Map<string, DirectedFace[]>();
  for (const tetra of complex.tetrahedra) {
    for (const face of directedTetraFaces(tetra.vertexIds)) {
      const key = faceKey(face);
      const list = result.get(key) ?? [];
      list.push(face);
      result.set(key, list);
    }
  }
  return result;
}

function stand(complex: CanonicalVolumeComplex): StandDiagnostics {
  return (complex.diagnostics as unknown as { stand: StandDiagnostics }).stand;
}

function cells(complex: CanonicalVolumeComplex): readonly CellDiagnostic[] {
  return (complex.diagnostics as unknown as { cells: readonly CellDiagnostic[] }).cells;
}

function ringId(complex: CanonicalVolumeComplex, kind: string, u: number): number {
  const ids = complex.canonicalIds as unknown as { ring(kind: string, uGrid: number): number };
  return ids.ring(kind, u);
}

function assertConforming(complex: CanonicalVolumeComplex): void {
  assert.ok(complex.positions instanceof Float64Array);
  assert.equal(complex.positions.length, complex.vertices.length * 3);
  for (const coordinate of complex.positions) assert.ok(Number.isFinite(coordinate));
  for (const tetra of complex.tetrahedra) {
    const raw = determinant(...tetra.vertexIds.map((id) => point(complex, id)) as [Point, Point, Point, Point]);
    assert.equal(raw, tetra.signedVolume6, `stored determinant differs for ${tetra.vertexIds.join(':')}`);
    assert.ok(raw > 0, `non-positive prescribed determinant ${raw} for ${tetra.vertexIds.join(':')}`);
  }
  for (const [key, faces] of incidences(complex)) {
    assert.ok(faces.length === 1 || faces.length === 2, `${key} has ${faces.length} incidents`);
    if (faces.length === 2) assert.ok(opposite(faces[0], faces[1]), `${key} does not cancel`);
  }
  assert.deepEqual(complex.diagnostics.provenanceConflicts, []);
}

function assertScaleClose(actual: number, expected: number, scale: number, message?: string): void {
  assert.ok(Math.abs(actual - expected) <= Math.max(1, scale) * 2e-12, message ?? `${actual} != ${expected}`);
}

function tetraInteriorsOverlap(left: readonly Point[], right: readonly Point[]): boolean {
  const faces = [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]] as const;
  const edges = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]] as const;
  const subtract = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a: Point, b: Point): Point => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const axes: Point[] = [];
  for (const tetra of [left, right]) for (const [a, b, c] of faces) axes.push(cross(subtract(tetra[b], tetra[a]), subtract(tetra[c], tetra[a])));
  for (const [a, b] of edges) for (const [c, d] of edges) axes.push(cross(subtract(left[b], left[a]), subtract(right[d], right[c])));
  const scale = Math.max(1, ...left.flatMap((p) => p.map(Math.abs)), ...right.flatMap((p) => p.map(Math.abs)));
  const tolerance = scale * scale * 2e-12;
  for (const axis of axes) {
    const length = Math.hypot(...axis);
    if (length <= tolerance) continue;
    const project = (tetra: readonly Point[]) => tetra.map((p) => p[0] * axis[0] + p[1] * axis[1] + p[2] * axis[2]);
    const a = project(left); const b = project(right);
    if (Math.max(...a) <= Math.min(...b) + tolerance || Math.max(...b) <= Math.min(...a) + tolerance) return false;
  }
  return true;
}

function assertCellVolumes(complex: CanonicalVolumeComplex): void {
  for (const cell of cells(complex)) {
    const sum = cell.tetraIndices.reduce((value, index) => value + complex.tetrahedra[index].signedVolume6 / 6, 0);
    assertScaleClose(cell.tetraVolume, sum, Math.abs(sum), `${cell.id} tetra sum`);
    assertScaleClose(cell.boundaryVolume, sum, Math.abs(sum), `${cell.id} boundary volume`);
    assert.ok(sum > 0);
    if (cell.region !== 'shell') assert.equal(cell.tetraIndices.length, 3, `${cell.id} staircase size`);
  }
}

function assertNamedInterfaces(complex: CanonicalVolumeComplex): void {
  const named = (complex.diagnostics.interfaces as unknown as Record<string, readonly string[]>);
  assert.deepEqual(Object.keys(named).sort(), ['collarTaper', 'shellCollar', 'taperTube']);
  const all = incidences(complex);
  for (const [name, keys] of Object.entries(named)) {
    assert.equal(keys.length, complex.cell.uSegments.count * 2, `${name} triangle count`);
    for (const key of keys) {
      const pair = all.get(key);
      assert.equal(pair?.length, 2, `${name}/${key} incidence`);
      assert.ok(pair && opposite(pair[0], pair[1]), `${name}/${key} winding`);
    }
  }
}

function assertCellsDoNotOverlap(complex: CanonicalVolumeComplex, selectedCells = cells(complex)): void {
  const cellTetra = new Map(selectedCells.map((cell) => [cell.id, new Set(cell.tetraIndices)]));
  let comparedSiblings = false;
  let comparedCrossLayer = false;
  for (let a = 0; a < selectedCells.length; a += 1) for (let b = a + 1; b < selectedCells.length; b += 1) {
    const leftCell = selectedCells[a]; const rightCell = selectedCells[b];
    const left = cellTetra.get(leftCell.id)!; const right = cellTetra.get(rightCell.id)!;
    assert.equal([...left].some((index) => right.has(index)), false, 'siblings cannot share volume tetra identity');
    if (leftCell.region === rightCell.region) comparedSiblings = true;
    else comparedCrossLayer = true;
    for (const leftIndex of left) for (const rightIndex of right) {
      const leftPoints = complex.tetrahedra[leftIndex].vertexIds.map((id) => point(complex, id));
      const rightPoints = complex.tetrahedra[rightIndex].vertexIds.map((id) => point(complex, id));
      assert.equal(tetraInteriorsOverlap(leftPoints, rightPoints), false, `${leftCell.id} overlaps ${rightCell.id}`);
    }
  }
  assert.ok(comparedSiblings, 'coordinate SAT must compare sibling cells');
  assert.ok(comparedCrossLayer, 'coordinate SAT must compare cross-layer cells');
}

function assertOneSectorStandCellsDoNotOverlap(complex: CanonicalVolumeComplex): void {
  const sourceU = complex.cell.uSegments.start;
  const selected = cells(complex).filter((cell) => cell.region !== 'shell' && cell.sourceUSegment === sourceU);
  assert.equal(selected.length, 6, `expected two cells in each stand layer at u${sourceU}`);
  assert.deepEqual(new Set(selected.map((cell) => cell.region)), new Set(['collar', 'taper', 'tube']));
  assertCellsDoNotOverlap(complex, selected);
}

export async function registerTests(t: TestContext): Promise<void> {
  await t.test('preserves exact sampled I/O and actual tau_k with one topology outward and inward', () => {
    const cases = (['outward', 'inward'] as const).map((thicknessDirection) => {
      const p = params({ thicknessDirection });
      return { p, complex: build(p) };
    });
    const complexes = cases.map(({ complex }) => complex);
    for (const { p, complex } of cases) {
      assertConforming(complex);
      const s = stand(complex).scalars!;
      assert.equal(s.tau.length, 8);
      assert.ok(new Set(s.tau).size > 1, 'brightness-varying cut ring must retain varying thickness');
      for (let k = 0; k < 8; k += 1) {
        const inner = point(complex, ringId(complex, 'I', k));
        const outer = point(complex, ringId(complex, 'O', k));
        const innerR = Math.hypot(...inner); const outerR = Math.hypot(...outer);
        assertScaleClose(outerR - innerR, s.tau[k], outerR);
        if (p.thicknessDirection === 'outward') assertScaleClose(innerR, p.radiusMm, p.radiusMm);
        else assertScaleClose(outerR, p.radiusMm, p.radiusMm);
      }
    }
    assert.deepEqual(
      complexes[0].tetrahedra.filter((x) => x.region !== 'shell').map((x) => `${x.region}:${(x as { cellId?: string }).cellId}`),
      complexes[1].tetrahedra.filter((x) => x.region !== 'shell').map((x) => `${x.region}:${(x as { cellId?: string }).cellId}`),
    );
  });

  await t.test('all-W scalar formulas place south/equator/north collars and all stand radii strictly exterior', () => {
    const latitudeCases = [
      { label: 'south', heightSegments: 8, holeDiameterMm: 30, expectedSign: -1 },
      { label: 'equator', heightSegments: 8, holeDiameterMm: 2 * DEFAULT_PARAMS.radiusMm, expectedSign: 0 },
      { label: 'north', heightSegments: 9, holeDiameterMm: 2 * DEFAULT_PARAMS.radiusMm, expectedSign: 1 },
    ] as const;
    for (const latitude of latitudeCases) {
      const p = params({ heightSegments: latitude.heightSegments, holeDiameterMm: latitude.holeDiameterMm, verticalSplitCount: 1 });
      const complex = build(p);
      const d = stand(complex).scalars!;
      const zeroThreshold = Math.max(1, p.radiusMm) * 2e-12;
      if (latitude.expectedSign < 0) assert.ok(d.y0 < 0, `${latitude.label} y0 must be negative, got ${d.y0}`);
      else if (latitude.expectedSign > 0) assert.ok(d.y0 > 0, `${latitude.label} y0 must be positive, got ${d.y0}`);
      else assert.ok(Math.abs(d.y0) <= zeroThreshold, `${latitude.label} y0 must be near zero, got ${d.y0}`);
      assertScaleClose(d.theta, Math.PI * (1 - complex.diagnostics.bottomHole.ringVGrid / latitude.heightSegments), Math.PI);
      assertScaleClose(d.s, Math.sin(d.theta), 1);
      assertScaleClose(d.y0, Math.cos(d.theta), 1);
      assertScaleClose(d.delta, 2 * Math.PI / p.widthSegments, Math.PI);
      assertScaleClose(d.halfDelta, d.delta / 2, 1);
      assert.equal(d.tauMin, Math.min(...d.tau));
      assert.equal(d.j, Math.min(d.h, d.tauMin));
      assertScaleClose(d.q, p.radiusMm * d.s, p.radiusMm);
      const critical = d.y0 < 0 ? d.q + d.w : d.q;
      assertScaleClose(d.Yradial, d.y0 * critical / d.s, Math.abs(d.Yradial));
      const cutYs = Array.from({ length: p.widthSegments }, (_, k) => [
        point(complex, ringId(complex, 'I', k))[1],
        point(complex, ringId(complex, 'O', k))[1],
      ]).flat();
      assert.equal(d.YcutMin, Math.min(...cutYs));
      assert.equal(d.Yc, d.YcutMin - d.j);
      assert.equal(d.Ys, Math.min(d.Yc, d.Yradial) - d.j);
      assert.equal(d.Yb, d.Ys - d.h);
      assert.ok(d.YcutMin > d.Yc && d.Yc > d.Ys && d.Ys > d.Yb);
      for (let k = 0; k < p.widthSegments; k += 1) {
        const next = (k + 1) % p.widthSegments;
        const e = (u: number): [number, number] => {
          const p = point(complex, ringId(complex, 'SI', u));
          const r = Math.hypot(p[0], p[2]);
          return [p[0] / r, p[2] / r];
        };
        const [ex, ez] = e(k); const [nx, nz] = e(next);
        const mx = (ex + nx) / (2 * Math.cos(d.halfDelta));
        const mz = (ez + nz) / (2 * Math.cos(d.halfDelta));
        for (const kind of ['CI', 'CO', 'SI', 'SO', 'BI', 'BO']) {
          const p0 = point(complex, ringId(complex, kind, k));
          const L = d.s * Math.cos(d.halfDelta) * p0[1] - d.y0 * (mx * p0[0] + mz * p0[2]);
          assert.ok(L < 0, `${kind}/${k} must be exterior, got ${L}`);
        }
      }
    }
  });

  await t.test('w=0 emits no stand; below/equal/above relief and 2R keep three positive disjoint layers', () => {
    const zero = build(params({ standWallThicknessMm: 0 }));
    assert.equal(stand(zero).enabled, false);
    assert.equal(zero.tetrahedra.some((x) => x.region !== 'shell'), false);
    assert.equal(zero.vertices.some((x) => x.kind !== 'shell'), false);
    assert.equal(zero.boundaryFaces.some((x) => x.surface === 'bottom-lumen-disk'), false);
    const exactRim = zero.boundaryFaces.filter((x) => x.surface === 'hole-rim');
    assert.ok(exactRim.length > 0);
    assert.ok(exactRim.every((face) => face.vertexIds.every((id) => zero.vertices[id].kind === 'shell')));

    const reference = build(params({ standWallThicknessMm: 3 }));
    const projected = stand(reference).scalars!.s * stand(reference).scalars!.tauMin;
    const radiusMm = DEFAULT_PARAMS.radiusMm;
    const widthSegments = params().widthSegments;
    for (const w of [projected / 2, projected, projected * 2, 100, 2 * radiusMm]) {
      const complex = build(params({ standWallThicknessMm: w }));
      assertConforming(complex);
      const d = stand(complex).scalars!;
      assert.equal(d.w, Math.max(0, Math.min(w, 2 * radiusMm)));
      assert.deepEqual(new Set(complex.tetrahedra.filter((x) => x.region !== 'shell').map((x) => x.region)), new Set(['collar', 'taper', 'tube']));
      assert.ok(d.YcutMin > d.Yc && d.Yc > d.Ys && d.Ys > d.Yb);
      for (const tau of d.tau) for (const lambda of [0, 0.25, 0.5, 0.75, 1]) {
        assert.ok((1 - lambda) * d.s * tau + lambda * d.w > 0);
      }
      if (w === 2 * radiusMm) {
        for (const [inner, outer] of [['CI', 'CO'], ['SI', 'SO'], ['BI', 'BO']] as const) {
          for (let k = 0; k < widthSegments; k += 1) {
            const offset = k * 3;
            const rings = stand(complex).float32Rings;
            assert.ok(rings[inner][offset] !== rings[outer][offset]
              || rings[inner][offset + 2] !== rings[outer][offset + 2], `${inner}/${outer} Float32 collapse at u${k}`);
          }
        }
        assertNamedInterfaces(complex);
      }
    }
  });

  await t.test('minimum W and one-segment independent columns reproduce every global scalar and ring bit', () => {
    const builds = Array.from({ length: 8 }, (_, index) => build(params({ horizontalSplitCount: 8, splitIndex: index + 1 })));
    for (const complex of builds) assertConforming(complex);
    const first = stand(builds[0]);
    for (const complex of builds.slice(1)) {
      const other = stand(complex);
      assert.deepEqual(other.scalars, first.scalars);
      assert.deepEqual(Object.keys(other.float64Rings), Object.keys(first.float64Rings));
      for (const key of Object.keys(first.float64Rings)) {
        assert.deepEqual(other.float64Rings[key], first.float64Rings[key], `${key} Float64 differs`);
        assert.deepEqual(other.float32Rings[key], first.float32Rings[key], `${key} Float32 differs`);
      }
    }
  });

  await t.test('three named interfaces use canonical IDs exactly twice with opposite winding', () => {
    const complex = build(params({ horizontalSplitCount: 1, splitIndex: 1 }));
    assertConforming(complex);
    assertNamedInterfaces(complex);
  });

  await t.test('fixed staircase determinants, per-cell volumes, and coordinate SAT non-overlap agree without repair', () => {
    const complex = build(params({ widthSegments: 12, heightSegments: 8, horizontalSplitCount: 3, splitIndex: 2 }));
    assertConforming(complex);
    assertCellVolumes(complex);
    assertCellsDoNotOverlap(complex);

    const matrixReference = build(params());
    const projected = stand(matrixReference).scalars!.s * stand(matrixReference).scalars!.tauMin;
    const matrix = [
      { label: 'outward/below relief/south', p: params({ thicknessDirection: 'outward', standWallThicknessMm: projected / 2 }), relief: 'below' },
      { label: 'inward/above relief/south', p: params({ thicknessDirection: 'inward', standWallThicknessMm: projected * 2 }), relief: 'above' },
      { label: 'outward/2R/south', p: params({ thicknessDirection: 'outward', standWallThicknessMm: 2 * DEFAULT_PARAMS.radiusMm }) },
      { label: 'inward/equator', p: params({ thicknessDirection: 'inward', heightSegments: 8, holeDiameterMm: 2 * DEFAULT_PARAMS.radiusMm }) },
      { label: 'outward/north', p: params({ thicknessDirection: 'outward', heightSegments: 9, holeDiameterMm: 2 * DEFAULT_PARAMS.radiusMm }) },
    ] as const;
    for (const matrixCase of matrix) {
      const matrixComplex = build(matrixCase.p);
      assertConforming(matrixComplex);
      assertCellVolumes(matrixComplex);
      assertOneSectorStandCellsDoNotOverlap(matrixComplex);
      const d = stand(matrixComplex).scalars!;
      const actualRelief = d.s * d.tauMin;
      if ('relief' in matrixCase && matrixCase.relief === 'below') assert.ok(d.w < actualRelief, `${matrixCase.label}: ${d.w} must be below ${actualRelief}`);
      if ('relief' in matrixCase && matrixCase.relief === 'above') assert.ok(d.w > actualRelief, `${matrixCase.label}: ${d.w} must be above ${actualRelief}`);
    }
  });

  await t.test('lumen I-CI-SI-BI stays open and BI/BO is the only bottom closure', () => {
    const complex = build(params({ topHoleDiameterMm: 24, horizontalSplitCount: 1 }));
    assertConforming(complex);
    assert.ok(complex.boundaryFaces.some((x) => x.surface === 'stand-inner-wall'));
    assert.ok(complex.boundaryFaces.some((x) => x.surface === 'stand-bottom-annulus'));
    assert.equal(complex.boundaryFaces.some((x) => x.surface === 'bottom-lumen-disk' || x.surface === 'top-lumen-disk'), false);
    const bottom = complex.boundaryFaces.filter((x) => x.surface === 'stand-bottom-annulus');
    assert.ok(bottom.length > 0);
    assert.ok(bottom.every((face) => face.vertexIds.every((id) => ['stand-inner-bottom', 'stand-outer-bottom'].includes(complex.vertices[id].kind))));
    assert.ok(complex.boundaryFaces.filter((x) => x.intent.kind === 'outer').every((x) => x.intent.materialIndex === 0 && x.intent.uv.kind === 'image'));
    assert.ok(complex.boundaryFaces.filter((x) => x.intent.kind === 'inner').every((x) => x.intent.materialIndex === 1 && x.intent.uv.kind === 'neutral'));
    assert.ok(complex.boundaryFaces.filter((x) => x.intent.kind === 'wall').every((x) => x.intent.materialIndex === 2 && x.intent.uv.kind === 'neutral'));
  });

  await t.test('invalid thickness/scalars and Float32 layer collapse fail recoverably and atomically', () => {
    for (const [label, p] of [
      ['zero tau', params({ minThicknessMm: 0, maxThicknessMm: 0 })],
      ['nonfinite radius', params({ radiusMm: Number.NaN })],
      ['Float32 collapse', params({ standWallThicknessMm: Number.MIN_VALUE })],
      ['pole join', params({ heightSegments: 1, verticalSplitCount: 1 })],
    ] as const) {
      assert.throws(() => build(p), (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal((error as Error & { code?: string }).code, 'GENERATION_FAILED');
        return true;
      }, label);
    }
  });

  await t.test('seam/poles remain canonical and public split route stays Phase-5 fail-closed', () => {
    for (const splitIndex of [1, 16]) {
      const p = params({ widthSegments: 8, heightSegments: 2, horizontalSplitCount: 8, verticalSplitCount: 2, splitIndex, holeDiameterMm: 0 });
      const complex = build(p);
      assertConforming(complex);
      for (const layer of ['inner', 'outer'] as const) for (let v = complex.cell.vSegments.start; v <= complex.cell.vSegments.end; v += 1) {
        assert.equal(complex.canonicalIds.shell(layer, v, 0), complex.canonicalIds.shell(layer, v, p.widthSegments));
      }
    }
    const split = params({ horizontalSplitCount: 2, verticalSplitCount: 1, splitIndex: 2 });
    assert.throws(() => generateSphereLithophane(image(), split), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal((error as Error & { code?: string }).code, 'GENERATION_FAILED');
      assert.match(error.message, /Phase 5|split/i);
      return true;
    });
    const legacy = generateSphereLithophane(image(), {
      ...DEFAULT_PARAMS,
      holeDiameterMm: 30,
      standWallThicknessMm: Number.MIN_VALUE,
      horizontalSplitCount: 1,
      verticalSplitCount: 1,
      splitIndex: 1,
    });
    try { assert.ok(legacy.summary.triangleCount > 0); } finally { legacy.geometry.dispose(); }
  });
}
