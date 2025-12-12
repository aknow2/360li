import type { LithophaneParams } from '../domain/params';

type ControlsProps = {
  disabled?: boolean;
  statusText?: string | null;
  errorMessage?: string | null;
  onSelectFile?: (file: File) => void;
  params?: LithophaneParams;
  paramsErrorField?: string | null;
  paramsErrorMessage?: string | null;
  onChangeParams?: (next: LithophaneParams) => void;
  paramsEnabled?: boolean;
  exportEnabled?: boolean;
  exportErrorMessage?: string | null;
  onExport?: () => void;
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
  params,
  paramsErrorField,
  paramsErrorMessage,
  onChangeParams,
  paramsEnabled,
  exportEnabled,
  exportErrorMessage,
  onExport,
}: ControlsProps) {
  return (
    <form aria-label="Lithophane controls">
      <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0 }}>
        <div style={{ display: 'grid', gap: 12 }}>
          {statusText ? <div style={{ fontSize: 12, opacity: 0.8 }}>{statusText}</div> : null}

          <label style={{ display: 'grid', gap: 6 }}>
            <span>Source image (JPEG/PNG, 2:1)</span>
            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (file) onSelectFile?.(file);
              }}
            />
          </label>

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
            </div>
          </fieldset>

          <button type="button" disabled={!exportEnabled} onClick={() => onExport?.()}>
            Export STL
          </button>
        </div>
      </fieldset>
    </form>
  );
}
