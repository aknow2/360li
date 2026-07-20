import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { calculateCameraFit, LEGACY_CAMERA_FRAME } from './cameraFit';

export type RotationAxis = 'x' | 'y' | 'z';

export type AnimationSettings = {
  enabled: boolean;
  rotationSpeedDegPerSec: number;
  rotationAxis: RotationAxis;
  refreshRateHz: number;
};

export type CenterLightSettings = {
  enabled: boolean;
  intensity: number;
};

export const defaultAnimationSettings: AnimationSettings = {
  enabled: false,
  rotationSpeedDegPerSec: 20,
  rotationAxis: 'y',
  refreshRateHz: 60,
};

export const defaultCenterLightSettings: CenterLightSettings = {
  enabled: false,
  intensity: 4,
};

export type SceneHandle = {
  setMesh(mesh: THREE.Mesh | null): void;
  fitCameraToBounds(bounds: THREE.Box3): void;
  resetLegacyCameraFrame(): void;
  setAnimationSettings(next: AnimationSettings): void;
  setCenterLightSettings(next: CenterLightSettings): void;
  resize(): void;
  dispose(): void;
};

export type SceneResourceLifecycle = {
  start(): void;
  dispose(): void;
  snapshot(): Readonly<{ disposed: boolean; running: boolean; frameRequest: number | null }>;
};

type SceneResourceLifecycleDependencies = {
  requestFrame(callback: FrameRequestCallback): number;
  cancelFrame(id: number): void;
  renderFrame(nowMs: number): void;
  clearMesh(): void;
  disposeControls(): void;
  disposeRenderer(): void;
};

export function createSceneResourceLifecycle(
  dependencies: SceneResourceLifecycleDependencies,
): SceneResourceLifecycle {
  let disposed = false;
  let frameRequest: number | null = null;

  const frame: FrameRequestCallback = (nowMs) => {
    frameRequest = null;
    if (disposed) return;
    dependencies.renderFrame(nowMs);
    if (!disposed) frameRequest = dependencies.requestFrame(frame);
  };

  return {
    start() {
      if (disposed || frameRequest !== null) return;
      frameRequest = dependencies.requestFrame(frame);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const pendingFrame = frameRequest;
      frameRequest = null;
      let firstError: unknown = null;
      const cleanup = [
        () => { if (pendingFrame !== null) dependencies.cancelFrame(pendingFrame); },
        dependencies.clearMesh,
        dependencies.disposeControls,
        dependencies.disposeRenderer,
      ];
      for (const release of cleanup) {
        try { release(); } catch (error) { firstError ??= error; }
      }
      if (firstError) throw firstError;
    },
    snapshot: () => Object.freeze({
      disposed,
      running: !disposed && frameRequest !== null,
      frameRequest,
    }),
  };
}

/** Bridges initialization failures to the already-allocated scene resource owner. */
export function initializeSceneResourceLifecycle(
  lifecycle: SceneResourceLifecycle,
  initialize: () => void,
): void {
  try {
    initialize();
  } catch (error) {
    try { lifecycle.dispose(); } catch { /* Preserve the initialization error. */ }
    throw error;
  }
}

