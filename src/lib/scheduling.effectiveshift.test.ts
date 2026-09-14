import { describe, it, expect } from 'vitest';
import { effectiveShift, autoPlaceLots } from './scheduling';
import type { Break, ShiftConfig } from '../domain/types';

const brk = (day: 'DAY' | 'FRIDAY', startMin: number, endMin: number): Break => ({
  id: `b-${day}-${startMin}`, type: 'CUSTOM', label: 'x', day, startMin, endMin,
});

const shift: ShiftConfig = {
  startMin: 420, endMin: 1140, pic: 'X', shiftNo: 1, tTimeSec: 48, productionStartMin: 420, group: 'RED',
  breaks: [brk('DAY', 700, 745), brk('FRIDAY', 700, 780)],
};

describe('effectiveShift', () => {
  it('keeps only the requested day\'s breaks', () => {
    expect(effectiveShift(shift, 'DAY').breaks).toEqual([shift.breaks[0]]);
    expect(effectiveShift(shift, 'FRIDAY').breaks).toEqual([shift.breaks[1]]);
  });

  it('leaves every other shift field untouched', () => {
    const eff = effectiveShift(shift, 'DAY');
    expect([eff.startMin, eff.endMin, eff.productionStartMin]).toEqual([420, 1140, 420]);
  });

  it('drives autoPlaceLots so FRIDAY\'s longer break pushes lots differently', () => {
    // A lot placed right at the break start on each day, pitch-aligned from
    // productionStartMin=700. DAY break is 700-745 (not a multiple of the
    // 4-min pitch from 700), so the first clear aligned slot is 748; FRIDAY's
    // break 700-780 ends exactly on a pitch multiple, so resumes right at 780.
    const near = { ...shift, productionStartMin: 700 };
    const dayStart = autoPlaceLots([{ productCode: '2TR', count: 1 }], effectiveShift(near, 'DAY'))[0].startMin;
    const friStart = autoPlaceLots([{ productCode: '2TR', count: 1 }], effectiveShift(near, 'FRIDAY'))[0].startMin;
    expect(dayStart).toBe(748);
    expect(friStart).toBe(780);
  });
});
