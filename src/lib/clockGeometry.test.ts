import { describe, expect, it } from 'vitest';
import {
  hourFromPoint, minuteFromPoint, pointFor, hourHandPoint, minuteHandPoint,
  HOUR_OUTER_R, HOUR_INNER_R, MINUTE_R,
} from './clockGeometry';

describe('clockGeometry', () => {
  it('round-trips every outer-ring position (hours 00-11)', () => {
    for (let h = 0; h < 12; h += 1) {
      const p = pointFor(h, 12, HOUR_OUTER_R);
      expect(hourFromPoint(p.x, p.y)).toBe(h);
    }
  });

  it('round-trips every inner-ring position (hours 12-23)', () => {
    for (let h = 12; h < 24; h += 1) {
      const p = pointFor(h - 12, 12, HOUR_INNER_R);
      expect(hourFromPoint(p.x, p.y)).toBe(h);
    }
  });

  it('round-trips every minute position (00-59)', () => {
    for (let m = 0; m < 60; m += 1) {
      const p = pointFor(m, 60, MINUTE_R);
      expect(minuteFromPoint(p.x, p.y)).toBe(m);
    }
  });

  it('hourHandPoint matches the outer ring for AM-side hours and inner ring for PM-side hours', () => {
    expect(hourHandPoint(0)).toEqual(pointFor(0, 12, HOUR_OUTER_R));
    expect(hourHandPoint(11)).toEqual(pointFor(11, 12, HOUR_OUTER_R));
    expect(hourHandPoint(12)).toEqual(pointFor(0, 12, HOUR_INNER_R));
    expect(hourHandPoint(23)).toEqual(pointFor(11, 12, HOUR_INNER_R));
  });

  it('minuteHandPoint matches pointFor on the minute ring', () => {
    expect(minuteHandPoint(37)).toEqual(pointFor(37, 60, MINUTE_R));
  });

  it('never returns an out-of-range hour or minute, even at angle wraparound near 12 o\'clock', () => {
    const justPastTop = pointFor(-0.01, 12, HOUR_OUTER_R); // just counter-clockwise of index 0
    const h = hourFromPoint(justPastTop.x, justPastTop.y);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(24);

    const justPastTopMinute = pointFor(-0.01, 60, MINUTE_R);
    const m = minuteFromPoint(justPastTopMinute.x, justPastTopMinute.y);
    expect(m).toBeGreaterThanOrEqual(0);
    expect(m).toBeLessThan(60);
  });
});
