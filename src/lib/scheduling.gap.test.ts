import { describe, it, expect } from 'vitest';
import { autoPlaceLots } from './scheduling';
import type { ShiftConfig } from '../domain/types';

// Reproduces two related bugs found while scheduling lots around a break
// (Wakom/Istirahat/line stop):
// 1. A valid slot right before the break used to get rejected needlessly
//    (checked the full pitch window instead of the lot's real 1-min width).
// 2. Resuming after the break used to snap straight to the break's own end
//    minute, discarding whatever gap had already been banked before it. The
//    correct rule is complementary: gap-before + gap-after always sums to
//    the standard (pitch - duration) = 3 columns, e.g. a 1-column gap before
//    the break leaves a 2-column gap after it, and vice versa — the pitch
//    rhythm is never reset at a break's edge.
const shift = (breaks: ShiftConfig['breaks']): ShiftConfig => ({
  startMin: 0, endMin: 1000, pic: 'X', shiftNo: 1, tTimeSec: 48, breaks, productionStartMin: 0, group: 'RED',
});

describe('autoPlaceLots near a break', () => {
  it('keeps the standard 4-minute pitch right up until a lot would truly overlap the break', () => {
    const brk = [{
      id: 'b1', type: 'WAKOM1' as const, label: 'W', day: 'DAY' as const, startMin: 14, endMin: 19,
    }];
    const lots = autoPlaceLots([{ productCode: '2TR', count: 5 }], shift(brk));
    // 0,4,8,12 all fit (each lot is only 1 min wide, so 12-13 does not touch
    // the break at 14-19) — 1 column of gap (13) was banked before the break
    // starts. The next aligned slot, 16, truly overlaps, so the 5th lot
    // resumes at 21: gap-before(1) + gap-after(2, i.e. 19-20 empty) = 3.
    expect(lots.map((l) => l.startMin)).toEqual([0, 4, 8, 12, 21]);
  });
});
