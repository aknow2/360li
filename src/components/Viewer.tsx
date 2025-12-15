import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { BufferGeometry } from 'three';
import { createScene, type SceneHandle } from '../three/scene';

type ViewerProps = {
  geometry: BufferGeometry | null;
  file?: File | null;
  showTexture?: boolean;
  placeholderText?: string;
};

export function Viewer({ geometry, file = null, showTexture = true, placeholderText = '3D preview will appear here.' }: ViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<SceneHandle | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const textureRef = useRef<THREE.Texture | null>(null);

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
      roughness: 0.9,
      metalness: 0,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.35,
    });

    const wall = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6,
    });

    return { outer, inner, wall };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function setTextureFromFile(nextFile: File | null) {
      // If disabled, just detach the map (keep cached texture for quick re-enable).
      if (!showTexture) {
        materials.outer.map = null;
        materials.outer.needsUpdate = true;
        return;
      }

      // If we already have a texture for the current file, reattach it.
      if (textureRef.current) {
        materials.outer.map = textureRef.current;
        materials.outer.needsUpdate = true;
        return;
      }

      if (!nextFile) {
        materials.outer.map = null;
        materials.outer.needsUpdate = true;
        return;
      }

      // Build a grayscale texture for preview. This is independent of the generation pipeline.
      const maxWidth = 2048;
      let bitmap: ImageBitmap | null = null;
      try {
        bitmap = await createImageBitmap(nextFile);
        if (cancelled) return;

        const scale = bitmap.width > maxWidth ? maxWidth / bitmap.width : 1;
        const w = Math.max(1, Math.floor(bitmap.width * scale));
        const h = Math.max(1, Math.floor(bitmap.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(bitmap, 0, 0, w, h);
        const img = ctx.getImageData(0, 0, w, h);
        const data = img.data;
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
        ctx.putImageData(img, 0, 0);

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        // Keep image-space "top" aligned with v=0 sampling convention used elsewhere.
        tex.flipY = false;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;

        textureRef.current = tex;
        materials.outer.map = tex;
        materials.outer.needsUpdate = true;
      } finally {
        bitmap?.close();
      }
    }

    void setTextureFromFile(file);

    return () => {
      cancelled = true;
      if (textureRef.current) {
        textureRef.current.dispose();
        textureRef.current = null;
      }
      materials.outer.map = null;
      materials.outer.needsUpdate = true;
    };
  }, [file, showTexture, materials]);

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
