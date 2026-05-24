import { DEFAULT_PARAMS, type LithophaneParams } from './params';
import { toUserMessage } from './errors';
import { decodeImageToImageData } from '../lithophane/imageDecode';
import { generateSphereLithophane } from '../lithophane/sphereLithophane';

export type GenerateOptions = {
  params?: LithophaneParams;
};

export async function generateFromFile(file: File, options: GenerateOptions = {}) {
  const params = options.params ?? DEFAULT_PARAMS;
  const decoded = await decodeImageToImageData(file, { imageScale: params.imageScale, paddingMode: params.paddingMode });
  return generateSphereLithophane(decoded.imageData, params);
}

export function toGenerateErrorMessage(err: unknown): string {
  return toUserMessage(err);
}
