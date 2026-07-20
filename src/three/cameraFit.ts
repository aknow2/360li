import * as THREE from 'three';

export type CameraFitInput = Readonly<{
  fovDeg: number;
  aspect: number;
  position: THREE.Vector3;
  target: THREE.Vector3;
}>;

export type CameraFitValues = Readonly<{
  target: Readonly<{ x: number; y: number; z: number }>;
  direction: Readonly<{ x: number; y: number; z: number }>;
  position: Readonly<{ x: number; y: number; z: number }>;
  distance: number;
  margin: number;
  near: number;
  far: number;
  zoom: number;
  minDistance: number;
  maxDistance: number;
}>;

export const LEGACY_CAMERA_FRAME = Object.freeze({
  position: Object.freeze({ x: 0, y: 0, z: 180 }),
  target: Object.freeze({ x: 0, y: 0, z: 0 }),
  near: 0.1,
  far: 10000,
  zoom: 1,
  minDistance: 0,
  maxDistance: Infinity,
});

const FIT_MARGIN = 1.2;

function isFiniteVector(vector: THREE.Vector3): boolean {
  return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z);
}

function freezeVector(vector: THREE.Vector3): Readonly<{ x: number; y: number; z: number }> {
  return Object.freeze({ x: vector.x, y: vector.y, z: vector.z });
}

/**
 * Calculates a conservative camera frame without mutating the supplied bounds or
 * reading a camera/controls instance. A bounding sphere encloses the AABB for
 * every view direction; its depth radius keeps every corner in front of camera.
 */
export function calculateCameraFit(bounds: THREE.Box3, input: CameraFitInput): CameraFitValues {
  if (bounds.isEmpty() || !isFiniteVector(bounds.min) || !isFiniteVector(bounds.max)) {
    throw new Error('Camera fit requires non-empty finite bounds.');
  }
  if (!Number.isFinite(input.fovDeg) || input.fovDeg <= 0 || input.fovDeg >= 180) {
    throw new Error('Camera fit requires a finite FOV between 0 and 180 degrees.');
  }
  if (!Number.isFinite(input.aspect) || input.aspect <= 0) {
    throw new Error('Camera fit requires a finite positive aspect.');
  }

  const size = bounds.getSize(new THREE.Vector3());
  const radius = size.length() / 2;
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new Error('Camera fit requires non-empty finite bounds.');
  }
  const target = bounds.getCenter(new THREE.Vector3());
  const currentDirection = input.position.clone().sub(input.target);
  const direction = isFiniteVector(currentDirection) && currentDirection.lengthSq() > 0
    ? currentDirection.normalize()
    : new THREE.Vector3(0, 0, 1);

  const verticalHalfFov = THREE.MathUtils.degToRad(input.fovDeg) / 2;
  const verticalTangent = Math.tan(verticalHalfFov);
  const horizontalTangent = Math.tan(Math.atan(verticalTangent * input.aspect));
  const limitingTangent = Math.min(verticalTangent, horizontalTangent);
  const distance = radius + FIT_MARGIN * radius / limitingTangent;
  if (!Number.isFinite(limitingTangent) || limitingTangent <= 0 || !Number.isFinite(distance)) {
    throw new Error('Camera fit requires usable finite FOV and aspect values.');
  }

  const position = target.clone().addScaledVector(direction, distance);
  const near = Math.max(radius * 1e-4, (distance - radius) / 2);
  const far = distance + radius + radius * 1e-2;
  const minDistance = Math.max(0, distance - radius * 2);
  const maxDistance = distance + radius * 2;
  if (![...position.toArray(), near, far, minDistance, maxDistance].every(Number.isFinite)) {
    throw new Error('Camera fit calculation produced non-finite values.');
  }

  return Object.freeze({
    target: freezeVector(target),
    direction: freezeVector(direction),
    position: freezeVector(position),
    distance,
    margin: FIT_MARGIN,
    near,
    far,
    zoom: 1,
    minDistance,
    maxDistance,
  });
}
