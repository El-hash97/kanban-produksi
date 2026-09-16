import type { ShiftConfig } from '../domain/types';

/**
 * Rows to display for the board, beyond the shift's own [startMin,endMin).
 * Shift 1 gets an extra lead-in row at 06:00 (before its 07:00 start);
 * shift 2 gets an extra trailing row at its end, up to 08:00 — these are
 * display-only padding rows (no lots/breaks are ever scheduled into them),
 * requested for handover visibility at each shift's own edge.
 */
export function hourRange(shift: ShiftConfig): number[] {
  const hours: number[] = [];
  for (let h = shift.startMin; h < shift.endMin; h += 60) hours.push(h);
  if (shift.shiftNo === 1) hours.unshift(shift.startMin - 60);
  if (shift.shiftNo === 2) hours.push(shift.endMin);
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
