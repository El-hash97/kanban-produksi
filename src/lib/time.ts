import dayjs from 'dayjs';
import type { Range } from '../domain/types';

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
