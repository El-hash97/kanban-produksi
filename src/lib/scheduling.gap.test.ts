import { describe, it, expect } from 'vitest';
import { autoPlaceLots } from './scheduling';
import type { ShiftConfig } from '../domain/types';

// Reproduces the reported bug: as lots approach a break (Wakom/Istirahat),
// the gap between them widens beyond the normal 3-column (pitch - duration)
// gap, because a valid slot right before the break gets skipped.
const shift = (breaks: ShiftConfig['breaks']): ShiftConfig => ({
  startMin: 0, endMin: 1000, pic: 'X', shiftNo: 1, tTimeSec: 48, breaks, productionStartMin: 0, group: 'RED',
});

describe('autoPlaceLots near a break', () => {
  it('keeps the standard 4-minute pitch right up until a lot would truly overlap the break', () => {
    const brk = [{
      id: 'b1', type: 'WAKOM1' as const, label: 'W', day: 'DAY' as const, startMin: 14, endMin: 19,
    }];
    const lots = autoPlaceLots([{ productCode: '2TR', count: 5 }], shift(brk));
    // Pitch is 4 min from 0: 0,4,8,12 all fit (each lot is only 1 min wide,
    // so 12-13 does not touch the break at 14-19); only the slot at 16 would
    // truly overlap, so the 5th lot resumes right after the break at 19.
    expect(lots.map((l) => l.startMin)).toEqual([0, 4, 8, 12, 19]);
  });
});
