import * as THREE from 'three';

function clamp(x: number, min: number, max: number): number {
  if (x < min) return min;
  if (x > max) return max;
  return x;
}

export function compensationFactor(normal: THREE.Vector3, viewDir: THREE.Vector3, minCos: number): number {
  const n = normal.clone().normalize();
  const v = viewDir.clone().normalize();
  const cos = n.dot(v);
  return Math.max(cos, clamp(minCos, 0, 1));
}
