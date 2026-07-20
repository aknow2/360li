import { DEFAULT_PARAMS, type LithophaneParams } from './params';
import {
  defaultAnimationSettings,
  defaultCenterLightSettings,
  type AnimationSettings,
  type CenterLightSettings,
  type RotationAxis,
} from '../three/scene';

const STORAGE_KEY = 'spherical-lithophane.settings.v1';
const STORAGE_VERSION = 1;

export type AppPreferences = {
  params: LithophaneParams;
  showTexture: boolean;
  animationSettings: AnimationSettings;
  centerLightSettings: CenterLightSettings;
};

const defaultPreferences: AppPreferences = {
  params: { ...DEFAULT_PARAMS },
  showTexture: true,
  animationSettings: { ...defaultAnimationSettings },
  centerLightSettings: { ...defaultCenterLightSettings },
};

let cachedPreferences: AppPreferences | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function numberFrom(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function intFrom(value: unknown, fallback: number): number {
  const next = numberFrom(value, fallback);
  return Math.trunc(next);
}

function booleanFrom(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readParams(value: unknown): LithophaneParams {
  if (!isRecord(value)) return { ...DEFAULT_PARAMS };

  return {
    radiusMm: numberFrom(value.radiusMm, DEFAULT_PARAMS.radiusMm),
    minThicknessMm: numberFrom(value.minThicknessMm, DEFAULT_PARAMS.minThicknessMm),
    maxThicknessMm: numberFrom(value.maxThicknessMm, DEFAULT_PARAMS.maxThicknessMm),
    holeDiameterMm: numberFrom(value.holeDiameterMm, DEFAULT_PARAMS.holeDiameterMm),
    topHoleDiameterMm: numberFrom(value.topHoleDiameterMm, DEFAULT_PARAMS.topHoleDiameterMm),
    holeLatitude: numberFrom(value.holeLatitude, DEFAULT_PARAMS.holeLatitude),
    holeLongitude: numberFrom(value.holeLongitude, DEFAULT_PARAMS.holeLongitude),
    standWallThicknessMm: numberFrom(value.standWallThicknessMm, DEFAULT_PARAMS.standWallThicknessMm),
    widthSegments: intFrom(value.widthSegments, DEFAULT_PARAMS.widthSegments),
    heightSegments: intFrom(value.heightSegments, DEFAULT_PARAMS.heightSegments),
    contrast: numberFrom(value.contrast, DEFAULT_PARAMS.contrast),
    brightnessCurve: numberFrom(value.brightnessCurve, DEFAULT_PARAMS.brightnessCurve),
    minCos: numberFrom(value.minCos, DEFAULT_PARAMS.minCos),
    imageScale: numberFrom(value.imageScale, DEFAULT_PARAMS.imageScale),
    flipHorizontal: booleanFrom(value.flipHorizontal, DEFAULT_PARAMS.flipHorizontal),
    flipVertical: booleanFrom(value.flipVertical, DEFAULT_PARAMS.flipVertical),
    paddingMode:
      value.paddingMode === 'pad' || value.paddingMode === 'stretch' ? value.paddingMode : DEFAULT_PARAMS.paddingMode,
    thicknessDirection:
      value.thicknessDirection === 'outward' || value.thicknessDirection === 'inward'
        ? value.thicknessDirection
        : DEFAULT_PARAMS.thicknessDirection,
    horizontalSplitCount: numberFrom(value.horizontalSplitCount, DEFAULT_PARAMS.horizontalSplitCount),
    verticalSplitCount: numberFrom(value.verticalSplitCount, DEFAULT_PARAMS.verticalSplitCount),
    splitIndex: numberFrom(value.splitIndex, DEFAULT_PARAMS.splitIndex),
  };
}

function readRotationAxis(value: unknown): RotationAxis {
  return value === 'x' || value === 'y' || value === 'z' ? value : defaultAnimationSettings.rotationAxis;
}

function readAnimationSettings(value: unknown): AnimationSettings {
  if (!isRecord(value)) return { ...defaultAnimationSettings };

  return {
    enabled: booleanFrom(value.enabled, defaultAnimationSettings.enabled),
    rotationSpeedDegPerSec: numberFrom(
      value.rotationSpeedDegPerSec,
      defaultAnimationSettings.rotationSpeedDegPerSec,
    ),
    rotationAxis: readRotationAxis(value.rotationAxis),
    refreshRateHz: intFrom(value.refreshRateHz, defaultAnimationSettings.refreshRateHz),
  };
}

function readCenterLightSettings(value: unknown): CenterLightSettings {
  if (!isRecord(value)) return { ...defaultCenterLightSettings };

  return {
    enabled: booleanFrom(value.enabled, defaultCenterLightSettings.enabled),
    intensity: numberFrom(value.intensity, defaultCenterLightSettings.intensity),
  };
}

function persistablePreferences(settings: AppPreferences): AppPreferences {
  return {
    params: readParams(settings.params),
    showTexture: booleanFrom(settings.showTexture, defaultPreferences.showTexture),
    animationSettings: readAnimationSettings(settings.animationSettings),
    centerLightSettings: readCenterLightSettings(settings.centerLightSettings),
  };
}

export function loadPreferences(): AppPreferences {
  if (cachedPreferences) return cachedPreferences;

  if (typeof window === 'undefined') {
    cachedPreferences = defaultPreferences;
    return cachedPreferences;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cachedPreferences = defaultPreferences;
      return cachedPreferences;
    }

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== STORAGE_VERSION || !isRecord(parsed.settings)) {
      cachedPreferences = defaultPreferences;
      return cachedPreferences;
    }

    cachedPreferences = {
      params: readParams(parsed.settings.params),
      showTexture: booleanFrom(parsed.settings.showTexture, defaultPreferences.showTexture),
      animationSettings: readAnimationSettings(parsed.settings.animationSettings),
      centerLightSettings: readCenterLightSettings(parsed.settings.centerLightSettings),
    };
    return cachedPreferences;
  } catch {
    cachedPreferences = defaultPreferences;
    return cachedPreferences;
  }
}

export function savePreferences(settings: AppPreferences): void {
  const persisted = persistablePreferences(settings);
  cachedPreferences = persisted;

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: STORAGE_VERSION,
        settings: persisted,
      }),
    );
  } catch {
    // localStorage can fail in private browsing or when storage is full.
  }
}

/** Test-only cache isolation for the dependency-free Vite SSR test modules. */
export function __resetPreferencesForTests(): void {
  cachedPreferences = null;
}
