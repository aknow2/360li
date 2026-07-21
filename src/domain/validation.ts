import type { LithophaneParams, SplitField, SplitInputDraft } from './params';
import type { AppError } from './errors';

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: AppError };

/** Nullable UI-facing field/message validation contract. */
export type ParamsValidationError = {
  field: keyof LithophaneParams;
  message: string;
} | null;

const splitFieldLabels: Record<SplitField, string> = {
  horizontalSplitCount: 'Horizontal split count',
  verticalSplitCount: 'Vertical split count',
  splitIndex: 'Split Index',
};

export function splitDraftFromParams(params: LithophaneParams): SplitInputDraft {
  return {
    horizontalSplitCount: String(params.horizontalSplitCount),
    verticalSplitCount: String(params.verticalSplitCount),
    splitIndex: String(params.splitIndex),
  };
}

function splitMaximum(params: LithophaneParams, field: SplitField): number {
  if (field === 'horizontalSplitCount') return params.widthSegments;
  if (field === 'verticalSplitCount') return params.heightSegments;
  return params.horizontalSplitCount * params.verticalSplitCount;
}

function splitError(params: LithophaneParams, field: SplitField): AppError {
  return {
    code: 'INVALID_PARAMS',
    field,
    message: `${splitFieldLabels[field]} must be an integer between 1 and ${splitMaximum(params, field)}.`,
  };
}

export function applySplitDraft(
  params: LithophaneParams,
  drafts: SplitInputDraft,
  field: SplitField,
  raw: string,
): { params: LithophaneParams; drafts: SplitInputDraft; error: ParamsValidationError } {
  const nextDrafts = { ...drafts, [field]: raw };
  const parsed = Number(raw);
  const nextParams = raw.trim() !== '' && Number.isFinite(parsed) ? { ...params, [field]: parsed } : params;
  const result = validateParams(nextParams, nextDrafts);
  return {
    params: nextParams,
    drafts: nextDrafts,
    error: result.ok ? null : { field: result.error.field as keyof LithophaneParams, message: result.error.message },
  };
}

