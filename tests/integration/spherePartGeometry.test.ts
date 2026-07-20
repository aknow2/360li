import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { TestContext } from 'node:test';
import * as THREE from 'three';
import { DEFAULT_PARAMS, type LithophaneParams } from '../../src/domain/params';
import { generateSphereLithophane } from '../../src/lithophane/sphereLithophane';
import {
  buildPartSolidComplex,
  directedTetraFaces,
  type CanonicalVolumeComplex,
  type DirectedFace,
} from '../../src/lithophane/partSolid';
import { resolveSplitCell } from '../../src/lithophane/splitCell';
import { decodeImageToImageData } from '../../src/lithophane/imageDecode';
import { generateFromSnapshot } from '../../src/domain/generate';
import { createBuildSnapshot, type BuiltPart } from '../../src/domain/builtPart';
import { runAppGeneration } from '../../src/App';

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

function flatImage(value = 127, width = 8, height = 4): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = value;
    data[offset + 1] = value;
    data[offset + 2] = value;
    data[offset + 3] = 255;
  }
  return { width, height, data } as ImageData;
}

type PreflightCanvas = HTMLCanvasElement & { pixels?: ImageData; drawnSource?: CanvasImageSource };

function performancePixels(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const value = (x * 17 + y * 31 + ((x >> 5) ^ (y >> 4)) * 13) & 255;
      data[offset] = value;
      data[offset + 1] = (value * 3 + 19) & 255;
      data[offset + 2] = (value * 7 + 53) & 255;
      data[offset + 3] = 255;
    }
  }
  return { width, height, data } as ImageData;
}

function preflightCanvasFactory(): () => HTMLCanvasElement {
  return () => {
    const canvas = { width: 0, height: 0 } as PreflightCanvas;
    canvas.getContext = ((kind: string) => {
      assert.equal(kind, '2d');
      return {
        fillStyle: '#fff',
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
        fillRect() {}, save() {}, restore() {}, scale() {},
        putImageData(pixels: ImageData) { canvas.pixels = pixels; },
        drawImage(source: CanvasImageSource) { canvas.drawnSource = source; },
        getImageData(x = 0, y = 0, requestedWidth = canvas.width, requestedHeight = canvas.height) {
          assert.equal(x, 0);
          assert.equal(y, 0);
          const source = canvas.drawnSource as PreflightCanvas | undefined;
          if (
            source?.pixels
            && source.pixels.width === requestedWidth
            && source.pixels.height === requestedHeight
          ) {
            return {
              width: requestedWidth,
              height: requestedHeight,
              data: new Uint8ClampedArray(source.pixels.data),
            } as ImageData;
          }
          return performancePixels(requestedWidth, requestedHeight);
        },
      } as unknown as CanvasRenderingContext2D;
    }) as HTMLCanvasElement['getContext'];
    return canvas;
  };
}

