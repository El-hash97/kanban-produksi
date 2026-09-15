/**
 * Pure geometry for the 24-hour clock-face picker (TimeSelect). Kept apart
 * from the SVG component so the angle math can be unit-tested without a real
 * browser's SVG CTM (jsdom doesn't implement getScreenCTM/createSVGPoint).
 */
export const CENTER = 100;
export const HOUR_OUTER_R = 78; // hours 0-11
export const HOUR_INNER_R = 50; // hours 12-23
export const HOUR_RING_SPLIT_R = 64; // pointer distance that decides which ring was hit
export const MINUTE_R = 78;

export function pointFor(index: number, count: number, r: number): { x: number; y: number } {
  const angle = (index / count) * 2 * Math.PI - Math.PI / 2;
  return { x: CENTER + r * Math.cos(angle), y: CENTER + r * Math.sin(angle) };
}

/** Nearest of `count` evenly-spaced positions around the circle for a point
 * at (x, y), with index 0 at 12 o'clock and increasing clockwise. */
export function indexFromAngle(x: number, y: number, count: number): number {
  let angle = Math.atan2(y - CENTER, x - CENTER) + Math.PI / 2;
  if (angle < 0) angle += 2 * Math.PI;
  return Math.round((angle / (2 * Math.PI)) * count) % count;
}

/** Outer ring (further than the split radius) reads 00-11, inner ring reads
 * 12-23, so every hour in a 24h day is reachable on one dial. */
export function hourFromPoint(x: number, y: number): number {
  const dist = Math.hypot(x - CENTER, y - CENTER);
  const ringOffset = dist > HOUR_RING_SPLIT_R ? 0 : 12;
  return indexFromAngle(x, y, 12) + ringOffset;
}

export function minuteFromPoint(x: number, y: number): number {
  return indexFromAngle(x, y, 60);
}

export function hourHandPoint(hour: number): { x: number; y: number } {
  return pointFor(hour % 12, 12, hour < 12 ? HOUR_OUTER_R : HOUR_INNER_R);
}

export function minuteHandPoint(minute: number): { x: number; y: number } {
  return pointFor(minute, 60, MINUTE_R);
}
