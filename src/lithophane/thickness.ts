import type { LithophaneParams } from '../domain/params';

function clamp(x: number, min: number, max: number): number {
  if (x < min) return min;
  if (x > max) return max;
  return x;
}

export function applyBrightnessCurve(brightness01: number, curve: number): number {
  const b = clamp(brightness01, 0, 1);
  return clamp(Math.pow(b, curve), 0, 1);
}

export function brightnessToThicknessMm(brightness01: number, params: LithophaneParams): number {
  const curved = applyBrightnessCurve(brightness01, params.brightnessCurve);
  const t =
    params.minThicknessMm +
    (1 - curved) * (params.maxThicknessMm - params.minThicknessMm);
  return clamp(t, params.minThicknessMm, params.maxThicknessMm);
}
