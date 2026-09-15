import dayjs from 'dayjs';
import type { DayType, Range, ShiftConfig } from '../domain/types';

export function toMinOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Parses free-typed clock input for the manual-entry alternative to the
 * clock-face picker (TimeSelect). Accepts "HH:MM", "H:MM", bare digits like
 * "1430"/"930"/"14" (no colon needed on a numeric keypad), tolerates stray
 * whitespace, and returns null for anything that isn't a valid 00:00-23:59
 * reading rather than guessing.
 */
export function parseFlexibleTime(raw: string): number | null {
  const cleaned = raw.trim();
  let h: number;
  let m: number;
  if (cleaned.includes(':')) {
    const parts = cleaned.split(':');
    if (parts.length !== 2 || !/^\d{1,2}$/.test(parts[0]) || !/^\d{1,2}$/.test(parts[1])) return null;
    h = Number(parts[0]);
    m = Number(parts[1]);
  } else if (/^\d{3,4}$/.test(cleaned)) {
    const digits = cleaned.padStart(4, '0');
    h = Number(digits.slice(0, 2));
    m = Number(digits.slice(2));
  } else if (/^\d{1,2}$/.test(cleaned)) {
    h = Number(cleaned);
    m = 0;
  } else {
    return null;
  }
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

export function toHHmm(min: number): string {
  const clamped = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function hourStart(min: number): number {
  return Math.floor(min / 60) * 60;
}

export function rangesOverlap(a: Range, b: Range): boolean {
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

export function nowMinOfDay(d: Date = new Date()): number {
  const dj = dayjs(d);
  return dj.hour() * 60 + dj.minute();
}

/**
 * Maps a wall-clock minute-of-day (0-1439) onto the shift's own timeline.
 * For a shift that spans past midnight (endMin > 1440, e.g. shift 2,
 * 19:00-07:00), clock times before the shift's end-of-day wrap belong to the
 * "next day" tail of the shift and need +1440 to land in [startMin, endMin).
 */
export function toShiftMin(shift: ShiftConfig, clockMin: number): number {
  if (shift.endMin > 1440) {
    const tailEnd = shift.endMin - 1440;
    if (clockMin < tailEnd) return clockMin + 1440;
  }
  return clockMin;
}

export function nowMinForShift(shift: ShiftConfig, d: Date = new Date()): number {
  return toShiftMin(shift, nowMinOfDay(d));
}

export function todayDayType(d: Date = new Date()): DayType {
  return d.getDay() === 5 ? 'FRIDAY' : 'DAY';
}
