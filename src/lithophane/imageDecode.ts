import type { AppError } from '../domain/errors';
import { createWorkingImage } from './workingImage';

export type DecodedImage = {
  imageData: ImageData;
  width: number;
  height: number;
};

export type DecodeOptions = {
  imageScale?: number;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  paddingMode?: 'pad' | 'stretch';
};

export type ImageDecodeDependencies = {
  createImageBitmap: ((blob: Blob) => Promise<ImageBitmap>) | null;
  createImageElement(): HTMLImageElement;
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
  createCanvas(): HTMLCanvasElement;
  createWorkingImage(source: ImageData, options: Required<DecodeOptions>): ImageData;
};

function defaultDecodeDependencies(): ImageDecodeDependencies {
  return {
    createImageBitmap: typeof globalThis.createImageBitmap === 'function'
      ? (blob) => globalThis.createImageBitmap(blob)
      : null,
    createImageElement: () => new Image(),
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    createCanvas: () => document.createElement('canvas'),
    createWorkingImage,
  };
}

function releaseCanvas(canvas: HTMLCanvasElement): void {
  try { canvas.width = 0; } catch { /* Preserve the decode/setup error. */ }
  try { canvas.height = 0; } catch { /* Preserve the decode/setup error. */ }
}

function copyPixelsToImageData(
  source: CanvasImageSource,
  width: number,
  height: number,
  dependencies: ImageDecodeDependencies,
): ImageData {
  const canvas = dependencies.createCanvas();
  try {
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw { code: 'DECODE_FAILED', message: 'Canvas 2D context not available.' } satisfies AppError;
    ctx.drawImage(source, 0, 0);
    return ctx.getImageData(0, 0, width, height);
  } finally {
    releaseCanvas(canvas);
  }
}

async function loadImageFromBlob(
  blob: Blob,
  dependencies: ImageDecodeDependencies,
): Promise<HTMLImageElement> {
  const url = dependencies.createObjectURL(blob);
  let image: HTMLImageElement | null = null;
  let failure: unknown = null;
  try {
    const img = dependencies.createImageElement();
    img.decoding = 'async';

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image.'));
      img.src = url;
    });
    image = img;
  } catch (error) {
    failure = error;
  }
  try {
    dependencies.revokeObjectURL(url);
  } catch (cleanupError) {
    failure ??= cleanupError;
  }
  if (failure) throw failure;
  return image!;
}

export async function decodeImageToImageData(
  file: File,
  options: DecodeOptions = {},
  dependencies: ImageDecodeDependencies = defaultDecodeDependencies(),
): Promise<DecodedImage> {
  const mimeType = file.type;
  if (mimeType !== 'image/jpeg' && mimeType !== 'image/png') {
    const err: AppError = {
      code: 'INVALID_IMAGE_TYPE',
      message: 'Only JPEG and PNG are supported.',
      field: 'file',
    };
    throw err;
  }

  let width = 0;
  let height = 0;
  let imageData: ImageData | null = null;

  if (dependencies.createImageBitmap) {
    const bitmap = await dependencies.createImageBitmap(file);
    let failure: unknown = null;
    try {
      width = bitmap.width;
      height = bitmap.height;
      imageData = copyPixelsToImageData(bitmap, width, height, dependencies);
    } catch (error) {
      failure = error;
    }
    try {
      bitmap.close();
    } catch (cleanupError) {
      failure ??= cleanupError;
    }
    if (failure) throw failure;
  } else {
    const img = await loadImageFromBlob(file, dependencies);
    width = img.naturalWidth;
    height = img.naturalHeight;
    imageData = copyPixelsToImageData(img, width, height, dependencies);
  }

  if (!imageData) {
    throw { code: 'DECODE_FAILED', message: 'Image decode produced no pixels.' } satisfies AppError;
  }
  const working = dependencies.createWorkingImage(imageData, {
    imageScale: options.imageScale ?? 1,
    flipHorizontal: options.flipHorizontal ?? false,
    flipVertical: options.flipVertical ?? false,
    paddingMode: options.paddingMode ?? 'pad',
  });
  return { imageData: working, width: working.width, height: working.height };
}
