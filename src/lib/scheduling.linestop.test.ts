import { describe, it, expect } from 'vitest';
import { autoPlaceLots, applyLineStops, makeLineStop } from './scheduling';

const shift = { startMin: 420, endMin: 1140, pic: 'X', shiftNo: 1, tTimeSec: 48, breaks: [] };

describe('applyLineStops', () => {
  it('shifts lots that start at/after the line stop to after it ends', () => {
    const plan = autoPlaceLots([{ productCode: '2TR', count: 4 }], shift);
    // slots 420,425,430,435; stop 425-435 (10 min)
    const stop = makeLineStop(425, 435, 'F.Releasing LS Fault');
    const shifted = applyLineStops(plan, shift, [stop]);
    expect(shifted.map((l) => l.startMin)).toEqual([420, 435, 440, 445]);
  });

  it('flags moved lots as shifted and leaves earlier lots untouched', () => {
    const plan = autoPlaceLots([{ productCode: '2TR', count: 3 }], shift);
    const shifted = applyLineStops(plan, shift, [makeLineStop(425, 430, 'x')]);
    expect(shifted[0].shifted).toBe(false);
    expect(shifted[1].shifted).toBe(true);
  });

  it('applies multiple line stops cumulatively', () => {
    const plan = autoPlaceLots([{ productCode: '2TR', count: 3 }], shift);
    const stops = [makeLineStop(425, 430, 'a'), makeLineStop(435, 445, 'b')];
    const shifted = applyLineStops(plan, shift, stops);
    // lot1 420-425; lot2 pushed past 425-430 -> 430; lot3 would be 435 but
    // 435-445 blocked -> 445
    expect(shifted.map((l) => l.startMin)).toEqual([420, 430, 445]);
  });

  it('is a no-op when the stop sits after all lots', () => {
    const plan = autoPlaceLots([{ productCode: '2TR', count: 2 }], shift);
    const shifted = applyLineStops(plan, shift, [makeLineStop(600, 610, 'late')]);
    expect(shifted.map((l) => l.startMin)).toEqual([420, 425]);
    expect(shifted.every((l) => l.shifted === false)).toBe(true);
  });
});
