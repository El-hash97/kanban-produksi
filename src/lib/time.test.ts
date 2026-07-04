import { describe, it, expect } from 'vitest';
import { toMinOfDay, toHHmm, hourStart, rangesOverlap, nowMinOfDay } from './time';

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
});
