import { describe, it, expect } from 'vitest';
import {
  toMinOfDay, toHHmm, hourStart, rangesOverlap, nowMinOfDay, nowMinForShift, toShiftMin,
} from './time';
import type { ShiftConfig } from '../domain/types';

describe('time', () => {
  it('converts HH:mm to minute-of-day', () => {
    expect(toMinOfDay('07:00')).toBe(420);
    expect(toMinOfDay('19:00')).toBe(1140);
    expect(toMinOfDay('08:45')).toBe(525);
  });

  it('converts minute-of-day back to zero-padded HH:mm', () => {
    expect(toHHmm(420)).toBe('07:00');
    expect(toHHmm(525)).toBe('08:45');
    expect(toHHmm(605)).toBe('10:05');
  });

  it('floors a minute to the start of its hour', () => {
    expect(hourStart(525)).toBe(480);
    expect(hourStart(420)).toBe(420);
  });

  it('detects overlapping ranges (touching does not count)', () => {
    expect(rangesOverlap({ startMin: 10, endMin: 20 }, { startMin: 15, endMin: 25 })).toBe(true);
    expect(rangesOverlap({ startMin: 10, endMin: 20 }, { startMin: 20, endMin: 30 })).toBe(false);
    expect(rangesOverlap({ startMin: 10, endMin: 20 }, { startMin: 25, endMin: 30 })).toBe(false);
  });

  it('reads minute-of-day from a Date', () => {
    expect(nowMinOfDay(new Date(2026, 6, 5, 10, 24))).toBe(624);
  });

  describe('nowMinForShift', () => {
    const dayShift: ShiftConfig = {
      startMin: 420, endMin: 1140, pic: 'X', shiftNo: 1, tTimeSec: 48, breaks: [], productionStartMin: 420,
    };
    const nightShift: ShiftConfig = {
      startMin: 1140, endMin: 1860, pic: 'X', shiftNo: 2, tTimeSec: 48, breaks: [], productionStartMin: 1140,
    };

    it('is a no-op for a same-day shift', () => {
      expect(nowMinForShift(dayShift, new Date(2026, 6, 5, 10, 24))).toBe(624);
    });

    it('leaves the evening portion of an overnight shift untouched', () => {
      expect(nowMinForShift(nightShift, new Date(2026, 6, 5, 20, 0))).toBe(1200);
    });

    it('adds 1440 for the past-midnight tail of an overnight shift', () => {
      // 02:00 the next morning is really 26:00 on the shift's own timeline
      expect(nowMinForShift(nightShift, new Date(2026, 6, 6, 2, 0))).toBe(1560);
    });

    it('toShiftMin: a clock time typed into a time picker lands correctly for shift 2', () => {
      // 22:00 is still "today", within the evening half of the shift
      expect(toShiftMin(nightShift, toMinOfDay('22:00'))).toBe(1320);
      // 02:00 is the overnight tail -> 26:00 on the shift's own timeline
      expect(toShiftMin(nightShift, toMinOfDay('02:00'))).toBe(1560);
    });

    it('toShiftMin is a no-op for a same-day shift', () => {
      expect(toShiftMin(dayShift, toMinOfDay('08:45'))).toBe(525);
    });
  });
});
