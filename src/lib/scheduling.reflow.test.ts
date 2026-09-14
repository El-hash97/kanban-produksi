import { describe, it, expect } from 'vitest';
import { autoPlaceLots, reflowFrom } from './scheduling';
import type { ShiftConfig } from '../domain/types';

const shift = (breaks: ShiftConfig['breaks'] = []): ShiftConfig => ({
  startMin: 420, endMin: 1140, pic: 'X', shiftNo: 1, tTimeSec: 48, breaks, productionStartMin: 420, group: 'RED',
});

describe('reflowFrom', () => {
  it('leaves lots before fromIndex untouched and re-places the rest from overrideStartMin', () => {
    const lots = autoPlaceLots([{ productCode: '2TR', count: 4 }], shift());
    // original starts: 420, 424, 428, 432
    const dragged = reflowFrom(lots, shift(), [], 1, 450);
    expect(dragged[0].startMin).toBe(420); // untouched
    expect(dragged.slice(1).map((l) => l.startMin)).toEqual([450, 454, 458]);
  });

  it('keeps ids stable so cumulative index/product/lotNo survive the drag', () => {
    const lots = autoPlaceLots([{ productCode: '2TR', count: 3 }], shift());
    const dragged = reflowFrom(lots, shift(), [], 1, 500);
    expect(dragged.map((l) => l.id)).toEqual(lots.map((l) => l.id));
    expect(dragged.map((l) => l.lotNo)).toEqual(lots.map((l) => l.lotNo));
  });

  it('flags subsequent lots as shifted when their time actually changed', () => {
    const lots = autoPlaceLots([{ productCode: '2TR', count: 3 }], shift());
    const dragged = reflowFrom(lots, shift(), [], 0, 500);
    expect(dragged.every((l) => l.shifted)).toBe(true);
  });

  it('still routes the cascaded lots around breaks', () => {
    const brk = [{
      id: 'b1', type: 'WAKOM1' as const, label: 'W', day: 'DAY' as const, startMin: 460, endMin: 470,
    }];
    const lots = autoPlaceLots([{ productCode: '2TR', count: 3 }], shift(brk));
    const dragged = reflowFrom(lots, shift(brk), [], 1, 465);
    // dropped at 465 (inside the 460-470 break) skips past it, then keeps pitch
    expect(dragged.slice(1).map((l) => l.startMin)).toEqual([475, 479]);
  });
});
