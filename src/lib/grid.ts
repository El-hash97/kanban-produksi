import type { ShiftConfig } from '../domain/types';

export function hourRange(shift: ShiftConfig): number[] {
  const hours: number[] = [];
  for (let h = shift.startMin; h < shift.endMin; h += 60) hours.push(h);
  return hours;
}

/**
 * Map [startMin,endMin) onto a 60-column (1-minute) grid for the hour that
 * begins at hourStartMin. Returns 1-based CSS grid column + span, clipped to
 * the hour, or null if the segment does not intersect this hour.
 */
export function colSpan(
  startMin: number,
  endMin: number,
  hourStartMin: number,
): { col: number; span: number } | null {
  const hourEnd = hourStartMin + 60;
  const s = Math.max(startMin, hourStartMin);
  const e = Math.min(endMin, hourEnd);
  if (e <= s) return null;
  return { col: s - hourStartMin + 1, span: e - s };
}
