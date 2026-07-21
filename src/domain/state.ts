import type { BuiltPart } from './builtPart';
import { DEFAULT_PARAMS, type LithophaneParams, type SplitField, type SplitInputDraft } from './params';
import {
  applySplitDraft,
  splitDraftFromParams,
  type ParamsValidationError,
} from './validation';

export type { ParamsValidationError } from './validation';

export type AppStatus = 'idle' | 'imageLoaded' | 'generating' | 'ready' | 'error';

type CommonState = {
  file: File | null;
  params: LithophaneParams;
  splitDraft: SplitInputDraft;
  paramsError: ParamsValidationError;
  builtPart: BuiltPart | null;
  errorMessage: string | null;
};

export type AppState =
  | (CommonState & { status: 'idle'; file: null; builtPart: null; errorMessage: null })
  | (CommonState & { status: 'imageLoaded'; file: File; builtPart: null; errorMessage: null })
  | (CommonState & { status: 'generating'; file: File; builtPart: null; errorMessage: null })
  | (CommonState & { status: 'ready'; file: File; builtPart: BuiltPart; errorMessage: null })
  | (CommonState & { status: 'error'; builtPart: null; errorMessage: string });

export type AppAction =
  | { type: 'select_file'; file: File }
  | { type: 'set_params'; params: LithophaneParams; paramsError: ParamsValidationError }
  | { type: 'set_split_input'; field: SplitField; raw: string }
  | { type: 'start_generate' }
  | { type: 'generation_success'; builtPart: BuiltPart }
  | { type: 'generation_error'; errorMessage: string }
  | { type: 'reset' };

export function initialState(
  params: LithophaneParams = DEFAULT_PARAMS,
  paramsError: ParamsValidationError = null,
): AppState {
  const editableParams = { ...params };
  return {
    status: 'idle',
    file: null,
    params: editableParams,
    splitDraft: splitDraftFromParams(editableParams),
    paramsError,
    builtPart: null,
    errorMessage: null,
  };
}

export function isExportReady(state: AppState): state is Extract<AppState, { status: 'ready' }> {
  return state.status === 'ready' && state.builtPart !== null;
}

export function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'select_file':
      return {
        ...state,
        status: 'imageLoaded',
        file: action.file,
        builtPart: null,
        errorMessage: null,
      };
    case 'set_params':
      return {
        ...state,
        params: action.params,
        paramsError: action.paramsError,
      };
    case 'set_split_input': {
      const applied = applySplitDraft(state.params, state.splitDraft, action.field, action.raw);
      return {
        ...state,
        params: applied.params,
        splitDraft: applied.drafts,
        paramsError: applied.error,
      };
    }
    case 'start_generate':
      if (!state.file || state.paramsError || state.status === 'generating') return state;
      return {
        ...state,
        status: 'generating',
        file: state.file,
        builtPart: null,
        errorMessage: null,
      };
    case 'generation_success':
      if (state.status !== 'generating') return state;
      return {
        ...state,
        status: 'ready',
        builtPart: action.builtPart,
        errorMessage: null,
      };
    case 'generation_error':
      if (state.status !== 'generating') return state;
      return {
        ...state,
        status: 'error',
        builtPart: null,
        errorMessage: action.errorMessage,
      };
    case 'reset':
      return initialState();
    default:
      return state;
  }
}
