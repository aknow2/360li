import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { DEFAULT_PARAMS, type LithophaneParams } from '../../src/domain/params';
import { createBuildSnapshot, deriveStlFileName } from '../../src/domain/builtPart';

const paramKeys = [
  'radiusMm',
  'minThicknessMm',
  'maxThicknessMm',
  'holeDiameterMm',
  'topHoleDiameterMm',
  'holeLatitude',
  'holeLongitude',
  'standWallThicknessMm',
  'widthSegments',
  'heightSegments',
  'contrast',
  'brightnessCurve',
  'minCos',
  'imageScale',
  'flipHorizontal',
  'flipVertical',
  'paddingMode',
  'thicknessDirection',
  'horizontalSplitCount',
  'verticalSplitCount',
  'splitIndex',
] satisfies Array<keyof LithophaneParams>;

export async function registerTests(t: TestContext): Promise<void> {
  await t.test('snapshot freezes a complete primitive params copy and exact source metadata', () => {
    const file = new File(['source bytes'], 'source.png', {
      type: 'image/png',
      lastModified: 1_725_000_123_456,
    });
    const editable = Object.assign({
      ...DEFAULT_PARAMS,
      radiusMm: 71,
      horizontalSplitCount: 3,
      verticalSplitCount: 2,
      splitIndex: 5,
    }, {
      showTexture: true,
      animationSettings: { enabled: true },
      centerLightSettings: { enabled: true },
    });
    const snapshot = createBuildSnapshot(file, editable);

    assert.deepEqual([...paramKeys].sort(), Object.keys(DEFAULT_PARAMS).sort());
    assert.deepEqual(Object.keys(snapshot.params).sort(), [...paramKeys].sort());
    assert.deepEqual(snapshot.params, Object.fromEntries(paramKeys.map((key) => [key, editable[key]])));
    assert.deepEqual(Object.keys(snapshot.source).sort(), ['file', 'lastModified', 'name', 'size', 'type']);
    assert.equal(snapshot.source.file, file);
    assert.deepEqual(snapshot.source, {
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified,
    });
    assert.notEqual(snapshot.params, editable);
    assert.equal(Object.isFrozen(snapshot), true);
    assert.equal(Object.isFrozen(snapshot.params), true);
    assert.equal(Object.isFrozen(snapshot.source), true);
    assert.equal('showTexture' in snapshot.params, false);
    assert.equal('animationSettings' in snapshot.params, false);
    assert.equal('centerLightSettings' in snapshot.params, false);

    editable.radiusMm = 999;
    editable.horizontalSplitCount = 1;
    const replacement = { ...editable, splitIndex: 1 };
    assert.equal(snapshot.params.radiusMm, 71);
    assert.equal(snapshot.params.horizontalSplitCount, 3);
    assert.equal(snapshot.params.splitIndex, 5);
    assert.equal(replacement.splitIndex, 1);
  });

  await t.test('filename is exact for legacy 1x1 and split 3x2 part 5', () => {
    assert.equal(deriveStlFileName(Object.freeze({ ...DEFAULT_PARAMS })), 'spherical-lithophane.stl');
    assert.equal(
      deriveStlFileName(Object.freeze({
        ...DEFAULT_PARAMS,
        horizontalSplitCount: 3,
        verticalSplitCount: 2,
        splitIndex: 5,
      })),
      'spherical-lithophane-h3-v2-part-5-of-6.stl',
    );
  });
}
