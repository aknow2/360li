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

type HoleCut = {
  enabled: boolean;
  radiusMm: number;
  ringRow: number;
  ringV: number;
};

function clamp(x: number, min: number, max: number): number {
  if (x < min) return min;
  if (x > max) return max;
  return x;
}

function normalToImageUv(normal: THREE.Vector3): { u: number; v: number } {
  const ny = clamp(normal.y, -1, 1);
  const theta = Math.acos(ny);
  let phi = Math.atan2(normal.z, -normal.x);
  if (phi < 0) phi += Math.PI * 2;

  const u = 1 - phi / (Math.PI * 2);
  const v = 1 - theta / Math.PI;
  return { u, v };
}

function makeBottomHoleCut(diameterMm: number, baseRadius: number, heightSegments: number): HoleCut {
  const radiusMm = clamp(diameterMm / 2, 0, baseRadius);
  const enabled = radiusMm > 0;
  if (!enabled) return { enabled, radiusMm, ringRow: heightSegments, ringV: 0 };

  // For a bottom hole of radius r on a sphere of radius R, the cut latitude satisfies:
  // r = R * sin(alpha), where alpha is the angle up from the bottom pole.
  // In SphereGeometry's UV convention, v = alpha / PI at the bottom.
  const desiredV = Math.asin(clamp(radiusMm / baseRadius, 0, 1)) / Math.PI;
  const ringRow = Math.max(0, Math.min(heightSegments - 1, Math.floor((1 - desiredV) * heightSegments)));
  const ringV = 1 - ringRow / heightSegments;

  return { enabled, radiusMm, ringRow, ringV };
}

function makeTopHoleCut(diameterMm: number, baseRadius: number, heightSegments: number): HoleCut {
  const radiusMm = clamp(diameterMm / 2, 0, baseRadius);
  const enabled = radiusMm > 0;
  if (!enabled) return { enabled, radiusMm, ringRow: 0, ringV: 1 };

  // The top hole is the bottom hole's opposite-side cap. Keep it in local north-pole
  // space so the existing final hole rotation moves both openings together.
  const alpha = Math.asin(clamp(radiusMm / baseRadius, 0, 1)) / Math.PI;
  const ringRow = Math.max(1, Math.min(heightSegments, Math.ceil(alpha * heightSegments)));
  const ringV = 1 - ringRow / heightSegments;

  return { enabled, radiusMm, ringRow, ringV };
}