function normalToImageUv(direction: THREE.Vector3): { u: number; v: number } {
  const theta = Math.acos(Math.max(-1, Math.min(1, direction.y)));
  let phi = Math.atan2(direction.z, -direction.x);
  if (phi < 0) phi += Math.PI * 2;
  return { u: 1 - phi / (Math.PI * 2), v: 1 - theta / Math.PI };
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
  await t.test('App generation boundary preserves defaults and limits injection to decode platform primitives', async () => {
    const source = await readFile(new URL('../../src/App.tsx', import.meta.url), 'utf8');
    assert.match(source, /if \(!decodePlatform\) return generateFromSnapshot\(snapshot\)/);
    assert.doesNotMatch(source, /defaultAppDecodePlatform/);
    assert.doesNotMatch(source, /AppGenerationDependencies/);
    assert.doesNotMatch(source, /maxWorkingPixels/);
    assert.match(source, /createWorkingImage,\s*\}\),\s*generate: generateSphereLithophane/s);
  });

  await t.test('4096x2048 production decode and H2/V2/part3 selected-solid preflight stays within the Node budget', async (test) => {
    const width = 4096;
    const height = 2048;
    const nodePreflightBudgetMs = 45_000;
    const source = new File([new Uint8Array([0])], 'performance-4096x2048.png', {
      type: 'image/png',
      lastModified: 1,
    });
    const snapshot = createBuildSnapshot(source, {
      ...DEFAULT_PARAMS,
      widthSegments: 256,
      heightSegments: 128,
      horizontalSplitCount: 2,
      verticalSplitCount: 2,
      splitIndex: 3,
    });
    const createCanvas = preflightCanvasFactory();
    const originalDocument = globalThis.document;
    let bitmapCloseCount = 0;
    let sourceBitmapDimensions: readonly [number, number] | null = null;
    let builtPart: BuiltPart | null = null;
    const started = performance.now();
    Object.assign(globalThis, { document: { createElement: () => createCanvas() } });
    try {
      builtPart = await runAppGeneration(snapshot, {
          createImageBitmap: async () => {
            sourceBitmapDimensions = [width, height];
            return ({
            width,
            height,
            close() { bitmapCloseCount += 1; },
            }) as ImageBitmap;
          },
          createImageElement: () => { throw new Error('ImageBitmap path is required'); },
          createObjectURL: () => { throw new Error('Object URL path must not run'); },
          revokeObjectURL: () => { throw new Error('Object URL path must not run'); },
          createCanvas,
      });
      const elapsedMs = performance.now() - started;
      test.diagnostic(`4096x2048 real-pipeline Node preflight: ${elapsedMs.toFixed(1)} ms (budget ${nodePreflightBudgetMs} ms); only SP-E2E-017 real Chrome timing can satisfy SC-008 <30000 ms.`);
      assert.ok(elapsedMs < nodePreflightBudgetMs, `Node preflight exceeded ${nodePreflightBudgetMs} ms: ${elapsedMs}`);
      assert.deepEqual(sourceBitmapDimensions, [width, height]);
      assert.equal(builtPart.workingImage.width, 4000);
      assert.equal(builtPart.workingImage.height, 2000);
      assert.equal(builtPart.workingImage.data.length, 4000 * 2000 * 4);
      assert.equal(builtPart.snapshot.params.horizontalSplitCount, 2);
      assert.equal(builtPart.snapshot.params.verticalSplitCount, 2);
      assert.equal(builtPart.snapshot.params.splitIndex, 3);
      assert.equal(builtPart.fileName, 'spherical-lithophane-h2-v2-part-3-of-4.stl');
      assert.ok(builtPart.summary.vertexCount > 0);
      assert.ok(builtPart.summary.triangleCount > 0);
      const positions = builtPart.geometry.getAttribute('position');
      assert.ok(positions.count > 0);
      for (const coordinate of positions.array) assert.ok(Number.isFinite(coordinate));
      assert.equal(bitmapCloseCount, 1);
    } finally {
      builtPart?.geometry.dispose();
      Object.assign(globalThis, { document: originalDocument });
    }
  });

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

  await t.test('public split route emits the selected closed solid with deterministic groups, UVs, and summary', () => {
    for (const [horizontalSplitCount, verticalSplitCount] of [[2, 2], [3, 2], [4, 3]] as const) {
      const total = horizontalSplitCount * verticalSplitCount;
      for (let splitIndex = 1; splitIndex <= total; splitIndex += 1) {
        const p = params({
          widthSegments: horizontalSplitCount === 3 ? 10 : 8,
          heightSegments: verticalSplitCount === 3 ? 6 : 5,
          horizontalSplitCount,
          verticalSplitCount,
          splitIndex,
          holeDiameterMm: 0,
        });
        const first = generateSphereLithophane(image(), p);
        const second = generateSphereLithophane(image(), p);
        try {
          const position = first.geometry.getAttribute('position');
          const uv = first.geometry.getAttribute('uv');
          const normal = first.geometry.getAttribute('normal');
          const index = first.geometry.getIndex();
          assert.ok(position && uv && normal && index);
          assert.equal(first.summary.vertexCount, position.count);
          assert.equal(first.summary.triangleCount, index.count / 3);
          assert.deepEqual(first.geometry.groups, [
            { start: 0, count: first.geometry.groups[0].count, materialIndex: 0 },
            { start: first.geometry.groups[0].count, count: first.geometry.groups[1].count, materialIndex: 1 },
            { start: first.geometry.groups[0].count + first.geometry.groups[1].count, count: first.geometry.groups[2].count, materialIndex: 2 },
          ]);
          assert.ok(Array.from(uv.array).every(Number.isFinite));
          assert.deepEqual(position.array, second.geometry.getAttribute('position').array);
          assert.deepEqual(index.array, second.geometry.getIndex()!.array);
          assert.deepEqual(uv.array, second.geometry.getAttribute('uv').array);
        } finally {
          first.geometry.dispose();
          second.geometry.dispose();
        }
      }
    }
  });

  await t.test('public split route keeps exact source ownership and neighboring boundary coordinates', () => {
    const base = params({ widthSegments: 10, heightSegments: 5, horizontalSplitCount: 3, verticalSplitCount: 2, holeDiameterMm: 0 });
    const builds = Array.from({ length: 6 }, (_, index) => {
      const p = { ...base, splitIndex: index + 1 };
      const cell = resolveSplitCell(p);
      const generated = generateSphereLithophane(image(), p);
      return { cell, generated };
    });
    try {
      for (const { cell, generated } of builds) {
        const position = generated.geometry.getAttribute('position');
        const selected = new THREE.Vector3();
        for (let vertex = 0; vertex < position.count; vertex += 1) {
          selected.fromBufferAttribute(position, vertex);
          const radius = selected.length();
          assert.ok(radius > 0 && Number.isFinite(radius));
          const v = 1 - Math.acos(Math.max(-1, Math.min(1, selected.y / radius))) / Math.PI;
          assert.ok(v >= cell.vMin - 1e-6 && v <= cell.vMax + 1e-6, `foreign V=${v} outside ${cell.vMin}:${cell.vMax}`);
          if (Math.hypot(selected.x, selected.z) > 1e-5) {
            let phi = Math.atan2(selected.z, -selected.x); if (phi < 0) phi += Math.PI * 2;
            const u = 1 - phi / (Math.PI * 2);
            const seamEquivalent = (cell.uMin === 0 && Math.abs(u - 1) < 1e-6)
              || (cell.uMax === 1 && u < 1e-6);
            assert.ok(seamEquivalent || (u >= cell.uMin - 1e-6 && u <= cell.uMax + 1e-6), `foreign U=${u} outside ${cell.uMin}:${cell.uMax}`);
          }
        }
        assert.equal(cell.uSegments.count, cell.column <= 1 ? 4 : 3);
        assert.equal(cell.vSegments.count, cell.row === 1 ? 3 : 2);
      }
      for (const [leftIndex, rightIndex] of [[0, 1], [1, 2], [3, 4], [4, 5]] as const) {
        const left = builds[leftIndex].generated.geometry;
        const right = builds[rightIndex].generated.geometry;
        const boundary = builds[leftIndex].cell.uMax;
        const coordinates = (geometry: THREE.BufferGeometry) => {
          const values = geometry.getAttribute('position');
          const found: string[] = [];
          for (let i = 0; i < values.count; i += 1) {
            const x = values.getX(i); const y = values.getY(i); const z = values.getZ(i);
            let phi = Math.atan2(z, -x); if (phi < 0) phi += Math.PI * 2;
            const u = 1 - phi / (Math.PI * 2);
            if (Math.abs(u - boundary) < 1e-6 || (boundary === 1 && u < 1e-6)) found.push(`${x}:${y}:${z}`);
          }
          return [...new Set(found)].sort();
        };
        const leftBoundary = coordinates(left);
        const rightBoundary = coordinates(right);
        assert.ok(leftBoundary.length > 0 && rightBoundary.length > 0);
        assert.deepEqual(leftBoundary, rightBoundary);
      }
    } finally {
      for (const { generated } of builds) generated.geometry.dispose();
    }
  });

  await t.test('public split rotation moves the complete closed solid exactly once and outer UVs use final direction', () => {
    const localParams = params({
      widthSegments: 8,
      heightSegments: 6,
      horizontalSplitCount: 2,
      verticalSplitCount: 2,
      splitIndex: 1,
      thicknessDirection: 'outward',
      holeDiameterMm: 30,
      topHoleDiameterMm: 20,
      standWallThicknessMm: 3,
      holeLatitude: 0,
      holeLongitude: 0,
    });
    const rotatedParams = { ...localParams, holeLatitude: 23, holeLongitude: 17 };
    const local = generateSphereLithophane(flatImage(), localParams);
    const rotated = generateSphereLithophane(flatImage(), rotatedParams);
    try {
      const expected = local.geometry.getAttribute('position').clone();
      const rotation = new THREE.Matrix4()
        .makeRotationY((rotatedParams.holeLongitude / 100) * Math.PI * 2)
        .multiply(new THREE.Matrix4().makeRotationX((rotatedParams.holeLatitude / 100) * Math.PI));
      expected.applyMatrix4(rotation);
      assert.deepEqual(rotated.geometry.getAttribute('position').array, expected.array);
      assert.deepEqual(rotated.geometry.getIndex()!.array, local.geometry.getIndex()!.array);
      assert.deepEqual(rotated.geometry.groups, local.geometry.groups);

      const outer = rotated.geometry.groups[0];
      const indices = rotated.geometry.getIndex()!;
      const positions = rotated.geometry.getAttribute('position');
      const uvs = rotated.geometry.getAttribute('uv');
      const checked = new Set<number>();
      for (let offset = outer.start; offset < outer.start + outer.count; offset += 1) {
        const vertex = indices.getX(offset);
        if (checked.has(vertex)) continue;
        checked.add(vertex);
        const direction = new THREE.Vector3().fromBufferAttribute(positions, vertex).normalize();
        const expectedUv = normalToImageUv(direction);
        assert.ok(Math.abs(uvs.getX(vertex) - expectedUv.u) < 1e-6);
        assert.ok(Math.abs(uvs.getY(vertex) - expectedUv.v) < 1e-6);
      }
      assert.ok(checked.size > 0);
    } finally {
      local.geometry.dispose();
      rotated.geometry.dispose();
    }
  });

  await t.test('independent one-segment public builds emit identical all-W stand layer coordinates', () => {
    const base = params({ widthSegments: 8, heightSegments: 6, horizontalSplitCount: 8, verticalSplitCount: 1 });
    const expectedComplex = build({ ...base, splitIndex: 1 });
    const expectedY = stand(expectedComplex).scalars!;
    const required = [expectedY.Yc, expectedY.Ys, expectedY.Yb].map(Math.fround);
    const builds = Array.from({ length: 8 }, (_, index) => generateSphereLithophane(image(), { ...base, splitIndex: index + 1 }));
    try {
      for (const generated of builds) {
        const values = generated.geometry.getAttribute('position');
        const ys = new Set(Array.from({ length: values.count }, (_, vertex) => values.getY(vertex)));
        for (const y of required) assert.ok(ys.has(y), `missing global stand Y=${y}`);
      }
    } finally {
      for (const generated of builds) generated.geometry.dispose();
    }
  });

  await t.test('public invalid selected result fails recoverably without returning partial geometry', () => {
    let returned: ReturnType<typeof generateSphereLithophane> | null = null;
    assert.throws(() => {
      returned = generateSphereLithophane(image(), params({ minThicknessMm: 0, maxThicknessMm: 0 }));
    }, (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal((error as Error & { code?: string }).code, 'GENERATION_FAILED');
      return true;
    });
    assert.equal(returned, null);
  });

  await t.test('seam/poles remain canonical and public split route succeeds', () => {
    for (const splitIndex of [1, 16]) {
      const p = params({ widthSegments: 8, heightSegments: 2, horizontalSplitCount: 8, verticalSplitCount: 2, splitIndex, holeDiameterMm: 0 });
      const complex = build(p);
      assertConforming(complex);
      for (const layer of ['inner', 'outer'] as const) for (let v = complex.cell.vSegments.start; v <= complex.cell.vSegments.end; v += 1) {
        assert.equal(complex.canonicalIds.shell(layer, v, 0), complex.canonicalIds.shell(layer, v, p.widthSegments));
      }
    }
    const split = generateSphereLithophane(image(), params({ horizontalSplitCount: 2, verticalSplitCount: 1, splitIndex: 2 }));
    try { assert.ok(split.summary.triangleCount > 0); } finally { split.geometry.dispose(); }
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

  await t.test('ImageBitmap closes exactly once when post-decode processing throws', async () => {
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    const originalCreateImageBitmap = globalThis.createImageBitmap;
    let closes = 0;
    const bitmap = { width: 2, height: 1, close: () => { closes += 1; } } as unknown as ImageBitmap;
    Object.assign(globalThis, {
      window: { createImageBitmap: true },
      createImageBitmap: async () => bitmap,
      document: { createElement: () => ({ width: 0, height: 0, getContext: () => null }) },
    });
    try {
      await assert.rejects(
        decodeImageToImageData(new File([new Uint8Array([1])], 'x.png', { type: 'image/png' })),
        (error: unknown) => (error as { code?: string }).code === 'DECODE_FAILED',
      );
      assert.equal(closes, 1);
    } finally {
      Object.assign(globalThis, { window: originalWindow, document: originalDocument, createImageBitmap: originalCreateImageBitmap });
    }
  });

  await t.test('post-generation publication failure disposes temporary geometry and returns no Built Part', async () => {
    const snapshot = createBuildSnapshot(
      new File([new Uint8Array([1])], 'x.png', { type: 'image/png' }),
      params(),
    );
    let disposals = 0;
    const geometry = new THREE.BufferGeometry();
    geometry.addEventListener('dispose', () => { disposals += 1; });
    await assert.rejects(generateFromSnapshot(snapshot, {
      decode: async () => ({ imageData: image(), width: 11, height: 7 }),
      generate: () => ({
        geometry,
        get summary(): never { throw new Error('summary failed'); },
      }),
    }));
    assert.equal(disposals, 1);
  });
}
