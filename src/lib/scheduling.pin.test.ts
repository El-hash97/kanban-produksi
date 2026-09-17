import { describe, it, expect } from 'vitest';
import {
  autoPlaceLots, reflowFrom, applyLineStops, makeLineStop,
} from './scheduling';
import type { ShiftConfig } from '../domain/types';

// Reproduces the reported bug: manually Alt+drag-ing a lot to a real-time
// slot (reflowFrom) used to be silently discarded the next time *any*
// unrelated line stop/break edit ran applyLineStops, because that function
// re-placed every lot from scratch on the standard pitch, with no memory of
// which lots had been manually anchored. A dragged lot is now flagged
// `pinned`, and both reflowFrom and applyLineStops treat a pinned lot as an
// immovable anchor — only the *other* (unpinned) lots keep cascading
// normally around blocks.
const shift: ShiftConfig = {
  startMin: 420, endMin: 1140, pic: 'X', shiftNo: 1, tTimeSec: 48, breaks: [], productionStartMin: 420, group: 'RED',
};

describe('manual drag pins a lot against later reflows', () => {
  it('reflowFrom marks the dragged lot pinned, but not the untouched lots before it', () => {
    const lots = autoPlaceLots([{ productCode: '2TR', count: 3 }], shift);
    const dragged = reflowFrom(lots, shift, [], 1, 500);
    expect(dragged[0].pinned).toBeFalsy();
    expect(dragged[1].pinned).toBe(true);
    expect(dragged[1].startMin).toBe(500);
  });

  it('a later line stop no longer reverts a manually-dragged lot back to its pitch position', () => {
    const lots = autoPlaceLots([{ productCode: '2TR', count: 3 }], shift); // 420, 424, 428
    const dragged = reflowFrom(lots, shift, [], 1, 500); // drag lot 2 to 500

    const reflowed = applyLineStops(dragged, shift, [makeLineStop(600, 610, 'unrelated')]);
    expect(reflowed.map((l) => l.startMin)).toEqual([420, 500, 504]);
    expect(reflowed[1].pinned).toBe(true);
  });

  it('applyLineStops never flags a pinned lot shifted, even though it differs from its natural pitch slot', () => {
    const lots = autoPlaceLots([{ productCode: '2TR', count: 2 }], shift); // 420, 424
    const dragged = reflowFrom(lots, shift, [], 1, 500); // pitch would say 424, operator wants 500

    const reflowed = applyLineStops(dragged, shift, []);
    expect(reflowed[1].startMin).toBe(500);
    expect(reflowed[1].shifted).toBe(false);
  });

  it('lots after a pinned lot still cascade normally around a line stop', () => {
    const lots = autoPlaceLots([{ productCode: '2TR', count: 4 }], shift); // 420, 424, 428, 432
    const dragged = reflowFrom(lots, shift, [], 1, 500); // lot2 pinned@500, lot3@504, lot4@508

    const reflowed = applyLineStops(dragged, shift, [makeLineStop(505, 515, 'x')]);
    // lot2 stays pinned at 500; lot3's natural 504 (504-505) still clears the
    // 505-515 stop, but lot4's natural 508 falls inside it and resumes after.
    expect(reflowed.map((l) => l.startMin)).toEqual([420, 500, 504, 518]);
  });

  it('an earlier lot dragged later does not disturb an already-pinned lot further down the list', () => {
    const lots = autoPlaceLots([{ productCode: '2TR', count: 4 }], shift); // 420, 424, 428, 432
    const oncePinned = reflowFrom(lots, shift, [], 2, 700); // pin lot3 @700

    const draggedAgain = reflowFrom(oncePinned, shift, [], 0, 450); // now drag lot1 too
    expect(draggedAgain[0]).toMatchObject({ startMin: 450, pinned: true });
    expect(draggedAgain[2]).toMatchObject({ startMin: 700, pinned: true }); // untouched
  });
});
