import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { DEFAULT_PARAMS, type LithophaneParams } from '../../src/domain/params';
import { allocateSegmentRange, resolveSplitCell } from '../../src/lithophane/splitCell';

function params(overrides: Partial<LithophaneParams>): LithophaneParams {
  return { ...DEFAULT_PARAMS, ...overrides };
}

function cellsFor(widthSegments: number, heightSegments: number, horizontalCount: number, verticalCount: number) {
  return Array.from({ length: horizontalCount * verticalCount }, (_, offset) => resolveSplitCell(params({
    widthSegments,
    heightSegments,
    horizontalSplitCount: horizontalCount,
    verticalSplitCount: verticalCount,
    splitIndex: offset + 1,
  })));
}

function assertCompleteAllocation(total: number, parts: number): void {
  const ranges = Array.from({ length: parts }, (_, offset) => allocateSegmentRange(total, parts, offset + 1));
  assert.equal(ranges[0]?.start, 0);
  assert.equal(ranges.at(-1)?.end, total);
  assert.equal(ranges.reduce((sum, range) => sum + range.count, 0), total);
  for (let ordinal = 0; ordinal < ranges.length - 1; ordinal += 1) {
    assert.equal(ranges[ordinal]?.end, ranges[ordinal + 1]?.start);
  }
  assert.deepEqual(
    ranges.flatMap((range) => Array.from({ length: range.count }, (_, offset) => range.start + offset)),
    Array.from({ length: total }, (_, segment) => segment),
  );
  const quotient = Math.floor(total / parts);
  const remainder = total % parts;
  assert.deepEqual(ranges.map((range) => range.count), Array.from(
    { length: parts },
    (_, offset) => quotient + (offset + 1 <= remainder ? 1 : 0),
  ));
}

export async function registerTests(t: TestContext): Promise<void> {
  await t.test('10x5 / H3 V2 resolves all six exact row-major cells', () => {
    const cells = cellsFor(10, 5, 3, 2);
    assert.deepEqual(cells.map((cell) => ({
      index: cell.index,
      row: cell.row,
      column: cell.column,
      uSegments: cell.uSegments,
      vSegments: cell.vSegments,
      uMin: cell.uMin,
      uMax: cell.uMax,
      vMin: cell.vMin,
      vMax: cell.vMax,
    })), [
      { index: 1, row: 1, column: 1, uSegments: { start: 0, end: 4, count: 4 }, vSegments: { start: 0, end: 3, count: 3 }, uMin: 0, uMax: 0.4, vMin: 0, vMax: 0.6 },
      { index: 2, row: 1, column: 2, uSegments: { start: 4, end: 7, count: 3 }, vSegments: { start: 0, end: 3, count: 3 }, uMin: 0.4, uMax: 0.7, vMin: 0, vMax: 0.6 },
      { index: 3, row: 1, column: 3, uSegments: { start: 7, end: 10, count: 3 }, vSegments: { start: 0, end: 3, count: 3 }, uMin: 0.7, uMax: 1, vMin: 0, vMax: 0.6 },
      { index: 4, row: 2, column: 1, uSegments: { start: 0, end: 4, count: 4 }, vSegments: { start: 3, end: 5, count: 2 }, uMin: 0, uMax: 0.4, vMin: 0.6, vMax: 1 },
      { index: 5, row: 2, column: 2, uSegments: { start: 4, end: 7, count: 3 }, vSegments: { start: 3, end: 5, count: 2 }, uMin: 0.4, uMax: 0.7, vMin: 0.6, vMax: 1 },
      { index: 6, row: 2, column: 3, uSegments: { start: 7, end: 10, count: 3 }, vSegments: { start: 3, end: 5, count: 2 }, uMin: 0.7, uMax: 1, vMin: 0.6, vMax: 1 },
    ]);
  });

  await t.test('11x7 / H4 V3 has exact allocation and complete coverage', () => {
    assertCompleteAllocation(11, 4);
    assertCompleteAllocation(7, 3);
    const cells = cellsFor(11, 7, 4, 3);
    assert.deepEqual(cells.slice(0, 4).map((cell) => cell.uSegments), [
      { start: 0, end: 3, count: 3 }, { start: 3, end: 6, count: 3 },
      { start: 6, end: 9, count: 3 }, { start: 9, end: 11, count: 2 },
    ]);
    assert.deepEqual(cells.filter((cell) => cell.column === 1).map((cell) => cell.vSegments), [
      { start: 0, end: 3, count: 3 }, { start: 3, end: 5, count: 2 }, { start: 5, end: 7, count: 2 },
    ]);
  });

  await t.test('all required non-divisible fixtures allocate each segment once and give extras only to earliest ordinals', () => {
    for (const [width, height, horizontal, vertical] of [
      [13, 9, 5, 4],
      [17, 10, 6, 3],
      [19, 13, 7, 5],
    ] as const) {
      assertCompleteAllocation(width, horizontal);
      assertCompleteAllocation(height, vertical);
      const cells = cellsFor(width, height, horizontal, vertical);
      assert.equal(cells.length, horizontal * vertical);
    }
  });

  await t.test('one-segment cells have nonzero half-open ranges', () => {
    for (const cell of cellsFor(8, 4, 8, 4)) {
      assert.equal(cell.uSegments.count, 1);
      assert.equal(cell.vSegments.count, 1);
      assert.equal(cell.uSegments.end - cell.uSegments.start, 1);
      assert.equal(cell.vSegments.end - cell.vSegments.start, 1);
      assert.ok(cell.uMin < cell.uMax);
      assert.ok(cell.vMin < cell.vMax);
    }
  });

  await t.test('pole rows and seam columns have exact closed bounds and unambiguous half-open ownership', () => {
    const cells = cellsFor(10, 5, 3, 2);
    const south = cells.filter((cell) => cell.row === 1);
    const north = cells.filter((cell) => cell.row === 2);
    assert.ok(south.every((cell) => cell.vMin === 0 && cell.vSegments.count > 0));
    assert.ok(north.every((cell) => cell.vMax === 1 && cell.vSegments.count > 0));
    const seamStart = cells.filter((cell) => cell.column === 1);
    const seamEnd = cells.filter((cell) => cell.column === 3);
    assert.ok(seamStart.every((cell) => cell.uMin === 0 && cell.uSegments.count > 0));
    assert.ok(seamEnd.every((cell) => cell.uMax === 1 && cell.uSegments.count > 0));
  });

  await t.test('index is 1-based, row-major from local south and splitU=0', () => {
    for (const cell of cellsFor(11, 7, 4, 3)) {
      assert.equal(cell.index, (cell.row - 1) * cell.horizontalCount + cell.column);
      assert.equal(cell.row, Math.floor((cell.index - 1) / cell.horizontalCount) + 1);
      assert.equal(cell.column, ((cell.index - 1) % cell.horizontalCount) + 1);
    }
  });

  await t.test('1x1 resolves complete exact ranges and normalized bounds', () => {
    const cell = resolveSplitCell(params({ widthSegments: 10, heightSegments: 5 }));
    assert.deepEqual(cell, {
      row: 1,
      column: 1,
      index: 1,
      horizontalCount: 1,
      verticalCount: 1,
      uSegments: { start: 0, end: 10, count: 10 },
      vSegments: { start: 0, end: 5, count: 5 },
      uMin: 0,
      uMax: 1,
      vMin: 0,
      vMax: 1,
    });
  });
}