export function createScene(canvas: HTMLCanvasElement): SceneHandle {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10000);
  camera.position.set(0, 0, 180);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;

  const ambient = new THREE.AmbientLight(0xffffff, 1.1);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
  hemi.position.set(0, 1, 0);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffffff, 0.8);
  key.position.set(1, 1, 1);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(-1, 0.2, -1);
  scene.add(fill);

  const cameraLight = new THREE.PointLight(0xffffff, 0.6, 0, 2);
  scene.add(cameraLight);

  const centerLight = new THREE.PointLight(0xffffff, 0, 0, 0);
  centerLight.position.set(0, 0, 0);
  centerLight.visible = false;
  scene.add(centerLight);

  let currentMesh: THREE.Mesh | null = null;
  let animationSettings: AnimationSettings = { ...defaultAnimationSettings };

  function setMesh(mesh: THREE.Mesh | null) {
    if (currentMesh) scene.remove(currentMesh);
    currentMesh = mesh;
    if (currentMesh) scene.add(currentMesh);
  }

  function drainControlsDamping() {
    const dampingWasEnabled = controls.enableDamping;
    // A non-damped update applies and clears pending orbit/pan deltas before reframing.
    controls.enableDamping = false;
    controls.update();
    controls.enableDamping = dampingWasEnabled;
  }

  function fitCameraToBounds(bounds: THREE.Box3) {
    drainControlsDamping();
    const fit = calculateCameraFit(bounds, {
      fovDeg: camera.fov,
      aspect: camera.aspect,
      position: camera.position,
      target: controls.target,
    });
    controls.target.set(fit.target.x, fit.target.y, fit.target.z);
    camera.position.set(fit.position.x, fit.position.y, fit.position.z);
    camera.near = fit.near;
    camera.far = fit.far;
    camera.zoom = fit.zoom;
    controls.minDistance = fit.minDistance;
    controls.maxDistance = fit.maxDistance;
    camera.lookAt(controls.target);
    camera.updateProjectionMatrix();
    controls.update();
  }

  function resetLegacyCameraFrame() {
    drainControlsDamping();
    camera.position.set(
      LEGACY_CAMERA_FRAME.position.x,
      LEGACY_CAMERA_FRAME.position.y,
      LEGACY_CAMERA_FRAME.position.z,
    );
    controls.target.set(
      LEGACY_CAMERA_FRAME.target.x,
      LEGACY_CAMERA_FRAME.target.y,
      LEGACY_CAMERA_FRAME.target.z,
    );
    camera.near = LEGACY_CAMERA_FRAME.near;
    camera.far = LEGACY_CAMERA_FRAME.far;
    camera.zoom = LEGACY_CAMERA_FRAME.zoom;
    controls.minDistance = LEGACY_CAMERA_FRAME.minDistance;
    controls.maxDistance = LEGACY_CAMERA_FRAME.maxDistance;
    camera.lookAt(controls.target);
    camera.updateProjectionMatrix();
    controls.update();
  }

  function setAnimationSettings(next: AnimationSettings) {
    const refreshRateHz = Math.min(240, Math.max(1, Math.round(next.refreshRateHz)));
    const axis: RotationAxis = next.rotationAxis === 'x' || next.rotationAxis === 'z' ? next.rotationAxis : 'y';

    animationSettings = {
      enabled: Boolean(next.enabled),
      rotationSpeedDegPerSec: Number.isFinite(next.rotationSpeedDegPerSec)
        ? next.rotationSpeedDegPerSec
        : defaultAnimationSettings.rotationSpeedDegPerSec,
      rotationAxis: axis,
      refreshRateHz,
    };
  }

  function setCenterLightSettings(next: CenterLightSettings) {
    const intensity = Number.isFinite(next.intensity)
      ? Math.max(0, Math.min(100, next.intensity))
      : defaultCenterLightSettings.intensity;

    centerLight.intensity = intensity;
    centerLight.visible = Boolean(next.enabled) && intensity > 0;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));

    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  let lastFrameMs = performance.now();
  let lastRenderMs = 0;
  function frame(nowMs: number) {
    const deltaSec = Math.max(0, Math.min(0.1, (nowMs - lastFrameMs) / 1000));
    lastFrameMs = nowMs;

    if (animationSettings.enabled && currentMesh) {
      const angle = THREE.MathUtils.degToRad(animationSettings.rotationSpeedDegPerSec) * deltaSec;
      currentMesh.rotation[animationSettings.rotationAxis] += angle;
    }

    const minRenderIntervalMs = 1000 / Math.max(1, animationSettings.refreshRateHz);
    if (lastRenderMs && nowMs - lastRenderMs < minRenderIntervalMs) {
      return;
    }
    lastRenderMs = nowMs;

    controls.update();
    cameraLight.position.copy(camera.position);
    renderer.render(scene, camera);
  }

  const resourceLifecycle = createSceneResourceLifecycle({
    requestFrame: (callback) => requestAnimationFrame(callback),
    cancelFrame: (id) => cancelAnimationFrame(id),
    renderFrame: frame,
    clearMesh: () => setMesh(null),
    disposeControls: () => controls.dispose(),
    disposeRenderer: () => renderer.dispose(),
  });
  initializeSceneResourceLifecycle(resourceLifecycle, () => {
    resize();
    resourceLifecycle.start();
  });

  return {
    setMesh,
    fitCameraToBounds,
    resetLegacyCameraFrame,
    setAnimationSettings,
    setCenterLightSettings,
    resize,
    dispose: resourceLifecycle.dispose,
  };
}
