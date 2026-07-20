import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import * as THREE from 'three';
import { createBuildSnapshot, deriveStlFileName, type BuiltPart } from '../../src/domain/builtPart';
import {
  createGenerationRunCoordinator,
  generateFromSnapshot,
} from '../../src/domain/generate';
import { DEFAULT_PARAMS, type LithophaneParams } from '../../src/domain/params';
import { initialState, isExportReady, reducer, type AppState } from '../../src/domain/state';
import { validateParams } from '../../src/domain/validation';

function file(name = 'source.png'): File {
  return new File(['pixels'], name, { type: 'image/png', lastModified: 123 });
}

function imageData(seed = 7): ImageData {
  return { width: 1, height: 1, data: new Uint8ClampedArray([seed, seed, seed, 255]) } as ImageData;
}

function builtPart(params: LithophaneParams = DEFAULT_PARAMS): BuiltPart {
  const snapshot = createBuildSnapshot(file(), params);
  return Object.freeze({
    geometry: new THREE.BufferGeometry(),
    summary: { vertexCount: 0, triangleCount: 0 },
    workingImage: imageData(),
    snapshot,
    fileName: deriveStlFileName(snapshot.params),
  });
}

function loaded(params: LithophaneParams = DEFAULT_PARAMS): AppState {
  return reducer(initialState(params), { type: 'select_file', file: file() });
}

function ready(part = builtPart()): AppState {
  const generating = reducer(loaded(part.snapshot.params as LithophaneParams), { type: 'start_generate' });
  return reducer(generating, { type: 'generation_success', builtPart: part });
}

