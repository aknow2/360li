export type SourceImage = {
  mimeType: string;
  width: number;
  height: number;
};

export type LithophaneParameters = {
  radiusMm: number;
  minThicknessMm: number;
  maxThicknessMm: number;
  holeDiameterMm: number;
  topHoleDiameterMm: number;
  widthSegments: number;
  heightSegments: number;
  brightnessCurve: number;
  minCos: number;
};

export type GenerationSummary = {
  vertexCount: number;
  triangleCount: number;
};

export type ExportResult = {
  format: 'stl';
  fileName?: string;
};

export type ValidationError = {
  message: string;
  field?: string;
};
