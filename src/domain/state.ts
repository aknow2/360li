import type { BufferGeometry } from 'three';
import type { GenerationSummary } from './contracts';
import { DEFAULT_PARAMS, type LithophaneParams } from './params';
import type { AppError } from './errors';

export type AppStatus = 'idle' | 'imageLoaded' | 'generating' | 'ready' | 'error';

export type ParamsValidationError = Pick<AppError, 'field' | 'message'> | null;

export type AppState =
  | {
      status: 'idle';
      file: null;
      params: LithophaneParams;
      paramsError: ParamsValidationError;
      geometry: null;
      summary: null;
      errorMessage: null;
    }
  | {
      status: 'imageLoaded';
      file: File;
      params: LithophaneParams;
      paramsError: ParamsValidationError;
      geometry: null;
      summary: null;
      errorMessage: null;
    }
  | {
      status: 'generating';
      file: File;
      params: LithophaneParams;
      paramsError: ParamsValidationError;
      geometry: null;
      summary: null;
      errorMessage: null;
    }
  | {
      status: 'ready';
      file: File;
      params: LithophaneParams;
      paramsError: ParamsValidationError;
      geometry: BufferGeometry;
      summary: GenerationSummary;
      errorMessage: null;
    }
  | {
      status: 'error';
      file: File | null;
      params: LithophaneParams;
      paramsError: ParamsValidationError;
      geometry: BufferGeometry | null;
      summary: GenerationSummary | null;
      errorMessage: string;
    };

export type AppAction =
  | { type: 'select_file'; file: File }
  | { type: 'set_params'; params: LithophaneParams; paramsError: ParamsValidationError }
  | { type: 'start_generate' }
  | { type: 'generation_success'; geometry: BufferGeometry; summary: GenerationSummary }
  | { type: 'generation_error'; errorMessage: string }
  | { type: 'reset' };

export function initialState(params: LithophaneParams = DEFAULT_PARAMS, paramsError: ParamsValidationError = null): AppState {
  return {
    status: 'idle',
    file: null,
    params,
    paramsError,
    geometry: null,
    summary: null,
    errorMessage: null,
  };
}

export function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'select_file':
      return {
        status: 'imageLoaded',
        file: action.file,
        params: state.params,
        paramsError: state.paramsError,
        geometry: null,
        summary: null,
        errorMessage: null,
      };
    case 'set_params': {
      // If a generation is in-flight, keep it running; App component will trigger a new generation.
      if (state.status === 'idle') {
        return { ...state, params: action.params, paramsError: action.paramsError };
      }

      if (state.status === 'imageLoaded') {
        return { ...state, params: action.params, paramsError: action.paramsError };
      }

      if (state.status === 'ready') {
        return { ...state, params: action.params, paramsError: action.paramsError };
      }

      if (state.status === 'generating') {
        return { ...state, params: action.params, paramsError: action.paramsError };
      }

      // error
      return { ...state, params: action.params, paramsError: action.paramsError };
    }
    case 'start_generate':
      if (state.status === 'idle') return state;
      if (!state.file) return state;
      return {
        status: 'generating',
        file: state.file,
        params: state.params,
        paramsError: state.paramsError,
        geometry: null,
        summary: null,
        errorMessage: null,
      };
    case 'generation_success':
      if (state.status !== 'generating') return state;
      return {
        status: 'ready',
        file: state.file,
        params: state.params,
        paramsError: state.paramsError,
        geometry: action.geometry,
        summary: action.summary,
        errorMessage: null,
      };
    case 'generation_error':
      return {
        status: 'error',
        file: state.status === 'idle' ? null : state.file,
        params: state.status === 'idle' ? DEFAULT_PARAMS : state.params,
        paramsError: state.status === 'idle' ? null : state.paramsError,
        geometry: state.status === 'ready' ? state.geometry : null,
        summary: state.status === 'ready' ? state.summary : null,
        errorMessage: action.errorMessage,
      };
    case 'reset':
      return initialState();
    default:
      return state;
  }
}
