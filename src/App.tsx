import { useEffect, useReducer, useRef, useState } from 'react'
import './App.css'
import { Controls } from './components/Controls'
import { Viewer } from './components/Viewer'
import { generateFromFile, toGenerateErrorMessage } from './domain/generate'
import { initialState, reducer } from './domain/state'
import type { LithophaneParams } from './domain/params'
import { validateParams } from './domain/validation'
import { downloadBlob, exportGeometryToStlBlob } from './three/exporter'

function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)
  const runIdRef = useRef(0)
  const lastGenKeyRef = useRef<string>('')
  const [exportErrorMessage, setExportErrorMessage] = useState<string | null>(null)

  async function runGeneration(file: File, params: LithophaneParams) {
    dispatch({ type: 'start_generate' })

    const runId = ++runIdRef.current
    try {
      const result = await generateFromFile(file, { params })
      if (runId !== runIdRef.current) return
      dispatch({ type: 'generation_success', geometry: result.geometry, summary: result.summary })
    } catch (err) {
      if (runId !== runIdRef.current) return
      dispatch({ type: 'generation_error', errorMessage: toGenerateErrorMessage(err) })
    }
  }

  async function handleSelectFile(file: File) {
    setExportErrorMessage(null)
    dispatch({ type: 'select_file', file })
    const v = validateParams(state.params)
    if (!v.ok) {
      dispatch({ type: 'set_params', params: state.params, paramsError: { field: v.error.field, message: v.error.message } })
      return
    }
    await runGeneration(file, state.params)
  }

  function handleChangeParams(next: LithophaneParams) {
    setExportErrorMessage(null)
    const v = validateParams(next)
    dispatch({
      type: 'set_params',
      params: next,
      paramsError: v.ok ? null : { field: v.error.field, message: v.error.message },
    })
  }

  useEffect(() => {
    if (state.status === 'idle') return
    if (!state.file) return
    if (state.status === 'generating') return
    if (state.paramsError) return

    const key = JSON.stringify({ name: state.file.name, size: state.file.size, lm: state.file.lastModified, p: state.params })
    if (key === lastGenKeyRef.current) return
    lastGenKeyRef.current = key

    // Trigger regeneration on param changes.
    void runGeneration(state.file, state.params)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.file, state.params, state.paramsError, state.status])

  function handleExport() {
    setExportErrorMessage(null)

    if (state.status === 'generating') {
      setExportErrorMessage('Generation in progress. Please wait.');
      return
    }

    if (state.status !== 'ready') {
      setExportErrorMessage('No model to export yet.');
      return
    }

    try {
      const blob = exportGeometryToStlBlob(state.geometry, { binary: true })
      downloadBlob(blob, 'spherical-lithophane.stl')
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
            params={state.params}
            paramsEnabled={state.status !== 'idle'}
            paramsErrorField={state.paramsError?.field ?? null}
            paramsErrorMessage={state.paramsError?.message ?? null}
            onChangeParams={handleChangeParams}
            exportEnabled={state.status === 'ready'}
            exportErrorMessage={exportErrorMessage}
            onExport={handleExport}
          />
        </aside>

        <main className="viewer">
          <Viewer
            geometry={state.status === 'ready' ? state.geometry : null}
            placeholderText={
              state.status === 'generating'
                ? 'Generating…'
                : state.status === 'error'
                  ? 'Fix the error and try again.'
                  : '3D preview will appear here.'
            }
          />
        </main>
      </div>
    </div>
  )
}

export default App
