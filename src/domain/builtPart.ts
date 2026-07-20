import type { BufferGeometry } from 'three';
import type { GenerationSummary } from './contracts';
import { DEFAULT_PARAMS, type LithophaneParams } from './params';

export type BuiltPartSnapshot = Readonly<{
  params: Readonly<LithophaneParams>;
  source: Readonly<{
    file: File;
    name: string;
    size: number;
    type: string;
    lastModified: number;
  }>;
}>;

/**
 * One atomic Build result. Consumers must treat both `workingImage` and
 * `workingImage.data` as read-only. Readonly typing cannot make a typed array
 * runtime-immutable, so this module intentionally neither clones nor mutates
 * those exact decoded/transformed bytes.
 */
export type BuiltPart = Readonly<{
  geometry: BufferGeometry;
  summary: GenerationSummary;
  workingImage: ImageData;
  snapshot: BuiltPartSnapshot;
  fileName: string;
}>;

export function createBuildSnapshot(file: File, params: LithophaneParams): BuiltPartSnapshot {
  const capturedParams = Object.freeze(Object.fromEntries(
    (Object.keys(DEFAULT_PARAMS) as Array<keyof LithophaneParams>).map((key) => [key, params[key]]),
  ) as LithophaneParams);
  const source = Object.freeze({
    file,
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
  });
  return Object.freeze({ params: capturedParams, source });
}

export function deriveStlFileName(params: Readonly<LithophaneParams>): string {
  const { horizontalSplitCount: horizontal, verticalSplitCount: vertical, splitIndex } = params;
  if (horizontal === 1 && vertical === 1 && splitIndex === 1) {
    return 'spherical-lithophane.stl';
  }
  return `spherical-lithophane-h${horizontal}-v${vertical}-part-${splitIndex}-of-${horizontal * vertical}.stl`;
}
