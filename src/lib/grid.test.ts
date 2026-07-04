import { describe, it, expect } from 'vitest';
import { hourRange, colSpan } from './grid';

const shift = { startMin: 420, endMin: 1140, pic: '', shiftNo: 1, tTimeSec: 48, breaks: [] };

describe('grid', () => {
  it('lists one hour-start per row from 07:00 to 18:00', () => {
    const hours = hourRange(shift);
    expect(hours[0]).toBe(420);
    expect(hours[hours.length - 1]).toBe(1080); // 18:00
    expect(hours).toHaveLength(12);
  });

  it('maps a lot to a 1-based column and span within its hour', () => {
    expect(colSpan(425, 430, 420)).toEqual({ col: 6, span: 5 });
    expect(colSpan(420, 425, 420)).toEqual({ col: 1, span: 5 });
  });

  it('clips a segment to the hour it belongs to', () => {
    // segment 475-490 vs hour 420: starts at minute 55, ends past the hour -> col 56 span 5
    expect(colSpan(475, 490, 420)).toEqual({ col: 56, span: 5 });
    // segment 470-485 vs hour 420 (ends 480): col 51 span 10
    expect(colSpan(470, 485, 420)).toEqual({ col: 51, span: 10 });
    // segment entirely in the next hour -> null
    expect(colSpan(485, 490, 420)).toBeNull();
  });
});
