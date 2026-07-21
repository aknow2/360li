import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { BuiltPart } from '../domain/builtPart';
import { createScene, type AnimationSettings, type CenterLightSettings, type SceneHandle } from '../three/scene';

export type TextureMaterialTarget = {
  map: THREE.Texture | null;
  needsUpdate: boolean;
};

type DisposableMaterial = TextureMaterialTarget & { dispose(): void };

export type ViewerMaterials = {
  outer: DisposableMaterial;
  inner: DisposableMaterial;
  wall: DisposableMaterial;
};

type TextureCanvas = HTMLCanvasElement;

export type GrayscaleTextureDependencies = {
  createImageData(bytes: Uint8ClampedArray<ArrayBuffer>, width: number, height: number): ImageData;
  createCanvas(width: number, height: number): TextureCanvas;
  createTexture(canvas: TextureCanvas): THREE.Texture;
};

export type GrayscaleTextureSnapshot = Readonly<{
  disposed: boolean;
  attached: boolean;
  hasGrayBytes: boolean;
  hasImageData: boolean;
  hasCanvas: boolean;
  hasTexture: boolean;
}>;

export type GrayscaleTextureHandle = {
  attach(material: TextureMaterialTarget): void;
  detach(): void;
  dispose(): void;
  snapshot(): GrayscaleTextureSnapshot;
};

function defaultTextureDependencies(): GrayscaleTextureDependencies {
  return {
    createImageData: (bytes, width, height) => new ImageData(bytes, width, height),
    createCanvas(width, height) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      return canvas;
    },
    createTexture(canvas) {
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      // Keep image-space "top" aligned with v=0 sampling convention used elsewhere.
      texture.flipY = false;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      return texture;
    },
  };
}

/**
 * Creates the complete Viewer-owned texture resource from a private pixel copy.
 * The source ImageData and its typed-array backing buffer are read-only inputs.
 */
