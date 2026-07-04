import { describe, it, expect } from 'vitest';
import { autoPlaceLots } from './scheduling';
import type { ShiftConfig } from '../domain/types';

const shift = (breaks: ShiftConfig['breaks'] = []): ShiftConfig => ({
  startMin: 420, endMin: 1140, pic: 'X', shiftNo: 1, tTimeSec: 48, breaks,
});

describe('autoPlaceLots', () => {
  it('places lots back-to-back in 5-minute slots from shift start', () => {
    const lots = autoPlaceLots([{ productCode: '2TR', count: 3 }], shift());
    expect(lots.map((l) => [l.startMin, l.endMin])).toEqual([
      [420, 425], [425, 430], [430, 435],
    ]);
  });

  it('numbers lots per product starting at 1', () => {
    const lots = autoPlaceLots(
      [{ productCode: '2TR', count: 2 }, { productCode: '1TR', count: 2 }],
      shift(),
    );
    expect(lots.map((l) => `${l.productCode}#${l.lotNo}`)).toEqual([
      '2TR#1', '2TR#2', '1TR#1', '1TR#2',
    ]);
  });

  it('skips over a break block instead of overlapping it', () => {
    const brk = [{ type: 'WAKOM1' as const, label: 'W', startMin: 425, endMin: 435 }];
    const lots = autoPlaceLots([{ productCode: '2TR', count: 3 }], shift(brk));
    // first at 420-425, break 425-435 skipped, then 435-440, 440-445
    expect(lots.map((l) => l.startMin)).toEqual([420, 435, 440]);
  });

  it('marks nothing as shifted on initial placement', () => {
    const lots = autoPlaceLots([{ productCode: 'KAI', count: 2 }], shift());
    expect(lots.every((l) => l.shifted === false)).toBe(true);
  });
});