export function validateParams(
  params: LithophaneParams,
  splitDraft?: SplitInputDraft,
): ValidationResult<LithophaneParams> {
  if (!(params.radiusMm > 0)) {
    return {
      ok: false,
      error: { code: 'INVALID_PARAMS', field: 'radiusMm', message: 'Radius must be > 0.' },
    };
  }

  if (!(params.minThicknessMm >= 0) || !(params.maxThicknessMm >= 0)) {
    return {
      ok: false,
      error: {
        code: 'INVALID_PARAMS',
        field: 'minThicknessMm',
        message: 'Thickness must be >= 0.',
      },
    };
  }

  if (params.minThicknessMm > params.maxThicknessMm) {
    return {
      ok: false,
      error: {
        code: 'INVALID_PARAMS',
        field: 'minThicknessMm',
        message: 'Min thickness must be <= max thickness.',
      },
    };
  }

  // For inward-thickness mode, ensure the inner surface never crosses the center.
  if (params.thicknessDirection === 'inward' && !(params.maxThicknessMm < params.radiusMm)) {
    return {
      ok: false,
      error: {
        code: 'INVALID_PARAMS',
        field: 'maxThicknessMm',
        message: 'Max thickness must be < radius when thickness direction is inward.',
      },
    };
  }

  if (!(params.holeDiameterMm >= 0)) {
    return {
      ok: false,
      error: {
        code: 'INVALID_PARAMS',
        field: 'holeDiameterMm',
        message: 'Hole diameter must be >= 0.',
      },
    };
  }

  if (params.holeDiameterMm > params.radiusMm * 2) {
    return {
      ok: false,
      error: {
        code: 'INVALID_PARAMS',
        field: 'holeDiameterMm',
        message: 'Hole diameter must be <= sphere diameter.',
      },
    };
  }

  if (!(params.topHoleDiameterMm >= 0)) {
    return {
      ok: false,
      error: {
        code: 'INVALID_PARAMS',
        field: 'topHoleDiameterMm',
        message: 'Top hole diameter must be >= 0.',
      },
    };
  }

  if (params.topHoleDiameterMm > params.radiusMm * 2) {
    return {
      ok: false,
      error: {
        code: 'INVALID_PARAMS',
        field: 'topHoleDiameterMm',
        message: 'Top hole diameter must be <= sphere diameter.',
      },
    };
  }

  if (params.holeDiameterMm > 0 && params.topHoleDiameterMm > 0) {
    const bottomAngularRadius = Math.asin(Math.min(params.holeDiameterMm / 2 / params.radiusMm, 1));
    const topAngularRadius = Math.asin(Math.min(params.topHoleDiameterMm / 2 / params.radiusMm, 1));
    if (bottomAngularRadius + topAngularRadius >= Math.PI) {
      return {
        ok: false,
        error: {
          code: 'INVALID_PARAMS',
          field: 'topHoleDiameterMm',
          message: 'Top and bottom holes are too large to coexist.',
        },
      };
    }
  }

  if (!(params.standWallThicknessMm >= 0)) {
    return {
      ok: false,
      error: {
        code: 'INVALID_PARAMS',
        field: 'standWallThicknessMm',
        message: 'Stand wall thickness must be >= 0.',
      },
    };
  }

  // Only used when holeDiameterMm > 0, but still validate to keep state consistent.
  if (params.standWallThicknessMm > params.radiusMm * 2) {
    return {
      ok: false,
      error: {
        code: 'INVALID_PARAMS',
        field: 'standWallThicknessMm',
        message: 'Stand wall thickness is too large.',
      },
    };
  }

  if (!(params.holeLatitude >= 0 && params.holeLatitude <= 100)) {
    return {
      ok: false,
      error: {
        code: 'INVALID_PARAMS',
        field: 'holeLatitude',
        message: 'Hole latitude must be between 0 and 100.',
      },
    };
  }

  if (!(params.holeLongitude >= 0 && params.holeLongitude <= 100)) {
    return {
      ok: false,
      error: {
        code: 'INVALID_PARAMS',
        field: 'holeLongitude',
        message: 'Hole longitude must be between 0 and 100.',
      },
    };
  }

  if (!Number.isInteger(params.widthSegments) || params.widthSegments < 8) {
    return {
      ok: false,
      error: {
        code: 'INVALID_PARAMS',
        field: 'widthSegments',
        message: 'Width segments must be an integer >= 8.',
      },
    };
  }

  if (params.widthSegments > 4096) {
    return {
      ok: false,
      error: {
        code: 'INVALID_PARAMS',
        field: 'widthSegments',
        message: 'Width segments must be <= 4096.',
      },
    };
  }

  if (!Number.isInteger(params.heightSegments) || params.heightSegments < 4) {
    return {
      ok: false,
      error: {
        code: 'INVALID_PARAMS',
        field: 'heightSegments',
        message: 'Height segments must be an integer >= 4.',
      },
    };
  }

  if (params.heightSegments > 2048) {
    return {
      ok: false,
      error: {
        code: 'INVALID_PARAMS',
        field: 'heightSegments',
        message: 'Height segments must be <= 2048.',
      },
    };
  }

  if (!(params.contrast >= 0 && params.contrast <= 3)) {
    return {
      ok: false,
      error: {
        code: 'INVALID_PARAMS',
        field: 'contrast',
        message: 'Contrast must be between 0 and 3.',
      },
    };
  }

  if (!(params.brightnessCurve >= 0.1 && params.brightnessCurve <= 3)) {
    return {
      ok: false,
      error: {
        code: 'INVALID_PARAMS',
        field: 'brightnessCurve',
        message: 'Brightness curve must be between 0.1 and 3.',
      },
    };
  }

  if (!(params.minCos >= 0 && params.minCos <= 1)) {
    return {
      ok: false,
      error: {
        code: 'INVALID_PARAMS',
        field: 'minCos',
        message: 'minCos must be between 0 and 1.',
      },
    };
  }

  if (!(params.imageScale > 0 && params.imageScale <= 1)) {
    return {
      ok: false,
      error: {
        code: 'INVALID_PARAMS',
        field: 'imageScale',
        message: 'Image scale must be > 0 and <= 1.',
      },
    };
  }

  for (const field of ['horizontalSplitCount', 'verticalSplitCount', 'splitIndex'] as const) {
    const raw = splitDraft?.[field];
    const rawValue = raw === undefined ? params[field] : raw;
    const numeric = typeof rawValue === 'number' ? rawValue : Number(rawValue);
    if (
      (typeof rawValue === 'string' && rawValue.trim() === '') ||
      !Number.isFinite(numeric) ||
      !Number.isInteger(numeric) ||
      numeric < 1 ||
      numeric > splitMaximum(params, field)
    ) {
      return { ok: false, error: splitError(params, field) };
    }
  }

  return { ok: true, value: params };
}

export function validateEquirectangularAspectRatio(
  widthPx: number,
  heightPx: number,
  tolerance = 0,
): ValidationResult<true> {
  if (!(widthPx > 0) || !(heightPx > 0)) {
    return {
      ok: false,
      error: { code: 'INVALID_IMAGE_ASPECT_RATIO', message: 'Invalid image dimensions.' },
    };
  }

  const expected = 2;
  const actual = widthPx / heightPx;
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    return {
      ok: false,
      error: {
        code: 'INVALID_IMAGE_ASPECT_RATIO',
        message: `Image aspect ratio must be 2:1. Got ${widthPx}×${heightPx}.`,
      },
    };
  }

  return { ok: true, value: true };
}