// The testable lifecycle contract intentionally lives beside the component it implements.
// eslint-disable-next-line react-refresh/only-export-components
export function createGrayscaleTextureHandle(
  source: ImageData,
  dependencies: GrayscaleTextureDependencies = defaultTextureDependencies(),
): GrayscaleTextureHandle {
  let grayBytes: Uint8ClampedArray<ArrayBuffer> | null = new Uint8ClampedArray(source.data);
  for (let i = 0; i < grayBytes.length; i += 4) {
    const y = Math.round(
      0.2126 * grayBytes[i] + 0.7152 * grayBytes[i + 1] + 0.0722 * grayBytes[i + 2],
    );
    grayBytes[i] = y;
    grayBytes[i + 1] = y;
    grayBytes[i + 2] = y;
    grayBytes[i + 3] = 255;
  }

  let imageData: ImageData | null = null;
  let canvas: TextureCanvas | null = null;
  let texture: THREE.Texture | null = null;
  try {
    imageData = dependencies.createImageData(grayBytes, source.width, source.height);
    canvas = dependencies.createCanvas(source.width, source.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('2D canvas context unavailable for Preview texture.');
    context.putImageData(imageData, 0, 0);
    texture = dependencies.createTexture(canvas);
  } catch (error) {
    if (canvas) {
      try { canvas.width = 0; } catch { /* Preserve the allocation error. */ }
      try { canvas.height = 0; } catch { /* Preserve the allocation error. */ }
    }
    grayBytes = null;
    imageData = null;
    canvas = null;
    throw error;
  }
  let attachedMaterial: TextureMaterialTarget | null = null;
  let disposed = false;

  function detach() {
    if (!attachedMaterial) return;
    if (attachedMaterial.map === texture) attachedMaterial.map = null;
    attachedMaterial.needsUpdate = true;
    attachedMaterial = null;
  }

  return {
    attach(material) {
      if (disposed || !texture) return;
      if (attachedMaterial && attachedMaterial !== material) detach();
      material.map = texture;
      material.needsUpdate = true;
      attachedMaterial = material;
    },
    detach,
    dispose() {
      if (disposed) return;
      disposed = true;
      let firstError: unknown = null;
      try { detach(); } catch (error) { firstError = error; }
      try { texture?.dispose(); } catch (error) { firstError ??= error; }
      if (canvas) {
        try { canvas.width = 0; } catch (error) { firstError ??= error; }
        try { canvas.height = 0; } catch (error) { firstError ??= error; }
      }
      texture = null;
      canvas = null;
      imageData = null;
      grayBytes = null;
      attachedMaterial = null;
      if (firstError) throw firstError;
    },
    snapshot() {
      return Object.freeze({
        disposed,
        attached: attachedMaterial !== null,
        hasGrayBytes: grayBytes !== null,
        hasImageData: imageData !== null,
        hasCanvas: canvas !== null,
        hasTexture: texture !== null,
      });
    },
  };
}

type PresentationSceneHandle = Pick<
  SceneHandle,
  'setMesh' | 'resize' | 'fitCameraToBounds' | 'resetLegacyCameraFrame'
> & Partial<Pick<SceneHandle, 'invalidate'>>;

export type ViewerPresentationDependencies = {
  cloneGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry;
  createMesh(geometry: THREE.BufferGeometry, materials: ViewerMaterials): THREE.Mesh;
  getBounds(geometry: THREE.BufferGeometry): THREE.Box3;
  createTextureHandle(source: ImageData): GrayscaleTextureHandle;
};

export type ViewerPresentationSnapshot = Readonly<{
  disposed: boolean;
  cameraMode: 'legacy' | 'split-fitted';
  hasBuiltPart: boolean;
  hasMesh: boolean;
  hasGeometryClone: boolean;
  hasTextureHandle: boolean;
}>;

export type ViewerPresentationController = {
  present(builtPart: BuiltPart | null): void;
  setShowTexture(show: boolean): void;
  dispose(): void;
  snapshot(): ViewerPresentationSnapshot;
};

const defaultPresentationDependencies: ViewerPresentationDependencies = {
  cloneGeometry: (source) => source.clone(),
  createMesh: (geometry, materials) => new THREE.Mesh(
    geometry,
    [materials.outer, materials.inner, materials.wall] as unknown as THREE.Material[],
  ),
  getBounds(geometry) {
    geometry.computeBoundingBox();
    if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) {
      throw new Error('Preview geometry requires non-empty bounds.');
    }
    return geometry.boundingBox.clone();
  },
  createTextureHandle: createGrayscaleTextureHandle,
};

function isLegacyPart(builtPart: BuiltPart): boolean {
  const { horizontalSplitCount, verticalSplitCount, splitIndex } = builtPart.snapshot.params;
  return horizontalSplitCount === 1 && verticalSplitCount === 1 && splitIndex === 1;
}

