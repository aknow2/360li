import type { BufferGeometry } from 'three';
import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import type { BuiltPart } from '../domain/builtPart';

export type StlExportOptions = {
  binary?: boolean;
};

export function exportGeometryToStlBlob(
  geometry: BufferGeometry,
  options: StlExportOptions = {},
): Blob {
  const exporter = new STLExporter();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());

  const binary = options.binary ?? true;
  const out = exporter.parse(mesh, { binary });

  if (typeof out === 'string') {
    return new Blob([out], { type: 'model/stl' });
  }

  // ArrayBuffer
  return new Blob([out], { type: 'model/stl' });
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener';
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function exportBuiltPart(
  builtPart: BuiltPart,
  download: (blob: Blob, fileName: string) => void = downloadBlob,
): Blob {
  const blob = exportGeometryToStlBlob(builtPart.geometry, { binary: true });
  download(blob, builtPart.fileName);
  return blob;
}
