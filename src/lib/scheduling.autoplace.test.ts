import { describe, it, expect } from 'vitest';
import { autoPlaceLots } from './scheduling';
import type { ShiftConfig } from '../domain/types';

const shift = (breaks: ShiftConfig['breaks'] = []): ShiftConfig => ({
  startMin: 420, endMin: 1140, pic: 'X', shiftNo: 1, tTimeSec: 48, breaks, productionStartMin: 420,
});

describe('autoPlaceLots', () => {
  it('places lots on a fixed 240s (4min) pitch, each occupying 1 minute', () => {
    const lots = autoPlaceLots([{ productCode: '2TR', count: 3 }], shift());
    expect(lots.map((l) => [l.startMin, l.endMin])).toEqual([
      [420, 421], [424, 425], [428, 429],
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
    const brk = [{
      id: 'b1', type: 'WAKOM1' as const, label: 'W', startMin: 424, endMin: 434,
    }];
    const lots = autoPlaceLots([{ productCode: '2TR', count: 3 }], shift(brk));
    // first at 420-421, break 424-434 skipped, then resume at 434, 438
    expect(lots.map((l) => l.startMin)).toEqual([420, 434, 438]);
  });

  it('marks nothing as shifted on initial placement', () => {
    const lots = autoPlaceLots([{ productCode: 'KAI', count: 2 }], shift());
    expect(lots.every((l) => l.shifted === false)).toBe(true);
  });
});