export function generateSphereLithophane(imageData: ImageData, params: LithophaneParams): GenerateResult {
  const sampler = createImageSampler(imageData);

  const thicknessDirection = params.thicknessDirection ?? 'outward';
  // Thickness direction:
  // - outward: inner surface is radiusMm, thickness extends outward
  // - inward: outer surface is radiusMm, thickness carves inward
  const baseRadius = params.radiusMm;

  const base = new THREE.SphereGeometry(baseRadius, params.widthSegments, params.heightSegments);
  base.computeVertexNormals();

  const pos = base.getAttribute('position');
  const uv = base.getAttribute('uv');
  const index = base.getIndex();
  if (!uv || !index) {
    throw new Error('SphereGeometry missing required attributes.');
  }

  const idx = index.array as Uint16Array | Uint32Array;

  // Optional openings. We cut along latitude band boundaries (no triangle splitting),
  // so opening diameters are approximations based on mesh resolution.
  const bottomHole = makeBottomHoleCut(params.holeDiameterMm, baseRadius, params.heightSegments);
  const topHole = makeTopHoleCut(params.topHoleDiameterMm, baseRadius, params.heightSegments);

  const rowVerts = params.widthSegments + 1;
  const bottomBaseRow = bottomHole.ringRow * rowVerts;
  const standEnabled = bottomHole.enabled && bottomHole.ringRow < params.heightSegments;
  // Simple, printable default stand height. (No UI control; derived from hole size.)
  const standHeightMm = standEnabled ? clamp(params.holeDiameterMm * 0.25, 3, 12) : 0;
  const standWallThicknessMm = clamp(params.standWallThicknessMm, 0, baseRadius * 2);

  const vertexCount = pos.count;
  const innerPositions = new Float32Array(vertexCount * 3);
  const outerPositions = new Float32Array(vertexCount * 3);
  // Extra vertices used for the stand:
  // - innerBottom ring (inner ring at bottomY)
  // - outerBottom ring (stand outer ring at bottomY)
  // - outerTop ring (stand outer ring at top plane)
  const extraRingVerts = standEnabled ? rowVerts * 3 : 0;
  const totalVertexCount = vertexCount * 2 + extraRingVerts;
  const uvs = new Float32Array(totalVertexCount * 2);

  const holeLat = params.holeLatitude ?? 0;
  const holeLon = params.holeLongitude ?? 0;
  const tiltAngle = (holeLat / 100) * Math.PI;
  const spinAngle = (holeLon / 100) * Math.PI * 2;
  const holeRotation = new THREE.Matrix4()
    .makeRotationY(spinAngle)
    .multiply(new THREE.Matrix4().makeRotationX(tiltAngle));
  const hasHoleRotation = holeLat !== 0 || holeLon !== 0;

  const normal = new THREE.Vector3();
  const mappedNormal = new THREE.Vector3();

  for (let i = 0; i < vertexCount; i++) {
    normal.fromBufferAttribute(pos, i).normalize();

    // Keep the image fixed while moving the hole:
    // sample using the post-rotation direction so texture/relief orientation stays unchanged.
    mappedNormal.copy(normal);
    if (hasHoleRotation) {
      mappedNormal.applyMatrix4(holeRotation).normalize();
    }
    const { u, v } = normalToImageUv(mappedNormal);
    const brightness = sampler.sampleBrightness(u, v);

    const baseThickness = brightnessToThicknessMm(brightness, params);
    const factor = compensationFactor(normal, DEFAULT_VIEW_DIR, params.minCos);
    // Apply view-angle compensation but keep the final thickness within requested bounds.
    // Without this clamp, small minThicknessMm values can become much thinner (e.g. minCos=0.25),
    // which many slicers will treat as missing/too-thin surfaces.
    const thickness = clamp(baseThickness * factor, params.minThicknessMm, params.maxThicknessMm);

    const innerR = thicknessDirection === 'inward' ? baseRadius - thickness : baseRadius;
    const outerR = thicknessDirection === 'inward' ? baseRadius : baseRadius + thickness;

    innerPositions[i * 3 + 0] = normal.x * innerR;
    innerPositions[i * 3 + 1] = normal.y * innerR;
    innerPositions[i * 3 + 2] = normal.z * innerR;

    outerPositions[i * 3 + 0] = normal.x * outerR;
    outerPositions[i * 3 + 1] = normal.y * outerR;
    outerPositions[i * 3 + 2] = normal.z * outerR;

    // Preserve UVs for both inner and outer vertices so the viewer can apply a texture.
    uvs[i * 2 + 0] = u;
    uvs[i * 2 + 1] = v;
    const outerUvOffset = vertexCount * 2;
    uvs[outerUvOffset + i * 2 + 0] = u;
    uvs[outerUvOffset + i * 2 + 1] = v;
  }

  const positions = new Float32Array(totalVertexCount * 3);
  positions.set(innerPositions, 0);
  positions.set(outerPositions, innerPositions.length);

  const triCount = index.count / 3;
  const keptOuter: number[] = [];
  const keptInner: number[] = [];

  for (let t = 0; t < triCount; t++) {
    const a = idx[t * 3 + 0];
    const b = idx[t * 3 + 1];
    const c = idx[t * 3 + 2];

    if (bottomHole.enabled) {
      const av = uv.getY(a);
      const bv = uv.getY(b);
      const cv = uv.getY(c);
      // Always cut at the bottom (south pole). Rotation is applied afterwards.
      if (av < bottomHole.ringV || bv < bottomHole.ringV || cv < bottomHole.ringV) continue;
    }

    if (topHole.enabled) {
      const av = uv.getY(a);
      const bv = uv.getY(b);
      const cv = uv.getY(c);
      // The top cut is the opposite-side cap of the bottom cut before final rotation.
      if (av > topHole.ringV || bv > topHole.ringV || cv > topHole.ringV) continue;
    }

    // Outer faces keep original winding.
    keptOuter.push(a + vertexCount, b + vertexCount, c + vertexCount);
    // Inner faces reverse winding.
    keptInner.push(c, b, a);
  }

  const wallAndStand: number[] = [];

  // Pipe-like stand: extrude the cut ring downward to create a stable base for printing.
  if (standEnabled) {
    // Create bottom ring vertices (planar bottom Y for stability).
    const baseTopY = pos.getY(bottomBaseRow);
    const topY = baseTopY;
    const bottomY = topY - standHeightMm;

    const innerBottomStart = vertexCount * 2;
    const outerBottomStart = innerBottomStart + rowVerts;
    const outerTopStart = outerBottomStart + rowVerts;

    for (let col = 0; col < rowVerts; col++) {
      const iTop = bottomBaseRow + col;
      const iBot = innerBottomStart + col;
      const oBot = outerBottomStart + col;
      const oTop = outerTopStart + col;

      // Stand ring is defined from the base sphere ring so it matches the cut ring.
      const ix = pos.getX(iTop);
      const iz = pos.getZ(iTop);

      // Inner ring at bottom plane (keeps the hole open through the stand).
      positions[iBot * 3 + 0] = ix;
      positions[iBot * 3 + 1] = bottomY;
      positions[iBot * 3 + 2] = iz;

      // Stand is a simple straight tube: choose a constant outer radius based on the inner ring.
      const rIn = Math.hypot(ix, iz);
      const rOut = rIn + standWallThicknessMm;
      const inv = rIn > 1e-6 ? 1 / rIn : 0;
      const ox = ix * inv * rOut;
      const oz = iz * inv * rOut;

      // Outer ring at top plane (cut plane).
      positions[oTop * 3 + 0] = ox;
      positions[oTop * 3 + 1] = topY;
      positions[oTop * 3 + 2] = oz;

      // Outer ring at bottom plane.
      positions[oBot * 3 + 0] = ox;
      positions[oBot * 3 + 1] = bottomY;
      positions[oBot * 3 + 2] = oz;

      // Reuse mapped UVs from the corresponding top ring vertices.
      const u = uvs[iTop * 2 + 0];
      const v = uvs[iTop * 2 + 1];
      uvs[iBot * 2 + 0] = u;
      uvs[iBot * 2 + 1] = v;
      uvs[oBot * 2 + 0] = u;
      uvs[oBot * 2 + 1] = v;
      uvs[oTop * 2 + 0] = u;
      uvs[oTop * 2 + 1] = v;
    }

    // Transition ring between the sphere's outer edge and the stand outer ring (simple connection).
    // This avoids a large flared "umbrella" surface while allowing thickness-varying sphere outer surface.
    for (let col = 0; col < params.widthSegments; col++) {
      const i0 = bottomBaseRow + col;
      const i1 = bottomBaseRow + col + 1;
      const so0 = i0 + vertexCount;
      const so1 = i1 + vertexCount;
      const st0 = outerTopStart + col;
      const st1 = outerTopStart + col + 1;

      // Two triangles connecting sphere outer ring to stand outerTop ring.
      wallAndStand.push(so0, so1, st1);
      wallAndStand.push(so0, st1, st0);
    }

    // Rim wall that connects stand outerTop -> inner surface at the cut latitude.
    for (let col = 0; col < params.widthSegments; col++) {
      const i0 = bottomBaseRow + col;
      const i1 = bottomBaseRow + col + 1;
      const o0 = outerTopStart + col;
      const o1 = outerTopStart + col + 1;

      wallAndStand.push(o0, o1, i1);
      wallAndStand.push(o0, i1, i0);
    }

    // Side wall of the stand (outer).
    for (let col = 0; col < params.widthSegments; col++) {
      const oTop0 = outerTopStart + col;
      const oTop1 = outerTopStart + col + 1;
      const oBot0 = outerBottomStart + col;
      const oBot1 = outerBottomStart + col + 1;

      // Outer wall (faces outward)
      wallAndStand.push(oTop0, oTop1, oBot1);
      wallAndStand.push(oTop0, oBot1, oBot0);
    }

    const capFacesUp = false; // Hole is always at the bottom before rotation.

    // Inner wall of the stand (faces inward) by extruding the inner ring to the bottom.
    for (let col = 0; col < params.widthSegments; col++) {
      const iTop0 = bottomBaseRow + col;
      const iTop1 = bottomBaseRow + col + 1;
      const iBot0 = innerBottomStart + col;
      const iBot1 = innerBottomStart + col + 1;

      // Reverse winding so the wall faces inward.
      wallAndStand.push(iTop1, iTop0, iBot0);
      wallAndStand.push(iTop1, iBot0, iBot1);
    }

    // Cap the base of the stand with an annulus (outerBottom <-> innerBottom).
    // This keeps the hole open while closing the solid wall volume.
    for (let col = 0; col < params.widthSegments; col++) {
      const o0 = outerBottomStart + col;
      const o1 = outerBottomStart + col + 1;
      const i0 = innerBottomStart + col;
      const i1 = innerBottomStart + col + 1;

      if (capFacesUp) {
        // Outside is +Y.
        wallAndStand.push(o0, i1, o1);
        wallAndStand.push(o0, i0, i1);
      } else {
        // Outside is -Y.
        wallAndStand.push(o0, o1, i1);
        wallAndStand.push(o0, i1, i0);
      }
    }
  }

  if (topHole.enabled) {
    const topBaseRow = topHole.ringRow * rowVerts;

    // Close the top opening with an annular rim between the inner and outer surfaces.
    for (let col = 0; col < params.widthSegments; col++) {
      const i0 = topBaseRow + col;
      const i1 = topBaseRow + col + 1;
      const o0 = i0 + vertexCount;
      const o1 = i1 + vertexCount;

      wallAndStand.push(o0, i1, o1);
      wallAndStand.push(o0, i0, i1);
    }
  }

  const combined = new THREE.BufferGeometry();
  combined.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  combined.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

  const combinedIndexArray = [...keptOuter, ...keptInner, ...wallAndStand];
  const IndexArrayCtor = totalVertexCount > 65535 ? Uint32Array : Uint16Array;
  const combinedIndex = new IndexArrayCtor(combinedIndexArray.length);
  for (let i = 0; i < combinedIndexArray.length; i++) combinedIndex[i] = combinedIndexArray[i];
  combined.setIndex(new THREE.BufferAttribute(combinedIndex, 1));

  // Group indices so the viewer can assign different materials (e.g., outer textured).
  combined.clearGroups();
  if (keptOuter.length > 0) combined.addGroup(0, keptOuter.length, 0);
  if (keptInner.length > 0) combined.addGroup(keptOuter.length, keptInner.length, 1);
  if (wallAndStand.length > 0) combined.addGroup(keptOuter.length + keptInner.length, wallAndStand.length, 2);

  // Rotate geometry to move the hole location without rotating sampled image orientation.
  if (hasHoleRotation) {
    combined.applyMatrix4(holeRotation);
  }

  combined.computeVertexNormals();

  return {
    geometry: combined,
    summary: {
      vertexCount: totalVertexCount,
      triangleCount: combinedIndexArray.length / 3,
    },
  };
}
