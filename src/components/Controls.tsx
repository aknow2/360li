import type { LithophaneParams, SplitField, SplitInputDraft } from '../domain/params';
import type { AnimationSettings, CenterLightSettings, RotationAxis } from '../three/scene';

type ControlsProps = {
  disabled?: boolean;
  statusText?: string | null;
  errorMessage?: string | null;
  onSelectFile?: (file: File) => void;
  showTexture?: boolean;
  onToggleShowTexture?: (next: boolean) => void;
  params?: LithophaneParams;
  paramsErrorField?: string | null;
  paramsErrorMessage?: string | null;
  onChangeParams?: (next: LithophaneParams) => void;
  splitDraft?: SplitInputDraft;
  onChangeSplitDraft?: (field: SplitField, raw: string) => void;
  paramsEnabled?: boolean;
  buildEnabled?: boolean;
  onBuild?: () => void;
  exportEnabled?: boolean;
  exportErrorMessage?: string | null;
  onExport?: () => void;
  animationSettings?: AnimationSettings;
  onChangeAnimationSettings?: (next: AnimationSettings) => void;
  centerLightSettings?: CenterLightSettings;
  onChangeCenterLightSettings?: (next: CenterLightSettings) => void;
};

function numberOr(current: number, nextRaw: string): number {
  const n = Number(nextRaw);
  return Number.isFinite(n) ? n : current;
}

function intOr(current: number, nextRaw: string): number {
  const n = Number(nextRaw);
  return Number.isFinite(n) ? Math.trunc(n) : current;
}

