import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Controls } from '../../src/components/Controls';
import { DEFAULT_PARAMS } from '../../src/domain/params';
import {
  applySplitDraft,
  splitDraftFromParams,
  validateParams,
} from '../../src/domain/validation';

const splitFields = ['horizontalSplitCount', 'verticalSplitCount', 'splitIndex'] as const;

function splitFieldMarkup(markup: string, labelText: string): string {
  const labels = markup.match(/<label\b[^>]*>(?:(?!<\/?label\b)[\s\S])*?<\/label>/g) ?? [];
  const match = labels.find((label) => label.includes(`<span>${labelText}</span>`));
  assert.ok(match, `${labelText} must be contained in its own label`);
  return match;
}

export async function registerTests(t: TestContext): Promise<void> {
  await t.test('split defaults and raw drafts preserve exact numeric strings', () => {
    assert.equal(DEFAULT_PARAMS.horizontalSplitCount, 1);
    assert.equal(DEFAULT_PARAMS.verticalSplitCount, 1);
    assert.equal(DEFAULT_PARAMS.splitIndex, 1);
    assert.deepEqual(splitDraftFromParams({ ...DEFAULT_PARAMS, horizontalSplitCount: 3.5, verticalSplitCount: 2, splitIndex: 7 }), {
      horizontalSplitCount: '3.5',
      verticalSplitCount: '2',
      splitIndex: '7',
    });
  });

  await t.test('split drafts retain raw transient input and finite numeric values without correction', () => {
    let params = { ...DEFAULT_PARAMS };
    let drafts = splitDraftFromParams(params);
    for (const raw of ['', 'NaN', 'Infinity', '1e999']) {
      const applied = applySplitDraft(params, drafts, 'horizontalSplitCount', raw);
      assert.equal(applied.drafts.horizontalSplitCount, raw);
      assert.equal(applied.params.horizontalSplitCount, 1);
      assert.equal(applied.error?.field, 'horizontalSplitCount');
      params = applied.params;
      drafts = applied.drafts;
    }
    for (const [raw, expected] of [['1.5', 1.5], ['0', 0], ['-3', -3], ['999', 999]] as const) {
      const applied = applySplitDraft(params, drafts, 'horizontalSplitCount', raw);
      assert.equal(applied.drafts.horizontalSplitCount, raw);
      assert.equal(applied.params.horizontalSplitCount, expected);
      params = applied.params;
      drafts = applied.drafts;
    }
  });

  await t.test('split draft validation provides field-specific integer and dynamic range errors', () => {
    const params = { ...DEFAULT_PARAMS, widthSegments: 8, heightSegments: 4, horizontalSplitCount: 2, verticalSplitCount: 2, splitIndex: 1 };
    const expected = {
      horizontalSplitCount: 'Horizontal split count must be an integer between 1 and 8.',
      verticalSplitCount: 'Vertical split count must be an integer between 1 and 4.',
      splitIndex: 'Split Index must be an integer between 1 and 4.',
    };
    for (const field of splitFields) {
      for (const raw of ['', 'NaN', 'Infinity', '1e999', '1.5', '0', '-1']) {
        const drafts = { ...splitDraftFromParams(params), [field]: raw };
        const result = validateParams(params, drafts);
        assert.equal(result.ok, false, `${field} ${raw}`);
        if (!result.ok) {
          assert.equal(result.error.field, field);
          assert.equal(result.error.message, expected[field]);
        }
      }
    }
  });

  await t.test('split numeric limits are dynamic and reducing counts does not rewrite index', () => {
    const params = { ...DEFAULT_PARAMS, widthSegments: 8, heightSegments: 4, horizontalSplitCount: 8, verticalSplitCount: 4, splitIndex: 32 };
    assert.equal(validateParams(params).ok, true);
    const lowered = applySplitDraft(params, splitDraftFromParams(params), 'horizontalSplitCount', '2');
    assert.equal(lowered.params.splitIndex, 32);
    assert.equal(lowered.drafts.splitIndex, '32');
    assert.equal(lowered.error?.field, 'splitIndex');
    assert.equal(lowered.error?.message, 'Split Index must be an integer between 1 and 8.');
  });

  await t.test('legacy non-split validation remains unchanged', () => {
    const result = validateParams({ ...DEFAULT_PARAMS, radiusMm: 0 });
    assert.deepEqual(result, {
      ok: false,
      error: { code: 'INVALID_PARAMS', field: 'radiusMm', message: 'Radius must be > 0.' },
    });
  });

  await t.test('Controls statically renders exact split labels, raw values, nearby errors, and disabled Build', () => {
    const splitDraft = { horizontalSplitCount: '', verticalSplitCount: '1.5', splitIndex: '0' };
    for (const [field, label, raw, message] of [
      ['horizontalSplitCount', 'Horizontal split count', '', 'Horizontal split count must be an integer between 1 and 256.'],
      ['verticalSplitCount', 'Vertical split count', '1.5', 'Vertical split count must be an integer between 1 and 128.'],
      ['splitIndex', 'Split Index', '0', 'Split Index must be an integer between 1 and 1.'],
    ] as const) {
      const markup = renderToStaticMarkup(createElement(Controls, {
        params: DEFAULT_PARAMS,
        splitDraft,
        paramsErrorField: field,
        paramsErrorMessage: message,
        paramsEnabled: true,
        buildEnabled: false,
      }));
      const labelMarkup = splitFieldMarkup(markup, label);
      assert.ok(labelMarkup.includes(`<span>${label}</span>`));
      assert.ok(labelMarkup.includes(`value="${raw}"`));
      assert.ok(labelMarkup.includes('role="alert"'));
      assert.ok(labelMarkup.includes(message));
      assert.match(markup, /<button type="button" disabled=""[^>]*>Build<\/button>/);
    }
  });
}
