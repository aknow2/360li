export type LithophaneParams = {
  radiusMm: number;
  minThicknessMm: number;
  maxThicknessMm: number;
  holeDiameterMm: number;
  holeLatitude: number;
  holeLongitude: number;
  standWallThicknessMm: number;
  widthSegments: number;
  heightSegments: number;
  contrast: number;
  brightnessCurve: number;
  minCos: number;
  imageScale: number;
  paddingMode: 'pad' | 'stretch';
  thicknessDirection: 'outward' | 'inward';
};

export const DEFAULT_PARAMS: LithophaneParams = {
  radiusMm: 60,
  minThicknessMm: 2.8,
  maxThicknessMm: 5.5,
  holeDiameterMm: 0,
  holeLatitude: 0,
  holeLongitude: 0,
  standWallThicknessMm: 2,
  widthSegments: 256,
  heightSegments: 128,
  contrast: 1,
  brightnessCurve: 0.6,
  minCos: 1.00,
  imageScale: 1,
  paddingMode: 'pad',
  thicknessDirection: 'outward',
};
