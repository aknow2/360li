import { useEffect, useReducer, useState } from 'react'
import './App.css'
import { Controls } from './components/Controls'
import { Viewer } from './components/Viewer'
import { createGenerationRunCoordinator, generateFromSnapshot, toGenerateErrorMessage } from './domain/generate'
import { initialState, isExportReady, reducer } from './domain/state'
import { createBuildSnapshot, type BuiltPart } from './domain/builtPart'
import type { LithophaneParams, SplitField } from './domain/params'
import { loadPreferences, savePreferences } from './domain/preferences'
import { validateParams } from './domain/validation'
import { exportBuiltPart } from './three/exporter'
import type { AnimationSettings, CenterLightSettings } from './three/scene'

export type BuiltPartGeometryOwner = {
  replace(part: BuiltPart): void
  clear(): void
  snapshot(): Readonly<{ current: BuiltPart | null }>
}

/** App-only owner for published BuiltPart source geometry. */
// eslint-disable-next-line react-refresh/only-export-components
export function createBuiltPartGeometryOwner(): BuiltPartGeometryOwner {
  let current: BuiltPart | null = null

  function clear() {
    const previous = current
    current = null
    previous?.geometry.dispose()
  }

  return {
    replace(part) {
      if (part === current) return
      clear()
      current = part
    },
    clear,
    snapshot: () => Object.freeze({ current }),
  }
}

function App() {
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const preferences = loadPreferences()
    const v = validateParams(preferences.params)
    return initialState(preferences.params, v.ok ? null : {
      field: v.error.field as keyof LithophaneParams,
      message: v.error.message,
    })
  })
  const [runCoordinator] = useState(() => createGenerationRunCoordinator())
  const [builtPartOwner] = useState(() => createBuiltPartGeometryOwner())
  const [exportErrorMessage, setExportErrorMessage] = useState<string | null>(null)
  const [showTexture, setShowTexture] = useState(() => loadPreferences().showTexture)
  const [animationSettings, setAnimationSettings] = useState<AnimationSettings>(
    () => loadPreferences().animationSettings,
  )
  const [centerLightSettings, setCenterLightSettings] = useState<CenterLightSettings>(
    () => loadPreferences().centerLightSettings,
  )

  useEffect(() => {
    savePreferences({
      params: state.params,
      showTexture,
      animationSettings,
      centerLightSettings,
    })
  }, [animationSettings, centerLightSettings, showTexture, state.params])

  useEffect(() => () => {
    runCoordinator.invalidate()
    builtPartOwner.clear()
  }, [builtPartOwner, runCoordinator])

  async function runGeneration(snapshot: ReturnType<typeof createBuildSnapshot>, runToken: number) {
    try {
      const builtPart = await generateFromSnapshot(snapshot)
      runCoordinator.publish(runToken, builtPart, (current) => {
        builtPartOwner.replace(current)
        dispatch({ type: 'generation_success', builtPart: current })
      }, (stale) => {
        stale.geometry.dispose()
      })
    } catch (err) {
      if (!runCoordinator.isCurrent(runToken)) return
      dispatch({ type: 'generation_error', errorMessage: toGenerateErrorMessage(err) })
    }
  }

  async function handleSelectFile(file: File) {
    runCoordinator.invalidate()
    builtPartOwner.clear()
    setExportErrorMessage(null)
    dispatch({ type: 'select_file', file })
    // Do not auto-generate. User must press Build.
  }

  function handleChangeParams(next: LithophaneParams) {
    setExportErrorMessage(null)
    const v = validateParams(next, state.splitDraft)
    dispatch({
      type: 'set_params',
      params: next,
      paramsError: v.ok ? null : {
        field: v.error.field as keyof LithophaneParams,
        message: v.error.message,
      },
    })
  }

  function handleChangeSplitDraft(field: SplitField, raw: string) {
    setExportErrorMessage(null)
    dispatch({ type: 'set_split_input', field, raw })
  }

  function handleBuild() {
    setExportErrorMessage(null)
    if (!state.file) return
    if (state.status === 'generating') return
    if (state.paramsError) return
    const snapshot = createBuildSnapshot(state.file, state.params)
    const runToken = runCoordinator.begin()
    builtPartOwner.clear()
    dispatch({ type: 'start_generate' })
    void runGeneration(snapshot, runToken)
  }

  function handleExport() {
    setExportErrorMessage(null)

    if (state.status === 'generating') {
      setExportErrorMessage('Generation in progress. Please wait.');
      return
    }

    if (!isExportReady(state)) {
      setExportErrorMessage('No model to export yet.');
      return
    }

    try {
      exportBuiltPart(state.builtPart)
      setExportErrorMessage(null)
    } catch (err) {
      setExportErrorMessage(toGenerateErrorMessage(err))
    }
  }

  return (
    <div className="app">
      <header className="appHeader">
        <h1 className="appTitle">Spherical Lithophane Generator</h1>
      </header>

      <div className="appBody">
        <aside className="sidebar">
          <Controls
            disabled={state.status === 'generating'}
            statusText={
              state.status === 'generating'
                ? 'Generating…'
                : state.status === 'ready'
                  ? 'Ready'
                  : state.status === 'error'
                    ? 'Error'
                    : state.status === 'imageLoaded'
                      ? 'Image loaded'
                      : null
            }
            errorMessage={state.status === 'error' ? state.errorMessage : null}
            onSelectFile={handleSelectFile}
            showTexture={showTexture}
            onToggleShowTexture={setShowTexture}
            params={state.params}
            splitDraft={state.splitDraft}
            paramsEnabled={state.status !== 'idle'}
            paramsErrorField={state.paramsError?.field ?? null}
            paramsErrorMessage={state.paramsError?.message ?? null}
            onChangeParams={handleChangeParams}
            onChangeSplitDraft={handleChangeSplitDraft}
            buildEnabled={Boolean(state.file) && state.status !== 'generating' && !state.paramsError}
            onBuild={handleBuild}
            exportEnabled={isExportReady(state)}
            exportErrorMessage={exportErrorMessage}
            onExport={handleExport}
            animationSettings={animationSettings}
            onChangeAnimationSettings={setAnimationSettings}
            centerLightSettings={centerLightSettings}
            onChangeCenterLightSettings={setCenterLightSettings}
          />
        </aside>

        <main className="viewer">
          <Viewer
            builtPart={state.builtPart}
            showTexture={showTexture}
            animationSettings={animationSettings}
            centerLightSettings={centerLightSettings}
            placeholderText={
              state.status === 'generating'
                ? 'Generating…'
                : state.status === 'error'
                  ? 'Fix the error and try again.'
                  : state.status === 'imageLoaded'
                    ? 'Press Build to generate.'
                  : '3D preview will appear here.'
            }
          />
        </main>
      </div>
    </div>
  )
}

export default App
