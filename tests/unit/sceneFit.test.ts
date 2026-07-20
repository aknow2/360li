import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import * as THREE from 'three';
import {
  LEGACY_CAMERA_FRAME,
  calculateCameraFit,
} from '../../src/three/cameraFit';

const margin = 1.2;

function expectedDistance(bounds: THREE.Box3, fovDeg: number, aspect: number): number {
  const radius = bounds.getSize(new THREE.Vector3()).length() / 2;
  const verticalHalfFov = THREE.MathUtils.degToRad(fovDeg) / 2;
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * aspect);
  return radius + margin * radius / Math.min(Math.tan(verticalHalfFov), Math.tan(horizontalHalfFov));
}

function corners(bounds: THREE.Box3): THREE.Vector3[] {
  const { min, max } = bounds;
  return [
    new THREE.Vector3(min.x, min.y, min.z), new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(min.x, max.y, min.z), new THREE.Vector3(min.x, max.y, max.z),
    new THREE.Vector3(max.x, min.y, min.z), new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, min.z), new THREE.Vector3(max.x, max.y, max.z),
  ];
}

function assertCornersFitFrustumEnvelope(
  bounds: THREE.Box3,
  fit: ReturnType<typeof calculateCameraFit>,
  fovDeg: number,
  aspect: number,
): void {
  const target = new THREE.Vector3(fit.target.x, fit.target.y, fit.target.z);
  const cameraPosition = new THREE.Vector3(fit.position.x, fit.position.y, fit.position.z);
  const cameraToTarget = target.clone().sub(cameraPosition).normalize();
  const verticalTangent = Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2);
  const horizontalTangent = verticalTangent * aspect;
  const tolerance = 1e-12;

  for (const corner of corners(bounds)) {
    const cameraToCorner = corner.clone().sub(cameraPosition);
    const depth = cameraToCorner.dot(cameraToTarget);
    const perpendicularExtent = Math.sqrt(Math.max(0, cameraToCorner.lengthSq() - depth ** 2));

    assert.ok(depth > 0, `corner ${corner.toArray()} must be in front of the camera`);
    assert.ok(
      perpendicularExtent / depth <= horizontalTangent / fit.margin + tolerance,
      `corner ${corner.toArray()} must fit the horizontal margin envelope`,
    );
    assert.ok(
      perpendicularExtent / depth <= verticalTangent / fit.margin + tolerance,
      `corner ${corner.toArray()} must fit the vertical margin envelope`,
    );
  }
}

