import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { BufferGeometry } from 'three';
import { createScene, type SceneHandle } from '../three/scene';

type ViewerProps = {
  geometry: BufferGeometry | null;
  placeholderText?: string;
};

export function Viewer({ geometry, placeholderText = '3D preview will appear here.' }: ViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<SceneHandle | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);

  const material = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
  }, []);

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

    const mesh = new THREE.Mesh(cloned, material);
    meshRef.current = mesh;
    handle.setMesh(mesh);
    handle.resize();

    return () => {
      if (meshRef.current === mesh) {
        mesh.geometry.dispose();
        meshRef.current = null;
      }
    };
  }, [geometry, material]);

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
