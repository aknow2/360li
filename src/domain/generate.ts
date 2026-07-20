import type { BuiltPart, BuiltPartSnapshot } from './builtPart';
import { deriveStlFileName } from './builtPart';
import { toUserMessage } from './errors';
import { decodeImageToImageData } from '../lithophane/imageDecode';
import { generateSphereLithophane } from '../lithophane/sphereLithophane';

export type GenerateDependencies = Readonly<{
  decode: typeof decodeImageToImageData;
  generate: typeof generateSphereLithophane;
}>;

const productionDependencies: GenerateDependencies = {
  decode: decodeImageToImageData,
  generate: generateSphereLithophane,
};

export async function generateFromSnapshot(
  snapshot: BuiltPartSnapshot,
  dependencies: GenerateDependencies = productionDependencies,
): Promise<BuiltPart> {
  const params = snapshot.params;
  const decoded = await dependencies.decode(snapshot.source.file, {
    imageScale: params.imageScale,
    flipHorizontal: params.flipHorizontal,
    flipVertical: params.flipVertical,
    paddingMode: params.paddingMode,
  });
  const generated = dependencies.generate(decoded.imageData, params);
  try {
    return Object.freeze({
      geometry: generated.geometry,
      summary: generated.summary,
      workingImage: decoded.imageData,
      snapshot,
      fileName: deriveStlFileName(params),
    });
  } catch (error) {
    generated.geometry.dispose();
    throw error;
  }
}

export type GenerationRunCoordinator = Readonly<{
  begin(): number;
  invalidate(): void;
  isCurrent(token: number): boolean;
  publish(
    token: number,
    builtPart: BuiltPart,
    publishCurrent: (builtPart: BuiltPart) => void,
    disposeStale: (builtPart: BuiltPart) => void,
  ): boolean;
}>;

export function createGenerationRunCoordinator(): GenerationRunCoordinator {
  let currentToken = 0;
  return {
    begin() {
      currentToken += 1;
      return currentToken;
    },
    invalidate() {
      currentToken += 1;
    },
    isCurrent(token) {
      return token === currentToken;
    },
    publish(token, builtPart, publishCurrent, disposeStale) {
      if (token !== currentToken) {
        disposeStale(builtPart);
        return false;
      }
      publishCurrent(builtPart);
      return true;
    },
  };
}

export function toGenerateErrorMessage(err: unknown): string {
  return toUserMessage(err);
}
