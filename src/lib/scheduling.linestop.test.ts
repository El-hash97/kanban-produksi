import { describe, it, expect } from 'vitest';
import { autoPlaceLots, applyLineStops, makeLineStop } from './scheduling';

const shift = {
  startMin: 420, endMin: 1140, pic: 'X', shiftNo: 1, tTimeSec: 48, breaks: [], productionStartMin: 420, group: 'RED' as const,
};

describe('applyLineStops', () => {
  it('shifts lots that start at/after the line stop to after it ends', () => {
    const plan = autoPlaceLots([{ productCode: '2TR', count: 4 }], shift);
    // slots (240s = 4min pitch): 420,424,428,432; stop 424-434 covers slots
    // 424,428,432 — resume at the next aligned slot, 436 (not snapped to the
    // stop's own end minute, 434), keeping the pitch rhythm unbroken.
    const stop = makeLineStop(424, 434, 'F.Releasing LS Fault');
    const shifted = applyLineStops(plan, shift, [stop]);
    expect(shifted.map((l) => l.startMin)).toEqual([420, 436, 440, 444]);
  });

  it('flags moved lots as shifted and leaves earlier lots untouched', () => {
    const plan = autoPlaceLots([{ productCode: '2TR', count: 3 }], shift);
    const shifted = applyLineStops(plan, shift, [makeLineStop(424, 428, 'x')]);
    expect(shifted[0].shifted).toBe(false);
    expect(shifted[1].shifted).toBe(true);
  });

  it('applies multiple line stops cumulatively', () => {
    const plan = autoPlaceLots([{ productCode: '2TR', count: 3 }], shift);
    const stops = [makeLineStop(424, 428, 'a'), makeLineStop(432, 442, 'b')];
    const shifted = applyLineStops(plan, shift, stops);
    // lot1 420-421; lot2 pushed past 424-428 -> 428 (exactly one pitch cycle,
    // still aligned); lot3's aligned slot 432 is blocked by 432-442, and so
    // is 436 and 440 — first clear aligned slot is 444, not the stop's own
    // end minute (442).
    expect(shifted.map((l) => l.startMin)).toEqual([420, 428, 444]);
  });

  it('is a no-op when the stop sits after all lots', () => {
    const plan = autoPlaceLots([{ productCode: '2TR', count: 2 }], shift);
    const shifted = applyLineStops(plan, shift, [makeLineStop(600, 610, 'late')]);
    expect(shifted.map((l) => l.startMin)).toEqual([420, 424]);
    expect(shifted.every((l) => l.shifted === false)).toBe(true);
  });
});
