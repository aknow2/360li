import type { AppError } from '../domain/errors';
import { validateEquirectangularAspectRatio } from '../domain/validation';

export type DecodedImage = {
  imageData: ImageData;
  width: number;
  height: number;
};

async function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image.'));
      img.src = url;
    });

    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function decodeImageToImageData(file: File, aspectTolerance = 0): Promise<DecodedImage> {
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
  let imageData: ImageData;

  // Prefer createImageBitmap when available.
  if ('createImageBitmap' in window) {
    const bitmap = await createImageBitmap(file);
    width = bitmap.width;
    height = bitmap.height;

    const aspect = validateEquirectangularAspectRatio(width, height, aspectTolerance);
    if (!aspect.ok) throw aspect.error;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw { code: 'DECODE_FAILED', message: 'Canvas 2D context not available.' } satisfies AppError;

    ctx.drawImage(bitmap, 0, 0);
    imageData = ctx.getImageData(0, 0, width, height);
  } else {
    const img = await loadImageFromBlob(file);
    width = img.naturalWidth;
    height = img.naturalHeight;

    const aspect = validateEquirectangularAspectRatio(width, height, aspectTolerance);
    if (!aspect.ok) throw aspect.error;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw { code: 'DECODE_FAILED', message: 'Canvas 2D context not available.' } satisfies AppError;

    ctx.drawImage(img, 0, 0);
    imageData = ctx.getImageData(0, 0, width, height);
  }

  return { imageData, width, height };
}