export async function registerTests(t: TestContext): Promise<void> {
  await t.test('centered/full landscape fit uses both FOVs, exact margin, preserves direction, and does not mutate bounds', () => {
    const bounds = new THREE.Box3(new THREE.Vector3(-60, -40, -20), new THREE.Vector3(60, 40, 20));
    const before = bounds.clone();
    const beforeCorners = corners(bounds).map((corner) => corner.toArray());
    const position = new THREE.Vector3(0, 0, 180);
    const target = new THREE.Vector3(0, 0, 0);
    const fit = calculateCameraFit(bounds, { fovDeg: 50, aspect: 16 / 9, position, target });
    const expected = expectedDistance(bounds, 50, 16 / 9);

    assert.deepEqual(fit.target, { x: 0, y: 0, z: 0 });
    assert.equal(fit.distance, expected);
    assert.deepEqual(fit.direction, { x: 0, y: 0, z: 1 });
    assert.deepEqual(fit.position, { x: 0, y: 0, z: expected });
    assert.equal(fit.margin, margin);
    assert.ok(Number.isFinite(fit.near) && Number.isFinite(fit.far));
    assert.ok(0 < fit.near && fit.near < fit.far);
    assert.ok(Number.isFinite(fit.minDistance) && Number.isFinite(fit.maxDistance));
    assert.ok(0 <= fit.minDistance && fit.minDistance < fit.distance && fit.distance < fit.maxDistance);
    assert.deepEqual(bounds, before);
    assert.deepEqual(corners(bounds).map((corner) => corner.toArray()), beforeCorners);
    assert.equal(Object.isFrozen(fit), true);
    assertCornersFitFrustumEnvelope(bounds, fit, 50, 16 / 9);
  });

  await t.test('off-center/small portrait fit targets the center and is horizontally FOV limited', () => {
    const bounds = new THREE.Box3(new THREE.Vector3(9, -3, 30), new THREE.Vector3(15, 5, 34));
    const fit = calculateCameraFit(bounds, {
      fovDeg: 60,
      aspect: 0.5,
      position: new THREE.Vector3(40, 20, 100),
      target: new THREE.Vector3(1, 2, 3),
    });
    const expectedDirection = new THREE.Vector3(40, 20, 100)
      .sub(new THREE.Vector3(1, 2, 3))
      .normalize();
    const verticalTangent = Math.tan(THREE.MathUtils.degToRad(60) / 2);
    const horizontalTangent = Math.tan(Math.atan(verticalTangent * 0.5));

    assert.deepEqual(fit.target, { x: 12, y: 1, z: 32 });
    assert.deepEqual(fit.direction, {
      x: expectedDirection.x,
      y: expectedDirection.y,
      z: expectedDirection.z,
    });
    assert.ok(horizontalTangent < verticalTangent);
    assert.equal(fit.distance, expectedDistance(bounds, 60, 0.5));
    assertCornersFitFrustumEnvelope(bounds, fit, 60, 0.5);
  });

  await t.test('landscape fit is vertically FOV limited when vertical tangent is smaller', () => {
    const bounds = new THREE.Box3(new THREE.Vector3(-2, -4, -6), new THREE.Vector3(2, 4, 6));
    const fit = calculateCameraFit(bounds, {
      fovDeg: 50,
      aspect: 2,
      position: new THREE.Vector3(10, 0, 0),
      target: new THREE.Vector3(0, 0, 0),
    });

    assert.ok(Math.tan(THREE.MathUtils.degToRad(50) / 2) < Math.tan(Math.atan(Math.tan(THREE.MathUtils.degToRad(50) / 2) * 2)));
    assert.equal(fit.distance, expectedDistance(bounds, 50, 2));
    assert.deepEqual(fit.direction, { x: 1, y: 0, z: 0 });
    assertCornersFitFrustumEnvelope(bounds, fit, 50, 2);
  });

  await t.test('coincident or nonfinite current frame uses +Z and returns finite values', () => {
    const bounds = new THREE.Box3(new THREE.Vector3(-1, -2, -3), new THREE.Vector3(4, 5, 6));
    for (const frame of [
      { position: new THREE.Vector3(3, 2, 1), target: new THREE.Vector3(3, 2, 1) },
      { position: new THREE.Vector3(Number.NaN, 0, 0), target: new THREE.Vector3(0, 0, 0) },
    ]) {
      const fit = calculateCameraFit(bounds, { fovDeg: 50, aspect: 1, ...frame });
      assert.deepEqual(fit.direction, { x: 0, y: 0, z: 1 });
      for (const value of [fit.position.x, fit.position.y, fit.position.z, fit.distance, fit.near, fit.far, fit.minDistance, fit.maxDistance]) {
        assert.ok(Number.isFinite(value));
      }
    }
  });

  await t.test('invalid bounds, FOV, and aspect fail with recoverable errors', () => {
    const validBounds = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
    const validFrame = { fovDeg: 50, aspect: 1, position: new THREE.Vector3(0, 0, 1), target: new THREE.Vector3() };
    assert.throws(() => calculateCameraFit(new THREE.Box3(), validFrame), /Camera fit requires non-empty finite bounds/);
    assert.throws(() => calculateCameraFit(new THREE.Box3(new THREE.Vector3(Number.NaN, 0, 0), new THREE.Vector3(1, 1, 1)), validFrame), /Camera fit requires non-empty finite bounds/);
    assert.throws(() => calculateCameraFit(validBounds, { ...validFrame, fovDeg: 0 }), /Camera fit requires a finite FOV between 0 and 180 degrees/);
    assert.throws(() => calculateCameraFit(validBounds, { ...validFrame, aspect: 0 }), /Camera fit requires a finite positive aspect/);
  });

  await t.test('legacy camera frame exposes the exact required reset values', () => {
    assert.deepEqual(LEGACY_CAMERA_FRAME, {
      position: { x: 0, y: 0, z: 180 },
      target: { x: 0, y: 0, z: 0 },
      near: 0.1,
      far: 10000,
      zoom: 1,
      minDistance: 0,
      maxDistance: Infinity,
    });
    assert.equal(Object.isFrozen(LEGACY_CAMERA_FRAME), true);
  });
}
