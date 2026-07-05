import dayjs from 'dayjs';
import type { Range, ShiftConfig } from '../domain/types';

export function toMinOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
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
