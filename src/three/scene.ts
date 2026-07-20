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
  invalidate(): void;
  resize(): void;
  dispose(): void;
};

export type SceneResourceLifecycle = {
  start(): void;
  invalidate(): void;
  dispose(): void;
  snapshot(): Readonly<{ disposed: boolean; running: boolean; frameRequest: number | null }>;
};

type SceneResourceLifecycleDependencies = {
  requestFrame(callback: FrameRequestCallback): number;
  cancelFrame(id: number): void;
  renderFrame(nowMs: number, forceRender: boolean): boolean;
  removeInvalidationListeners?(): void;
  clearMesh(): void;
  disposeControls(): void;
  disposeRenderer(): void;
};

export function createSceneResourceLifecycle(
  dependencies: SceneResourceLifecycleDependencies,
): SceneResourceLifecycle {
  let disposed = false;
  let frameRequest: number | null = null;
  let rendering = false;
  let invalidatedWhileRendering = false;
  let forceRenderPending = false;

  const requestNextFrame = (forceRender = true) => {
    if (disposed) return;
    forceRenderPending ||= forceRender;
    if (frameRequest !== null) return;
    if (rendering) {
      invalidatedWhileRendering = true;
      return;
    }
    frameRequest = dependencies.requestFrame(frame);
  };

  const frame: FrameRequestCallback = (nowMs) => {
    frameRequest = null;
    if (disposed) return;
    rendering = true;
    invalidatedWhileRendering = false;
    const forceRender = forceRenderPending;
    forceRenderPending = false;
    let keepRunning = false;
    try {
      keepRunning = dependencies.renderFrame(nowMs, forceRender);
    } finally {
      rendering = false;
    }
    if (!disposed && (keepRunning || invalidatedWhileRendering)) requestNextFrame(false);
  };

  return {
    start() {
      requestNextFrame();
    },
    invalidate: requestNextFrame,
    dispose() {
      if (disposed) return;
      disposed = true;
      const pendingFrame = frameRequest;
      frameRequest = null;
      let firstError: unknown = null;
      const cleanup = [
        () => { if (pendingFrame !== null) dependencies.cancelFrame(pendingFrame); },
        () => dependencies.removeInvalidationListeners?.(),
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

type SceneFrameLoopDependencies = {
  getMesh(): THREE.Mesh | null;
  updateControls(): boolean;
  updateCameraLight(): void;
  render(): void;
};

export type SceneFrameLoop = {
  setAnimationSettings(next: AnimationSettings): void;
  renderFrame(nowMs: number, forceRender?: boolean): boolean;
};

function normalizeAnimationSettings(next: AnimationSettings): AnimationSettings {
  const refreshRateHz = Math.min(240, Math.max(1, Math.round(next.refreshRateHz)));
  const rotationAxis: RotationAxis = next.rotationAxis === 'x' || next.rotationAxis === 'z'
    ? next.rotationAxis
    : 'y';
  return {
    enabled: Boolean(next.enabled),
    rotationSpeedDegPerSec: Number.isFinite(next.rotationSpeedDegPerSec)
      ? next.rotationSpeedDegPerSec
      : defaultAnimationSettings.rotationSpeedDegPerSec,
    rotationAxis,
    refreshRateHz,
  };
}

/** Renders one demanded frame and reports whether animation/damping needs another. */
export function createSceneFrameLoop(
  dependencies: SceneFrameLoopDependencies,
  initialNowMs = performance.now(),
): SceneFrameLoop {
  let animationSettings = { ...defaultAnimationSettings };
  let lastFrameMs = initialNowMs;
  let lastRenderMs: number | null = null;

  return {
    setAnimationSettings(next) {
      animationSettings = normalizeAnimationSettings(next);
    },
    renderFrame(nowMs, forceRender = false) {
      const mesh = dependencies.getMesh();
      const animationActive = animationSettings.enabled && mesh !== null;
      const deltaSec = Math.max(0, Math.min(0.1, (nowMs - lastFrameMs) / 1000));
      lastFrameMs = nowMs;

      if (animationActive && mesh) {
        const angle = THREE.MathUtils.degToRad(animationSettings.rotationSpeedDegPerSec) * deltaSec;
        mesh.rotation[animationSettings.rotationAxis] += angle;
      }

      const controlsChanged = dependencies.updateControls();
      const minRenderIntervalMs = 1000 / animationSettings.refreshRateHz;
      const animationRenderDue = lastRenderMs === null || nowMs - lastRenderMs >= minRenderIntervalMs;
      if (forceRender || !animationActive || controlsChanged || animationRenderDue) {
        lastRenderMs = nowMs;
        dependencies.updateCameraLight();
        dependencies.render();
      }

      return animationActive || controlsChanged;
    },
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
  let resourceLifecycle: SceneResourceLifecycle | null = null;
  const invalidate = () => resourceLifecycle?.invalidate();

  function setMesh(mesh: THREE.Mesh | null) {
    if (currentMesh) scene.remove(currentMesh);
    currentMesh = mesh;
    if (currentMesh) scene.add(currentMesh);
    invalidate();
  }

  function drainControlsDamping() {
    const dampingWasEnabled = controls.enableDamping;
    // A non-damped update applies and clears pending orbit/pan deltas before reframing.
    controls.enableDamping = false;
    controls.update();
    invalidate();
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
    invalidate();
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
    invalidate();
  }

  function setAnimationSettings(next: AnimationSettings) {
    frameLoop.setAnimationSettings(next);
    invalidate();
  }

  function setCenterLightSettings(next: CenterLightSettings) {
    const intensity = Number.isFinite(next.intensity)
      ? Math.max(0, Math.min(100, next.intensity))
      : defaultCenterLightSettings.intensity;

    centerLight.intensity = intensity;
    centerLight.visible = Boolean(next.enabled) && intensity > 0;
    invalidate();
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));

    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    invalidate();
  }

  const frameLoop = createSceneFrameLoop({
    getMesh: () => currentMesh,
    updateControls: () => controls.update(),
    updateCameraLight: () => cameraLight.position.copy(camera.position),
    render: () => renderer.render(scene, camera),
  });

  const onControlsChange = () => invalidate();
  resourceLifecycle = createSceneResourceLifecycle({
    requestFrame: (callback) => requestAnimationFrame(callback),
    cancelFrame: (id) => cancelAnimationFrame(id),
    renderFrame: frameLoop.renderFrame,
    removeInvalidationListeners: () => controls.removeEventListener('change', onControlsChange),
    clearMesh: () => setMesh(null),
    disposeControls: () => controls.dispose(),
    disposeRenderer: () => renderer.dispose(),
  });
  initializeSceneResourceLifecycle(resourceLifecycle, () => {
    controls.addEventListener('change', onControlsChange);
    resize();
    resourceLifecycle.start();
  });

  return {
    setMesh,
    fitCameraToBounds,
    resetLegacyCameraFrame,
    setAnimationSettings,
    setCenterLightSettings,
    invalidate,
    resize,
    dispose: resourceLifecycle.dispose,
  };
}
