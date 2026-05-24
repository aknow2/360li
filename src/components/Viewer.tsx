import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { BufferGeometry } from 'three';
import { createScene, type SceneHandle } from '../three/scene';
import { createWorkingImage } from '../lithophane/workingImage';

type ViewerProps = {
  geometry: BufferGeometry | null;
  file?: File | null;
  imageScale?: number;
  paddingMode?: 'pad' | 'stretch';
  showTexture?: boolean;
  placeholderText?: string;
};

export function Viewer({ geometry, file = null, imageScale = 1, paddingMode = 'pad', showTexture = true, placeholderText = '3D preview will appear here.' }: ViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<SceneHandle | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const textureRef = useRef<THREE.Texture | null>(null);
  const textureKeyRef = useRef<string | null>(null);

  const materials = useMemo(() => {
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
  }, []);

  function disposeTexture() {
    if (textureRef.current) {
      textureRef.current.dispose();
      textureRef.current = null;
    }
    textureKeyRef.current = null;
  }

  useEffect(() => {
    // Component unmount cleanup.
    return () => {
      disposeTexture();
      materials.outer.map = null;
      materials.outer.needsUpdate = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Toggle map attachment without disposing the cached texture.
    if (!showTexture) {
      materials.outer.map = null;
      materials.outer.needsUpdate = true;
      return;
    }

    materials.outer.map = textureRef.current;
    materials.outer.needsUpdate = true;
  }, [showTexture, materials]);

  useEffect(() => {
    let cancelled = false;

    async function ensureTexture(nextFile: File | null) {
      if (!nextFile) {
        disposeTexture();
        materials.outer.map = null;
        materials.outer.needsUpdate = true;
        return;
      }

      const key = `${nextFile.name}:${nextFile.size}:${nextFile.lastModified}:${imageScale}:${paddingMode}`;
      if (textureRef.current && textureKeyRef.current === key) {
        if (showTexture) {
          materials.outer.map = textureRef.current;
          materials.outer.needsUpdate = true;
        }
        return;
      }

      // Invalidate cached texture when file or transform settings change.
      disposeTexture();
      textureKeyRef.current = key;

      const maxDim = 2048;
      let bitmap: ImageBitmap | null = null;
      try {
        bitmap = await createImageBitmap(nextFile);
        if (cancelled) return;

        const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
        const w = Math.max(1, Math.floor(bitmap.width * scale));
        const h = Math.max(1, Math.floor(bitmap.height * scale));

        const srcCanvas = document.createElement('canvas');
        srcCanvas.width = w;
        srcCanvas.height = h;
        const srcCtx = srcCanvas.getContext('2d');
        if (!srcCtx) return;

        srcCtx.drawImage(bitmap, 0, 0, w, h);
        const input = srcCtx.getImageData(0, 0, w, h);

        // Use the same working-image rules as generation (padding + imageScale).
        const working = createWorkingImage(input, { imageScale, paddingMode });

        // Convert to grayscale for preview.
        const data = working.data;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i + 0];
          const g = data[i + 1];
          const b = data[i + 2];
          const y = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
          data[i + 0] = y;
          data[i + 1] = y;
          data[i + 2] = y;
          data[i + 3] = 255;
        }

        const canvas = document.createElement('canvas');
        canvas.width = working.width;
        canvas.height = working.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.putImageData(working, 0, 0);

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        // Keep image-space "top" aligned with v=0 sampling convention used elsewhere.
        tex.flipY = false;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;

        textureRef.current = tex;
        if (showTexture) {
          materials.outer.map = tex;
          materials.outer.needsUpdate = true;
        }
      } finally {
        bitmap?.close();
      }
    }

    void ensureTexture(file);

    return () => {
      cancelled = true;
    };
  }, [file, imageScale, paddingMode, showTexture, materials]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handle = createScene(canvas);
    sceneRef.current = handle;

    const onWindowResize = () => handle.resize();
    window.addEventListener('resize', onWindowResize);

    let ro: ResizeObserver | null = null;
    if ('ResizeObserver' in window) {
      ro = new ResizeObserver(() => handle.resize());
      ro.observe(canvas);
    }

    return () => {
      window.removeEventListener('resize', onWindowResize);
      ro?.disconnect();
      handle.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handle = sceneRef.current;
    if (!handle) return;

    if (!geometry) {
      if (meshRef.current) {
        meshRef.current.geometry.dispose();
        meshRef.current = null;
      }
      handle.setMesh(null);
      return;
    }

    if (meshRef.current) {
      meshRef.current.geometry.dispose();
      meshRef.current = null;
    }

    const cloned = geometry.clone();
    cloned.computeBoundingSphere();

    const mesh = new THREE.Mesh(cloned, [materials.outer, materials.inner, materials.wall]);
    meshRef.current = mesh;
    handle.setMesh(mesh);
    handle.resize();

    return () => {
      if (meshRef.current === mesh) {
        mesh.geometry.dispose();
        meshRef.current = null;
      }
    };
  }, [geometry, materials]);

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
      {!geometry ? (
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
