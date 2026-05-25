import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type RotationAxis = 'x' | 'y' | 'z';

export type AnimationSettings = {
  enabled: boolean;
  rotationSpeedDegPerSec: number;
  rotationAxis: RotationAxis;
  refreshRateHz: number;
};

export const defaultAnimationSettings: AnimationSettings = {
  enabled: false,
  rotationSpeedDegPerSec: 20,
  rotationAxis: 'y',
  refreshRateHz: 60,
};

export type SceneHandle = {
  setMesh(mesh: THREE.Mesh | null): void;
  setAnimationSettings(next: AnimationSettings): void;
  resize(): void;
  dispose(): void;
};

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

  let currentMesh: THREE.Mesh | null = null;
  let animationSettings: AnimationSettings = { ...defaultAnimationSettings };

  function setMesh(mesh: THREE.Mesh | null) {
    if (currentMesh) scene.remove(currentMesh);
    currentMesh = mesh;
    if (currentMesh) scene.add(currentMesh);
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

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));

    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  let raf = 0;
  let lastFrameMs = performance.now();
  let lastRenderMs = 0;
  function frame(nowMs: number) {
    raf = requestAnimationFrame(frame);

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

  resize();
  raf = requestAnimationFrame(frame);

  function dispose() {
    cancelAnimationFrame(raf);
    controls.dispose();
    renderer.dispose();
  }

  return { setMesh, setAnimationSettings, resize, dispose };
}