/** Owns the displayed clone/texture while retaining camera transition state across null. */
// eslint-disable-next-line react-refresh/only-export-components
export function createViewerPresentationController(
  scene: PresentationSceneHandle,
  materials: ViewerMaterials,
  dependencies: ViewerPresentationDependencies = defaultPresentationDependencies,
  initialShowTexture = true,
): ViewerPresentationController {
  let currentBuiltPart: BuiltPart | null = null;
  let mesh: THREE.Mesh | null = null;
  let geometryClone: THREE.BufferGeometry | null = null;
  let textureHandle: GrayscaleTextureHandle | null = null;
  let showTexture = initialShowTexture;
  let cameraMode: 'legacy' | 'split-fitted' = 'legacy';
  let disposed = false;

  function removeAndReleaseCurrent() {
    if (!mesh && !geometryClone && !textureHandle && !currentBuiltPart) return;
    const releasedTexture = textureHandle;
    const releasedGeometry = geometryClone;
    mesh = null;
    textureHandle = null;
    geometryClone = null;
    currentBuiltPart = null;
    let firstError: unknown = null;
    for (const release of [
      () => scene.setMesh(null),
      () => releasedTexture?.detach(),
      () => releasedTexture?.dispose(),
      () => releasedGeometry?.dispose(),
    ]) {
      try { release(); } catch (error) { firstError ??= error; }
    }
    if (firstError) throw firstError;
  }

  return {
    present(builtPart) {
      if (disposed || builtPart === currentBuiltPart) return;
      removeAndReleaseCurrent();
      if (!builtPart) return;

      try {
        geometryClone = dependencies.cloneGeometry(builtPart.geometry);
        const bounds = dependencies.getBounds(geometryClone);
        textureHandle = dependencies.createTextureHandle(builtPart.workingImage);
        mesh = dependencies.createMesh(geometryClone, materials);
        currentBuiltPart = builtPart;
        if (showTexture) textureHandle.attach(materials.outer);

        scene.setMesh(mesh);
        if (isLegacyPart(builtPart)) {
          if (cameraMode === 'split-fitted') scene.resetLegacyCameraFrame();
          scene.resize();
          cameraMode = 'legacy';
        } else {
          scene.resize();
          scene.fitCameraToBounds(bounds);
          cameraMode = 'split-fitted';
        }
      } catch (error) {
        try { removeAndReleaseCurrent(); } catch { /* Preserve the setup error. */ }
        throw error;
      }
    },
    setShowTexture(show) {
      if (disposed || show === showTexture) return;
      showTexture = show;
      if (!textureHandle) return;
      if (show) textureHandle.attach(materials.outer);
      else textureHandle.detach();
      scene.invalidate?.();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      let firstError: unknown = null;
      try { removeAndReleaseCurrent(); } catch (error) { firstError = error; }
      materials.outer.map = null;
      materials.outer.needsUpdate = true;
      for (const ownedMaterial of [materials.outer, materials.inner, materials.wall]) {
        try { ownedMaterial.dispose(); } catch (error) { firstError ??= error; }
      }
      if (firstError) throw firstError;
    },
    snapshot() {
      return Object.freeze({
        disposed,
        cameraMode,
        hasBuiltPart: currentBuiltPart !== null,
        hasMesh: mesh !== null,
        hasGeometryClone: geometryClone !== null,
        hasTextureHandle: textureHandle !== null,
      });
    },
  };
}

export type ViewerMountLifecycle = { dispose(): void };

type ElementResizeObserver = {
  observe(target: Element): void;
  disconnect(): void;
};

/** Acquires an observer and rolls it back if observe() fails before returning cleanup. */
// eslint-disable-next-line react-refresh/only-export-components
export function observeElementResize(
  createObserver: (callback: ResizeObserverCallback) => ElementResizeObserver,
  target: Element,
  onResize: () => void,
): () => void {
  const observer = createObserver(() => onResize());
  try {
    observer.observe(target);
  } catch (error) {
    try { observer.disconnect(); } catch { /* Preserve the observe error. */ }
    throw error;
  }
  let disconnected = false;
  return () => {
    if (disconnected) return;
    disconnected = true;
    observer.disconnect();
  };
}

type ViewerMountLifecycleDependencies = {
  addWindowResizeListener(listener: () => void): void;
  removeWindowResizeListener(listener: () => void): void;
  resizeListener: () => void;
  observeResize(): (() => void) | null;
  disposePresentation(): void;
  disposeScene(): void;
};

// eslint-disable-next-line react-refresh/only-export-components
export function createViewerMountLifecycle(
  dependencies: ViewerMountLifecycleDependencies,
): ViewerMountLifecycle {
  let disconnectObserver: (() => void) | null = null;
  let setupFailed = false;
  let setupError: unknown;
  try {
    dependencies.addWindowResizeListener(dependencies.resizeListener);
    disconnectObserver = dependencies.observeResize();
  } catch (error) {
    setupFailed = true;
    setupError = error;
  }
  if (setupFailed) {
    for (const rollback of [
      () => dependencies.removeWindowResizeListener(dependencies.resizeListener),
      () => disconnectObserver?.(),
      dependencies.disposePresentation,
      dependencies.disposeScene,
    ]) {
      try { rollback(); } catch { /* Preserve the setup error and continue rollback. */ }
    }
    disconnectObserver = null;
    throw setupError;
  }
  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      let firstError: unknown = null;
      for (const release of [
        () => dependencies.removeWindowResizeListener(dependencies.resizeListener),
        () => disconnectObserver?.(),
        dependencies.disposePresentation,
        dependencies.disposeScene,
      ]) {
        try { release(); } catch (error) { firstError ??= error; }
      }
      disconnectObserver = null;
      if (firstError) throw firstError;
    },
  };
}