export function Controls({
  disabled,
  statusText,
  errorMessage,
  onSelectFile,
  showTexture,
  onToggleShowTexture,
  params,
  paramsErrorField,
  paramsErrorMessage,
  onChangeParams,
  splitDraft,
  onChangeSplitDraft,
  paramsEnabled,
  buildEnabled,
  onBuild,
  exportEnabled,
  exportErrorMessage,
  onExport,
  animationSettings,
  onChangeAnimationSettings,
  centerLightSettings,
  onChangeCenterLightSettings,
}: ControlsProps) {
  return (
    <form aria-label="Lithophane controls">
      <div style={{ display: 'grid', gap: 12 }}>
        {statusText ? <div style={{ fontSize: 12, opacity: 0.8 }}>{statusText}</div> : null}

        <label style={{ display: 'grid', gap: 6 }}>
          <span>Source image (JPEG/PNG)</span>
          <input
            type="file"
            accept="image/png,image/jpeg"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (file) onSelectFile?.(file);
            }}
          />
        </label>

        <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0 }}>
          <div style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={Boolean(showTexture)}
              onChange={(e) => onToggleShowTexture?.(e.currentTarget.checked)}
            />
            <span>Show grayscale texture</span>
          </label>

          <fieldset style={{ border: '1px solid rgba(0,0,0,0.12)', borderRadius: 8, padding: 12 }}>
            <legend style={{ padding: '0 6px', fontSize: 12, opacity: 0.85 }}>Lighting</legend>

            <div style={{ display: 'grid', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={Boolean(centerLightSettings?.enabled)}
                  onChange={(e) => {
                    if (!centerLightSettings) return;
                    onChangeCenterLightSettings?.({ ...centerLightSettings, enabled: e.currentTarget.checked });
                  }}
                />
                <span>Center 360 deg light</span>
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span>Center light intensity: {(centerLightSettings?.intensity ?? 0).toFixed(1)}</span>
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={0.1}
                  disabled={!centerLightSettings?.enabled}
                  value={centerLightSettings?.intensity ?? 0}
                  onChange={(e) => {
                    if (!centerLightSettings) return;
                    onChangeCenterLightSettings?.({
                      ...centerLightSettings,
                      intensity: numberOr(centerLightSettings.intensity, e.currentTarget.value),
                    });
                  }}
                />
              </label>
            </div>
          </fieldset>

          <fieldset style={{ border: '1px solid rgba(0,0,0,0.12)', borderRadius: 8, padding: 12 }}>
            <legend style={{ padding: '0 6px', fontSize: 12, opacity: 0.85 }}>Animation</legend>

            <div style={{ display: 'grid', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={Boolean(animationSettings?.enabled)}
                  onChange={(e) => {
                    if (!animationSettings) return;
                    onChangeAnimationSettings?.({ ...animationSettings, enabled: e.currentTarget.checked });
                  }}
                />
                <span>Enable animation mode</span>
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span>Rotation speed (deg/s): {Math.round(animationSettings?.rotationSpeedDegPerSec ?? 0)}</span>
                <input
                  type="range"
                  min={-360}
                  max={360}
                  step={1}
                  value={animationSettings?.rotationSpeedDegPerSec ?? 0}
                  onChange={(e) => {
                    if (!animationSettings) return;
                    onChangeAnimationSettings?.({
                      ...animationSettings,
                      rotationSpeedDegPerSec: numberOr(animationSettings.rotationSpeedDegPerSec, e.currentTarget.value),
                    });
                  }}
                />
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span>Rotation axis</span>
                <select
                  value={animationSettings?.rotationAxis ?? 'y'}
                  onChange={(e) => {
                    if (!animationSettings) return;
                    const value = e.currentTarget.value;
                    const axis: RotationAxis = value === 'x' || value === 'z' ? value : 'y';
                    onChangeAnimationSettings?.({ ...animationSettings, rotationAxis: axis });
                  }}
                >
                  <option value="x">X</option>
                  <option value="y">Y</option>
                  <option value="z">Z</option>
                </select>
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span>Refresh rate (Hz): {Math.round(animationSettings?.refreshRateHz ?? 60)}</span>
                <input
                  type="range"
                  min={1}
                  max={120}
                  step={1}
                  value={animationSettings?.refreshRateHz ?? 60}
                  onChange={(e) => {
                    if (!animationSettings) return;
                    onChangeAnimationSettings?.({
                      ...animationSettings,
                      refreshRateHz: intOr(animationSettings.refreshRateHz, e.currentTarget.value),
                    });
                  }}
                />
              </label>
            </div>
          </fieldset>

          {errorMessage ? (
            <div role="alert" style={{ fontSize: 12, color: 'crimson' }}>
              {errorMessage}
            </div>
          ) : null}

          {exportErrorMessage ? (
            <div role="alert" style={{ fontSize: 12, color: 'crimson' }}>
              {exportErrorMessage}
            </div>
          ) : null}

          <fieldset
            disabled={!paramsEnabled}
            style={{ border: '1px solid rgba(0,0,0,0.12)', borderRadius: 8, padding: 12 }}
          >
            <legend style={{ padding: '0 6px', fontSize: 12, opacity: 0.85 }}>Parameters</legend>

            <div style={{ display: 'grid', gap: 10 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Radius (mm)</span>
                <input
                  type="number"
                  step={1}
                  value={params?.radiusMm ?? ''}
                  onChange={(e) => {
                    if (!params) return;
                    onChangeParams?.({ ...params, radiusMm: numberOr(params.radiusMm, e.currentTarget.value) });
                  }}
                />
                {paramsErrorField === 'radiusMm' ? (
                  <div role="alert" style={{ fontSize: 12, color: 'crimson' }}>
                    {paramsErrorMessage}
                  </div>
                ) : null}
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span>Min thickness (mm)</span>
                <input
                  type="number"
                  step={0.1}
                  value={params?.minThicknessMm ?? ''}
                  onChange={(e) => {
                    if (!params) return;
                    onChangeParams?.({
                      ...params,
                      minThicknessMm: numberOr(params.minThicknessMm, e.currentTarget.value),
                    });
                  }}
                />
                {paramsErrorField === 'minThicknessMm' ? (
                  <div role="alert" style={{ fontSize: 12, color: 'crimson' }}>
                    {paramsErrorMessage}
                  </div>
                ) : null}
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span>Max thickness (mm)</span>
                <input
                  type="number"
                  step={0.1}
                  value={params?.maxThicknessMm ?? ''}
                  onChange={(e) => {
                    if (!params) return;
                    onChangeParams?.({
                      ...params,
                      maxThicknessMm: numberOr(params.maxThicknessMm, e.currentTarget.value),
                    });
                  }}
                />
                {paramsErrorField === 'maxThicknessMm' ? (
                  <div role="alert" style={{ fontSize: 12, color: 'crimson' }}>
                    {paramsErrorMessage}
                  </div>
                ) : null}
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span>Thickness direction</span>
                <select
                  value={params?.thicknessDirection ?? 'outward'}
                  onChange={(e) => {
                    if (!params) return;
                    const next = e.currentTarget.value === 'inward' ? 'inward' : 'outward';
                    onChangeParams?.({ ...params, thicknessDirection: next });
                  }}
                >
                  <option value="outward">Outward (add thickness outside)</option>
                  <option value="inward">Inward (carve thickness inside)</option>
                </select>
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span>Bottom hole diameter (mm)</span>
                <input
                  type="number"
                  step={1}
                  min={0}
                  value={params?.holeDiameterMm ?? ''}
                  onChange={(e) => {
                    if (!params) return;
                    onChangeParams?.({
                      ...params,
                      holeDiameterMm: numberOr(params.holeDiameterMm, e.currentTarget.value),
                    });
                  }}
                />
                {paramsErrorField === 'holeDiameterMm' ? (
                  <div role="alert" style={{ fontSize: 12, color: 'crimson' }}>
                    {paramsErrorMessage}
                  </div>
                ) : null}
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span>Top hole diameter (mm)</span>
                <input
                  type="number"
                  step={1}
                  min={0}
                  value={params?.topHoleDiameterMm ?? ''}
                  onChange={(e) => {
                    if (!params) return;
                    onChangeParams?.({
                      ...params,
                      topHoleDiameterMm: numberOr(params.topHoleDiameterMm, e.currentTarget.value),
                    });
                  }}
                />
                {paramsErrorField === 'topHoleDiameterMm' ? (
                  <div role="alert" style={{ fontSize: 12, color: 'crimson' }}>
                    {paramsErrorMessage}
                  </div>
                ) : null}
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span>Hole latitude (0%=bottom, 100%=top)</span>
                <input
                  type="number"
                  step={1}
                  min={0}
                  max={100}
                  value={params?.holeLatitude ?? 0}
                  onChange={(e) => {
                    if (!params) return;
                    onChangeParams?.({
                      ...params,
                      holeLatitude: numberOr(params.holeLatitude, e.currentTarget.value),
                    });
                  }}
                />
                {paramsErrorField === 'holeLatitude' ? (
                  <div role="alert" style={{ fontSize: 12, color: 'crimson' }}>
                    {paramsErrorMessage}
                  </div>
                ) : null}
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span>Hole longitude (0%–100%)</span>
                <input
                  type="number"
                  step={1}
                  min={0}
                  max={100}
                  value={params?.holeLongitude ?? 0}
                  onChange={(e) => {
                    if (!params) return;
                    onChangeParams?.({
                      ...params,
                      holeLongitude: numberOr(params.holeLongitude, e.currentTarget.value),
                    });
                  }}
                />
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span>Stand wall thickness (mm)</span>
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  value={params?.standWallThicknessMm ?? ''}
                  onChange={(e) => {
                    if (!params) return;
                    onChangeParams?.({
                      ...params,
                      standWallThicknessMm: numberOr(params.standWallThicknessMm, e.currentTarget.value),
                    });
                  }}
                />
                {paramsErrorField === 'standWallThicknessMm' ? (
                  <div role="alert" style={{ fontSize: 12, color: 'crimson' }}>
                    {paramsErrorMessage}
                  </div>
                ) : null}
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span>Brightness curve</span>
                <input
                  type="number"
                  step={0.05}
                  value={params?.brightnessCurve ?? ''}
                  onChange={(e) => {
                    if (!params) return;
                    onChangeParams?.({
                      ...params,
                      brightnessCurve: numberOr(params.brightnessCurve, e.currentTarget.value),
                    });
                  }}
                />
                {paramsErrorField === 'brightnessCurve' ? (
                  <div role="alert" style={{ fontSize: 12, color: 'crimson' }}>
                    {paramsErrorMessage}
                  </div>
                ) : null}
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span>Contrast (0..3)</span>
                <input
                  type="number"
                  step={0.05}
                  min={0}
                  max={3}
                  value={params?.contrast ?? ''}
                  onChange={(e) => {
                    if (!params) return;
                    onChangeParams?.({
                      ...params,
                      contrast: numberOr(params.contrast, e.currentTarget.value),
                    });
                  }}
                />
                {paramsErrorField === 'contrast' ? (
                  <div role="alert" style={{ fontSize: 12, color: 'crimson' }}>
                    {paramsErrorMessage}
                  </div>
                ) : null}
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span>Image scale (0..1)</span>
                <input
                  type="number"
                  step={0.01}
                  min={0}
                  max={1}
                  value={params?.imageScale ?? ''}
                  onChange={(e) => {
                    if (!params) return;
                    onChangeParams?.({
                      ...params,
                      imageScale: numberOr(params.imageScale, e.currentTarget.value),
                    });
                  }}
                />
                {paramsErrorField === 'imageScale' ? (
                  <div role="alert" style={{ fontSize: 12, color: 'crimson' }}>
                    {paramsErrorMessage}
                  </div>
                ) : null}
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={Boolean(params?.flipHorizontal)}
                  onChange={(e) => {
                    if (!params) return;
                    onChangeParams?.({ ...params, flipHorizontal: e.currentTarget.checked });
                  }}
                />
                <span>Flip horizontal for build</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={Boolean(params?.flipVertical)}
                  onChange={(e) => {
                    if (!params) return;
                    onChangeParams?.({ ...params, flipVertical: e.currentTarget.checked });
                  }}
                />
                <span>Flip vertical for build</span>
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span>Padding mode</span>
                <select
                  value={params?.paddingMode ?? 'pad'}
                  onChange={(e) => {
                    if (!params) return;
                    const next = e.currentTarget.value === 'stretch' ? 'stretch' : 'pad';
                    onChangeParams?.({ ...params, paddingMode: next });
                  }}
                >
                  <option value="pad">Pad (white fill)</option>
                  <option value="stretch">Stretch</option>
                </select>
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span>minCos (0..1)</span>
                <input
                  type="number"
                  step={0.05}
                  min={0}
                  max={1}
                  value={params?.minCos ?? ''}
                  onChange={(e) => {
                    if (!params) return;
                    onChangeParams?.({ ...params, minCos: numberOr(params.minCos, e.currentTarget.value) });
                  }}
                />
                {paramsErrorField === 'minCos' ? (
                  <div role="alert" style={{ fontSize: 12, color: 'crimson' }}>
                    {paramsErrorMessage}
                  </div>
                ) : null}
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span>Width segments</span>
                <input
                  type="number"
                  step={1}
                  min={8}
                  max={4096}
                  value={params?.widthSegments ?? ''}
                  onChange={(e) => {
                    if (!params) return;
                    onChangeParams?.({
                      ...params,
                      widthSegments: intOr(params.widthSegments, e.currentTarget.value),
                    });
                  }}
                />
                {paramsErrorField === 'widthSegments' ? (
                  <div role="alert" style={{ fontSize: 12, color: 'crimson' }}>
                    {paramsErrorMessage}
                  </div>
                ) : null}
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span>Height segments</span>
                <input
                  type="number"
                  step={1}
                  min={4}
                  max={2048}
                  value={params?.heightSegments ?? ''}
                  onChange={(e) => {
                    if (!params) return;
                    onChangeParams?.({
                      ...params,
                      heightSegments: intOr(params.heightSegments, e.currentTarget.value),
                    });
                  }}
                />
                {paramsErrorField === 'heightSegments' ? (
                  <div role="alert" style={{ fontSize: 12, color: 'crimson' }}>
                    {paramsErrorMessage}
                  </div>
                ) : null}
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span>Horizontal split count</span>
                <input
                  type="number"
                  step="any"
                  value={splitDraft?.horizontalSplitCount ?? String(params?.horizontalSplitCount ?? '')}
                  onChange={(e) => onChangeSplitDraft?.('horizontalSplitCount', e.currentTarget.value)}
                />
                {paramsErrorField === 'horizontalSplitCount' ? (
                  <div role="alert" style={{ fontSize: 12, color: 'crimson' }}>
                    {paramsErrorMessage}
                  </div>
                ) : null}
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span>Vertical split count</span>
                <input
                  type="number"
                  step="any"
                  value={splitDraft?.verticalSplitCount ?? String(params?.verticalSplitCount ?? '')}
                  onChange={(e) => onChangeSplitDraft?.('verticalSplitCount', e.currentTarget.value)}
                />
                {paramsErrorField === 'verticalSplitCount' ? (
                  <div role="alert" style={{ fontSize: 12, color: 'crimson' }}>
                    {paramsErrorMessage}
                  </div>
                ) : null}
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span>Split Index</span>
                <input
                  type="number"
                  step="any"
                  value={splitDraft?.splitIndex ?? String(params?.splitIndex ?? '')}
                  onChange={(e) => onChangeSplitDraft?.('splitIndex', e.currentTarget.value)}
                />
                {paramsErrorField === 'splitIndex' ? (
                  <div role="alert" style={{ fontSize: 12, color: 'crimson' }}>
                    {paramsErrorMessage}
                  </div>
                ) : null}
              </label>
            </div>
          </fieldset>

          <button type="button" disabled={!buildEnabled} onClick={() => onBuild?.()}>
            Build
          </button>

          <button type="button" disabled={!exportEnabled} onClick={() => onExport?.()}>
            Export STL
          </button>
          </div>
        </fieldset>
      </div>
    </form>
  );
}