export async function registerTests(t: TestContext): Promise<void> {
  await t.test('initial/reset state has exact drafts, fresh defaults, and no Built Part', () => {
    const params = { ...DEFAULT_PARAMS, horizontalSplitCount: 3, verticalSplitCount: 2, splitIndex: 5 };
    const state = initialState(params);
    assert.deepEqual(state.splitDraft, {
      horizontalSplitCount: '3',
      verticalSplitCount: '2',
      splitIndex: '5',
    });
    assert.equal(state.builtPart, null);
    const reset = reducer(state, { type: 'reset' });
    assert.notEqual(reset, state);
    assert.notEqual(reset.params, DEFAULT_PARAMS);
    assert.deepEqual(reset.params, DEFAULT_PARAMS);
    assert.deepEqual(reset.splitDraft, { horizontalSplitCount: '1', verticalSplitCount: '1', splitIndex: '1' });
    assert.equal(reset.builtPart, null);
  });

  await t.test('split input preserves raw invalid drafts and finite numeric values without correction', () => {
    let state = loaded();
    state = reducer(state, { type: 'set_split_input', field: 'horizontalSplitCount', raw: '' });
    assert.equal(state.splitDraft.horizontalSplitCount, '');
    assert.equal(state.params.horizontalSplitCount, 1);
    assert.equal(state.paramsError?.field, 'horizontalSplitCount');
    state = reducer(state, { type: 'set_split_input', field: 'horizontalSplitCount', raw: 'Infinity' });
    assert.equal(state.params.horizontalSplitCount, 1);
    state = reducer(state, { type: 'set_split_input', field: 'horizontalSplitCount', raw: '1.5' });
    assert.equal(state.params.horizontalSplitCount, 1.5);
    assert.equal(state.splitDraft.horizontalSplitCount, '1.5');
    state = reducer(state, { type: 'set_split_input', field: 'horizontalSplitCount', raw: '999' });
    assert.equal(state.params.horizontalSplitCount, 999);
    assert.equal(state.splitDraft.horizontalSplitCount, '999');
  });

  await t.test('ready edits retain the exact Built Part snapshot, geometry, and export despite live edits', () => {
    const capturedParams = {
      ...DEFAULT_PARAMS,
      horizontalSplitCount: 3,
      verticalSplitCount: 2,
      splitIndex: 5,
      imageScale: 0.72,
      flipHorizontal: false,
      flipVertical: false,
      paddingMode: 'pad' as const,
    };
    const part = builtPart(capturedParams);
    const geometry = part.geometry;
    const snapshot = part.snapshot;
    const fileName = part.fileName;
    let state = ready(part);

    const assertCapturedPartRemainsExportable = () => {
      assert.equal(state.status, 'ready');
      assert.equal(state.builtPart, part);
      assert.equal(state.builtPart.geometry, geometry);
      assert.equal(state.builtPart.snapshot, snapshot);
      assert.equal(state.builtPart.fileName, fileName);
      assert.equal(isExportReady(state), true);
    };

    assertCapturedPartRemainsExportable();
    state = reducer(state, { type: 'set_split_input', field: 'horizontalSplitCount', raw: '4' });
    assert.deepEqual(state.splitDraft, {
      horizontalSplitCount: '4',
      verticalSplitCount: '2',
      splitIndex: '5',
    });
    assert.deepEqual(state.params, { ...capturedParams, horizontalSplitCount: 4 });
    assertCapturedPartRemainsExportable();

    state = reducer(state, { type: 'set_split_input', field: 'verticalSplitCount', raw: '3' });
    assert.deepEqual(state.splitDraft, {
      horizontalSplitCount: '4',
      verticalSplitCount: '3',
      splitIndex: '5',
    });
    assert.deepEqual(state.params, {
      ...capturedParams,
      horizontalSplitCount: 4,
      verticalSplitCount: 3,
    });
    assertCapturedPartRemainsExportable();

    state = reducer(state, { type: 'set_split_input', field: 'splitIndex', raw: '7' });
    assert.deepEqual(state.splitDraft, {
      horizontalSplitCount: '4',
      verticalSplitCount: '3',
      splitIndex: '7',
    });
    assert.deepEqual(state.params, {
      ...capturedParams,
      horizontalSplitCount: 4,
      verticalSplitCount: 3,
      splitIndex: 7,
    });
    assertCapturedPartRemainsExportable();

    const editedParams = {
      ...state.params,
      imageScale: 0.63,
      flipHorizontal: true,
      flipVertical: true,
      paddingMode: 'stretch' as const,
    };
    const editedValidation = validateParams(editedParams, state.splitDraft);
    assert.equal(editedValidation.ok, true);
    state = reducer(state, {
      type: 'set_params',
      params: editedParams,
      paramsError: null,
    });
    assert.deepEqual(state.params, {
      ...capturedParams,
      horizontalSplitCount: 4,
      verticalSplitCount: 3,
      splitIndex: 7,
      imageScale: 0.63,
      flipHorizontal: true,
      flipVertical: true,
      paddingMode: 'stretch',
    });
    assert.deepEqual(state.splitDraft, {
      horizontalSplitCount: '4',
      verticalSplitCount: '3',
      splitIndex: '7',
    });
    assert.equal(state.paramsError, null);
    assertCapturedPartRemainsExportable();
    assert.deepEqual(snapshot.params, capturedParams);
    assert.equal(Object.isFrozen(snapshot.params), true);
    assert.equal(fileName, 'spherical-lithophane-h3-v2-part-5-of-6.stl');

    state = reducer(state, { type: 'set_split_input', field: 'splitIndex', raw: '99' });
    assert.equal(state.splitDraft.splitIndex, '99');
    assert.equal(state.params.splitIndex, 99);
    assert.ok(state.paramsError);
    assertCapturedPartRemainsExportable();
  });

  await t.test('Build start is atomic only with file and valid params; file selection always clears', () => {
    const part = builtPart();
    const idle = initialState();
    assert.equal(reducer(idle, { type: 'start_generate' }), idle);

    const invalid = reducer(ready(part), { type: 'set_split_input', field: 'splitIndex', raw: '99' });
    assert.equal(reducer(invalid, { type: 'start_generate' }), invalid);

    const validReady = ready(part);
    const generating = reducer(validReady, { type: 'start_generate' });
    assert.equal(generating.status, 'generating');
    assert.equal(generating.builtPart, null);
    assert.equal(isExportReady(generating), false);

    const nextFile = file('next.png');
    const selected = reducer(invalid, { type: 'select_file', file: nextFile });
    assert.equal(selected.status, 'imageLoaded');
    assert.equal(selected.file, nextFile);
    assert.equal(selected.builtPart, null);
    assert.equal(selected.paramsError, invalid.paramsError);
    assert.equal(selected.splitDraft, invalid.splitDraft);
  });

  await t.test('success/error publish only from generating and reducer never disposes geometry', () => {
    const part = builtPart();
    let disposeCount = 0;
    part.geometry.dispose = () => { disposeCount += 1; };
    const generating = reducer(loaded(), { type: 'start_generate' });
    const error = reducer(generating, { type: 'generation_error', errorMessage: 'failed' });
    assert.equal(error.status, 'error');
    for (const state of [initialState(), loaded(), ready(), error] as const) {
      assert.equal(reducer(state, { type: 'generation_success', builtPart: part }), state);
      assert.equal(reducer(state, { type: 'generation_error', errorMessage: 'late' }), state);
    }
    const success = reducer(generating, { type: 'generation_success', builtPart: part });
    assert.equal(success.status, 'ready');
    assert.equal(success.builtPart, part);
    const failure = error;
    assert.equal(failure.status, 'error');
    assert.equal(failure.builtPart, null);
    assert.equal(disposeCount, 0);
    assert.equal(isExportReady(loaded()), false);
    assert.equal(isExportReady(failure), false);
  });

  await t.test('generation decodes and generates once from only the frozen snapshot', async () => {
    const source = file('captured.png');
    const editable = { ...DEFAULT_PARAMS, imageScale: 0.72, flipHorizontal: true, horizontalSplitCount: 3, verticalSplitCount: 2, splitIndex: 5 };
    const snapshot = createBuildSnapshot(source, editable);
    editable.imageScale = 0.2;
    editable.splitIndex = 1;
    const workingImage = imageData(41);
    const geometry = new THREE.BufferGeometry();
    let decodeCount = 0;
    let generateCount = 0;
    const part = await generateFromSnapshot(snapshot, {
      decode: async (receivedFile, options) => {
        decodeCount += 1;
        assert.equal(receivedFile, source);
        assert.deepEqual(options, {
          imageScale: 0.72,
          flipHorizontal: true,
          flipVertical: false,
          paddingMode: 'pad',
        });
        return { imageData: workingImage, width: 1, height: 1 };
      },
      generate: (receivedImage, receivedParams) => {
        generateCount += 1;
        assert.equal(receivedImage, workingImage);
        assert.equal(receivedParams, snapshot.params);
        return { geometry, summary: { vertexCount: 3, triangleCount: 1 } };
      },
    });
    assert.equal(decodeCount, 1);
    assert.equal(generateCount, 1);
    assert.equal(part.geometry, geometry);
    assert.equal(part.workingImage, workingImage);
    assert.equal(part.snapshot, snapshot);
    assert.equal(part.fileName, 'spherical-lithophane-h3-v2-part-5-of-6.stl');
    assert.equal(Object.isFrozen(part), true);
  });

  await t.test('run coordinator routes stale and current Built Parts through injected callbacks only', () => {
    const coordinator = createGenerationRunCoordinator();
    const staleToken = coordinator.begin();
    coordinator.invalidate();
    const stale = builtPart();
    let staleCount = 0;
    let publishCount = 0;
    let published: BuiltPart | null = null;
    assert.equal(coordinator.publish(
      staleToken,
      stale,
      (part) => { publishCount += 1; published = part; },
      (part) => { staleCount += 1; assert.equal(part, stale); },
    ), false);
    assert.equal(staleCount, 1);
    assert.equal(publishCount, 0);
    assert.equal(published, null);

    const currentToken = coordinator.begin();
    const current = builtPart();
    assert.equal(coordinator.publish(
      currentToken,
      current,
      (part) => { publishCount += 1; published = part; },
      () => { staleCount += 1; },
    ), true);
    assert.equal(staleCount, 1);
    assert.equal(publishCount, 1);
    assert.equal(published, current);
  });

  await t.test('run coordinator is resource-agnostic', () => {
    const coordinator = createGenerationRunCoordinator();
    const opaquePart = Object.freeze({
      geometry: new Proxy({}, {
        get() {
          throw new Error('the coordinator must not inspect Built Part resources');
        },
      }) as THREE.BufferGeometry,
    }) as BuiltPart;
    const token = coordinator.begin();
    let published = 0;
    assert.equal(coordinator.publish(token, opaquePart, (part) => {
      published += 1;
      assert.equal(part, opaquePart);
    }, () => {
      assert.fail('current result must not use the stale callback');
    }), true);
    assert.equal(published, 1);
  });
}
