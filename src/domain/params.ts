export type LithophaneParams = {
  radiusMm: number;
  minThicknessMm: number;
  maxThicknessMm: number;
  holeDiameterMm: number;
  holeAtTop: boolean;
  standWallThicknessMm: number;
  widthSegments: number;
  heightSegments: number;
  contrast: number;
  brightnessCurve: number;
  minCos: number;
  imageScale: number;
};

export const DEFAULT_PARAMS: LithophaneParams = {
  radiusMm: 60,
  minThicknessMm: 2.8,
  maxThicknessMm: 5.5,
  holeDiameterMm: 0,
  holeAtTop: false,
  standWallThicknessMm: 2,
  widthSegments: 256,
  heightSegments: 128,
  contrast: 1,
  brightnessCurve: 0.6,
  minCos: 0.25,
  imageScale: 1,
};
