import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { DEFAULT_PARAMS } from '../../src/domain/params';
import { __resetPreferencesForTests, loadPreferences, savePreferences } from '../../src/domain/preferences';

const storageKey = 'spherical-lithophane.settings.v1';

function installStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } },
  });
  __resetPreferencesForTests();
  return {
    values,
    restore() {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
      __resetPreferencesForTests();
    },
  };
}

export async function registerTests(t: TestContext): Promise<void> {
  await t.test('valid split settings save and load exactly', () => {
    const storage = installStorage();
    try {
      const settings = { ...loadPreferences(), params: { ...DEFAULT_PARAMS, horizontalSplitCount: 3, verticalSplitCount: 2, splitIndex: 5 } };
      savePreferences(settings);
      __resetPreferencesForTests();
      assert.deepEqual(loadPreferences().params, settings.params);
    } finally { storage.restore(); }
  });

  await t.test('version 1 payload missing split settings migrates only those fields', () => {
    const legacyParams = { ...DEFAULT_PARAMS, radiusMm: 77, widthSegments: 321 } as Record<string, unknown>;
    delete legacyParams.horizontalSplitCount;
    delete legacyParams.verticalSplitCount;
    delete legacyParams.splitIndex;
    const storage = installStorage({ [storageKey]: JSON.stringify({ version: 1, settings: { params: legacyParams, showTexture: false } }) });
    try {
      const loaded = loadPreferences();
      assert.equal(loaded.params.radiusMm, 77);
      assert.equal(loaded.params.widthSegments, 321);
      assert.equal(loaded.params.horizontalSplitCount, 1);
      assert.equal(loaded.params.verticalSplitCount, 1);
      assert.equal(loaded.params.splitIndex, 1);
      assert.equal(loaded.showTexture, false);
    } finally { storage.restore(); }
  });

  await t.test('split migration preserves finite invalid values and defaults only each invalid field', () => {
    const finiteInvalid = { horizontalSplitCount: 1.5, verticalSplitCount: 999, splitIndex: -4 };
    const storage = installStorage({ [storageKey]: JSON.stringify({ version: 1, settings: { params: { ...DEFAULT_PARAMS, ...finiteInvalid } } }) });
    try {
      assert.deepEqual(loadPreferences().params, { ...DEFAULT_PARAMS, ...finiteInvalid });
    } finally { storage.restore(); }
    for (const field of ['horizontalSplitCount', 'verticalSplitCount', 'splitIndex'] as const) {
      for (const [description, encoded] of [
        ['missing', undefined],
        ['wrong type', 'bad'],
        ['exponent overflow', '1e999'],
      ] as const) {
        const params: Record<string, unknown> = { ...DEFAULT_PARAMS, horizontalSplitCount: 2, verticalSplitCount: 3, splitIndex: 4 };
        if (encoded === undefined) delete params[field];
        else if (description === 'exponent overflow') params[field] = JSON.parse(encoded);
        else params[field] = encoded;
        const payload = JSON.stringify({ version: 1, settings: { params } });
        const serialized = description === 'exponent overflow'
          ? payload.replace(`"${field}":null`, `"${field}":1e999`)
          : payload;
        assert.ok(serialized.includes(description === 'exponent overflow' ? `"${field}":1e999` : '"version":1'));
        const isolated = installStorage({ [storageKey]: serialized });
        try {
          const loaded = loadPreferences().params;
          assert.equal(loaded[field], 1, `${field} ${description}`);
          assert.equal(loaded.horizontalSplitCount, field === 'horizontalSplitCount' ? 1 : 2);
          assert.equal(loaded.verticalSplitCount, field === 'verticalSplitCount' ? 1 : 3);
          assert.equal(loaded.splitIndex, field === 'splitIndex' ? 1 : 4);
        } finally { isolated.restore(); }
      }
    }
  });

  await t.test('corrupt JSON defaults and saved envelope contains only numeric settings', () => {
    const storage = installStorage({ [storageKey]: '{bad json' });
    try {
      assert.deepEqual(loadPreferences().params, DEFAULT_PARAMS);
      savePreferences({
        ...loadPreferences(),
        params: { ...DEFAULT_PARAMS, horizontalSplitCount: 3, verticalSplitCount: 2, splitIndex: 5 },
        file: { name: 'volatile.png' },
        geometry: { volatile: true },
        builtPart: { volatile: true },
        splitDraft: { horizontalSplitCount: '', verticalSplitCount: 'NaN', splitIndex: 'Infinity' },
      } as never);
      const serialized = storage.values.get(storageKey) ?? '';
      const payload = JSON.parse(serialized) as { version: number; settings: { params: Record<string, unknown> } };
      assert.equal(payload.version, 1);
      assert.deepEqual(Object.keys(payload).sort(), ['settings', 'version']);
      assert.equal(payload.settings.params.horizontalSplitCount, 3);
      assert.equal(serialized.includes('geometry'), false);
      assert.equal(serialized.includes('ImageData'), false);
      assert.equal(serialized.includes('builtPart'), false);
      assert.equal(serialized.includes('File'), false);
      assert.equal(serialized.includes('volatile.png'), false);
      assert.equal(serialized.includes('splitDraft'), false);
    } finally { storage.restore(); }
  });
}
