import type { AppError } from '../domain/errors';

export type WorkingImageOptions = {
  imageScale?: number;
  paddingMode?: 'pad' | 'stretch';
  maxWorkingPixels?: number;
};

function clamp(x: number, min: number, max: number): number {
  if (x < min) return min;
  if (x > max) return max;
  return x;
}

function computeWorkingCanvasSize(width: number, height: number): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) {
    throw { code: 'DECODE_FAILED', message: 'Invalid image dimensions.' } satisfies AppError;
  }

  // Smallest 2:1 canvas that fully contains the original image.
  // - If too tall (aspect < 2): keep height, pad width.
  // - If too wide (aspect > 2): keep width, pad height.
  if (width <= height * 2) {
    const h = height;
    const w = h * 2;
    return { width: w, height: h };
  }

  // width > 2*height
  const h = Math.ceil(width / 2);
  const w = h * 2;
  return { width: w, height: h };
}

export function createWorkingImage(input: ImageData, options: WorkingImageOptions = {}): ImageData {
  const imageScaleRaw = options.imageScale ?? 1;
  const imageScale = clamp(imageScaleRaw, 0, 1);
  const paddingMode = options.paddingMode ?? 'pad';

  const maxWorkingPixels = options.maxWorkingPixels ?? 8_000_000;

  if (!(imageScale > 0 && imageScale <= 1)) {
    throw {
      code: 'INVALID_PARAMS',
      field: 'imageScale',
      message: 'Image scale must be > 0 and <= 1.',
    } satisfies AppError;
  }

  const { width: canvasWidth, height: canvasHeight } = computeWorkingCanvasSize(
    input.width,
    input.height,
  );

  // Optional guard: downscale the *working* image (not the input) to keep processing interactive.
  // Preserve exact 2:1 aspect ratio.
  const workingPixels = canvasWidth * canvasHeight;
  const workingScale =
    maxWorkingPixels > 0 && workingPixels > maxWorkingPixels
      ? Math.sqrt(maxWorkingPixels / workingPixels)
      : 1;

  const outHeight = Math.max(1, Math.floor(canvasHeight * workingScale));
  const outWidth = outHeight * 2;

  const drawWidth = Math.max(1, Math.floor(input.width * imageScale * workingScale));
  const drawHeight = Math.max(1, Math.floor(input.height * imageScale * workingScale));

  // In stretch mode, fill the entire canvas; in pad mode, center the image.
  const dx = paddingMode === 'stretch' ? 0 : Math.floor((outWidth - drawWidth) / 2);
  const dy = paddingMode === 'stretch' ? 0 : Math.floor((outHeight - drawHeight) / 2);
  const finalDrawWidth = paddingMode === 'stretch' ? outWidth : drawWidth;
  const finalDrawHeight = paddingMode === 'stretch' ? outHeight : drawHeight;

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = input.width;
  srcCanvas.height = input.height;
  const srcCtx = srcCanvas.getContext('2d');
  if (!srcCtx) throw { code: 'DECODE_FAILED', message: 'Canvas 2D context not available.' } satisfies AppError;
  srcCtx.putImageData(input, 0, 0);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outWidth;
  outCanvas.height = outHeight;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) throw { code: 'DECODE_FAILED', message: 'Canvas 2D context not available.' } satisfies AppError;

  // White background (also ensures transparent input becomes white after compositing).
  outCtx.fillStyle = '#fff';
  outCtx.fillRect(0, 0, outWidth, outHeight);

  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = 'high';
  outCtx.drawImage(srcCanvas, 0, 0, input.width, input.height, dx, dy, finalDrawWidth, finalDrawHeight);

  return outCtx.getImageData(0, 0, outWidth, outHeight);
}