function createViewerMaterials(): ViewerMaterials {
  const outer = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0,
    side: THREE.FrontSide,
    transparent: true,
    opacity: 0.95,
  });
  const inner = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.22,
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.35,
  });
  const wall = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.26,
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.6,
  });
  return { outer, inner, wall };
}

export type ViewerProps = {
  builtPart: BuiltPart | null;
  showTexture?: boolean;
  animationSettings?: AnimationSettings;
  centerLightSettings?: CenterLightSettings;
  placeholderText?: string;
};

export function Viewer({
  builtPart,
  showTexture = true,
  animationSettings,
  centerLightSettings,
  placeholderText = '3D preview will appear here.',
}: ViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<SceneHandle | null>(null);
  const presentationRef = useRef<ViewerPresentationController | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = createScene(canvas);
    const presentation = createViewerPresentationController(
      scene,
      createViewerMaterials(),
      defaultPresentationDependencies,
    );
    sceneRef.current = scene;
    presentationRef.current = presentation;

    const onWindowResize = () => scene.resize();
    const mountLifecycle = createViewerMountLifecycle({
      addWindowResizeListener: (listener) => window.addEventListener('resize', listener),
      removeWindowResizeListener: (listener) => window.removeEventListener('resize', listener),
      resizeListener: onWindowResize,
      observeResize() {
        if (!('ResizeObserver' in window)) return null;
        return observeElementResize(
          (callback) => new ResizeObserver(callback),
          canvas,
          () => scene.resize(),
        );
      },
      disposePresentation: () => presentation.dispose(),
      disposeScene: () => scene.dispose(),
    });

    return () => {
      try {
        mountLifecycle.dispose();
      } finally {
        if (presentationRef.current === presentation) presentationRef.current = null;
        if (sceneRef.current === scene) sceneRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    presentationRef.current?.setShowTexture(showTexture);
  }, [showTexture]);

  useEffect(() => {
    presentationRef.current?.present(builtPart);
  }, [builtPart]);

  const animationEnabled = animationSettings?.enabled;
  const animationSpeed = animationSettings?.rotationSpeedDegPerSec;
  const animationAxis = animationSettings?.rotationAxis;
  const animationRefreshRate = animationSettings?.refreshRateHz;
  useEffect(() => {
    if (
      animationEnabled === undefined || animationSpeed === undefined ||
      animationAxis === undefined || animationRefreshRate === undefined
    ) return;
    sceneRef.current?.setAnimationSettings({
      enabled: animationEnabled,
      rotationSpeedDegPerSec: animationSpeed,
      rotationAxis: animationAxis,
      refreshRateHz: animationRefreshRate,
    });
  }, [animationAxis, animationEnabled, animationRefreshRate, animationSpeed]);

  const centerLightEnabled = centerLightSettings?.enabled;
  const centerLightIntensity = centerLightSettings?.intensity;
  useEffect(() => {
    if (centerLightEnabled === undefined || centerLightIntensity === undefined) return;
    sceneRef.current?.setCenterLightSettings({
      enabled: centerLightEnabled,
      intensity: centerLightIntensity,
    });
  }, [centerLightEnabled, centerLightIntensity]);

  return (
    <div
      aria-label="3D preview"
      style={{
        width: '100%',
        height: '100%',
        border: '1px solid rgba(0,0,0,0.15)',
        borderRadius: 8,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      {!builtPart ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            opacity: 0.8,
            pointerEvents: 'none',
          }}
        >
          {placeholderText}
        </div>
      ) : null}
    </div>
  );
}
