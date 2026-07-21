import { useEffect, useReducer, useState } from 'react'
import './App.css'
import { Controls } from './components/Controls'
import { Viewer } from './components/Viewer'
import {
  createGenerationRunCoordinator,
  generateFromSnapshot,
  toGenerateErrorMessage,
  type GenerationRunCoordinator,
} from './domain/generate'
import { initialState, isExportReady, reducer } from './domain/state'
import { createBuildSnapshot, type BuiltPart } from './domain/builtPart'
import type { LithophaneParams, SplitField } from './domain/params'
import { loadPreferences, savePreferences } from './domain/preferences'
import { validateParams } from './domain/validation'
import { exportBuiltPart } from './three/exporter'
import type { AnimationSettings, CenterLightSettings } from './three/scene'
import {
  decodeImageToImageData,
  type ImageDecodeDependencies,
} from './lithophane/imageDecode'
import { generateSphereLithophane } from './lithophane/sphereLithophane'
import { createWorkingImage } from './lithophane/workingImage'

export type BuiltPartGeometryOwner = {
  replace(part: BuiltPart): void
  clear(): void
  snapshot(): Readonly<{ current: BuiltPart | null }>
}

export type AppBuildGate = Readonly<{
  tryBegin(): number | null
  invalidate(): void
  release(token: number): boolean
  snapshot(): Readonly<{ locked: boolean; activeToken: number | null }>
}>

/** Synchronous App-side latch layered over async run invalidation. */
// eslint-disable-next-line react-refresh/only-export-components
export function createAppBuildGate(runCoordinator: GenerationRunCoordinator): AppBuildGate {
  let activeToken: number | null = null
  return {
    tryBegin() {
      if (activeToken !== null) return null
      activeToken = runCoordinator.begin()
      return activeToken
    },
    invalidate() {
      runCoordinator.invalidate()
      activeToken = null
    },
    release(token) {
      if (activeToken !== token) return false
      activeToken = null
      return true
    },
    snapshot: () => Object.freeze({
      locked: activeToken !== null,
      activeToken,
    }),
  }
}

type AppDecodePlatform = Omit<ImageDecodeDependencies, 'createWorkingImage'>

/** App's production decode/working-image/generator route; tests inject platform primitives only. */
// eslint-disable-next-line react-refresh/only-export-components
export function runAppGeneration(
  snapshot: ReturnType<typeof createBuildSnapshot>,
  decodePlatform?: AppDecodePlatform,
): Promise<BuiltPart> {
  if (!decodePlatform) return generateFromSnapshot(snapshot)
  return generateFromSnapshot(snapshot, {
    decode: (file, options) => decodeImageToImageData(file, options, {
      ...decodePlatform,
      createWorkingImage,
    }),
    generate: generateSphereLithophane,
  })
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
  const [buildGate] = useState(() => createAppBuildGate(runCoordinator))
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
    buildGate.invalidate()
    builtPartOwner.clear()
  }, [buildGate, builtPartOwner])

  async function runGeneration(snapshot: ReturnType<typeof createBuildSnapshot>, runToken: number) {
    try {
      const builtPart = await runAppGeneration(snapshot)
      runCoordinator.publish(runToken, builtPart, (current) => {
        builtPartOwner.replace(current)
        dispatch({ type: 'generation_success', builtPart: current })
      }, (stale) => {
        stale.geometry.dispose()
      })
    } catch (err) {
      if (!runCoordinator.isCurrent(runToken)) return
      dispatch({ type: 'generation_error', errorMessage: toGenerateErrorMessage(err) })
    } finally {
      buildGate.release(runToken)
    }
  }

  async function handleSelectFile(file: File) {
    buildGate.invalidate()
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
    const runToken = buildGate.tryBegin()
    if (runToken === null) return
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
