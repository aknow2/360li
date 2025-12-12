import * as THREE from 'three';
import type { LithophaneParams } from '../domain/params';
import { createImageSampler } from './imageSampler';
import { brightnessToThicknessMm } from './thickness';
import { compensationFactor } from './compensation';
import type { GenerationSummary } from '../domain/contracts';

export type GenerateResult = {
  geometry: THREE.BufferGeometry;
  summary: GenerationSummary;
};

const DEFAULT_VIEW_DIR = new THREE.Vector3(0, 0, 1);

function clamp(x: number, min: number, max: number): number {
  if (x < min) return min;
  if (x > max) return max;
  return x;
}

export function generateSphereLithophane(imageData: ImageData, params: LithophaneParams): GenerateResult {
  const sampler = createImageSampler(imageData);

  const innerRadius = params.radiusMm;

  const base = new THREE.SphereGeometry(innerRadius, params.widthSegments, params.heightSegments);
  base.computeVertexNormals();

  const pos = base.getAttribute('position');
  const uv = base.getAttribute('uv');
  const index = base.getIndex();
  if (!uv || !index) {
    throw new Error('SphereGeometry missing required attributes.');
  }

  const idx = index.array as Uint16Array | Uint32Array;

  // Optional bottom opening. We cut along a latitude band boundary (no triangle splitting)
  // so the opening diameter is an approximation based on mesh resolution.
  const holeRadius = clamp(params.holeDiameterMm / 2, 0, innerRadius);
  const holeEnabled = holeRadius > 0;
  const desiredV = holeEnabled
    ? 1 - Math.asin(clamp(holeRadius / innerRadius, 0, 1)) / Math.PI
    : 1;
  const ringRow = holeEnabled ? Math.max(0, Math.min(params.heightSegments, Math.floor(desiredV * params.heightSegments))) : params.heightSegments;
  const ringV = ringRow / params.heightSegments;

  const vertexCount = pos.count;
  const innerPositions = new Float32Array(vertexCount * 3);
  const outerPositions = new Float32Array(vertexCount * 3);

  const normal = new THREE.Vector3();

  for (let i = 0; i < vertexCount; i++) {
    normal.fromBufferAttribute(pos, i).normalize();

    const u = uv.getX(i);
    const v = uv.getY(i);
    const brightness = sampler.sampleBrightness(u, v);

    const baseThickness = brightnessToThicknessMm(brightness, params);
    const factor = compensationFactor(normal, DEFAULT_VIEW_DIR, params.minCos);
    const thickness = baseThickness * factor;

    const innerR = innerRadius;
    const outerR = innerRadius + thickness;

    innerPositions[i * 3 + 0] = normal.x * innerR;
    innerPositions[i * 3 + 1] = normal.y * innerR;
    innerPositions[i * 3 + 2] = normal.z * innerR;

    outerPositions[i * 3 + 0] = normal.x * outerR;
    outerPositions[i * 3 + 1] = normal.y * outerR;
    outerPositions[i * 3 + 2] = normal.z * outerR;
  }

  const positions = new Float32Array(vertexCount * 3 * 2);
  positions.set(innerPositions, 0);
  positions.set(outerPositions, innerPositions.length);

  const triCount = index.count / 3;
  const keptOuter: number[] = [];
  const keptInner: number[] = [];

  for (let t = 0; t < triCount; t++) {
    const a = idx[t * 3 + 0];
    const b = idx[t * 3 + 1];
    const c = idx[t * 3 + 2];

    if (holeEnabled) {
      const av = uv.getY(a);
      const bv = uv.getY(b);
      const cv = uv.getY(c);
      // Remove any triangles that dip below the cut ring.
      if (av > ringV || bv > ringV || cv > ringV) continue;
    }

    // Outer faces keep original winding.
    keptOuter.push(a + vertexCount, b + vertexCount, c + vertexCount);
    // Inner faces reverse winding.
    keptInner.push(c, b, a);
  }

  const wall: number[] = [];
  if (holeEnabled && ringRow < params.heightSegments) {
    const rowVerts = params.widthSegments + 1;
    const baseRow = ringRow * rowVerts;
    for (let col = 0; col < params.widthSegments; col++) {
      const i0 = baseRow + col;
      const i1 = baseRow + col + 1;
      const i0o = i0 + vertexCount;
      const i1o = i1 + vertexCount;

      // Two triangles forming the rim wall connecting outer->inner.
      wall.push(i0o, i1o, i1);
      wall.push(i0o, i1, i0);
    }
  }

  const combined = new THREE.BufferGeometry();
  combined.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const combinedIndexArray = [...keptOuter, ...keptInner, ...wall];
  const IndexArrayCtor = vertexCount * 2 > 65535 ? Uint32Array : Uint16Array;
  const combinedIndex = new IndexArrayCtor(combinedIndexArray.length);
  for (let i = 0; i < combinedIndexArray.length; i++) combinedIndex[i] = combinedIndexArray[i];
  combined.setIndex(new THREE.BufferAttribute(combinedIndex, 1));

  combined.computeVertexNormals();

  return {
    geometry: combined,
    summary: {
      vertexCount: vertexCount * 2,
      triangleCount: combinedIndexArray.length / 3,
    },
  };
}
