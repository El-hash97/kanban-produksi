import { describe, it, expect } from 'vitest';
import { deriveTappingGroups, withTappingStatus } from './tapping';
import type { PlanLot } from '../domain/types';

let idCounter = 0;
function makeLot(productCode: PlanLot['productCode'], lotNo: number, startMin: number): PlanLot {
  idCounter += 1;
  return {
    id: `lot-${idCounter}`, productCode, lotNo, startMin, endMin: startMin + 1, shifted: false,
  };
}

// Builds `count` lots of `productCode` on a 4-minute pitch starting at `startMin`.
function makeLots(productCode: PlanLot['productCode'], count: number, startMin: number): PlanLot[] {
  const lots: PlanLot[] = [];
  let t = startMin;
  for (let i = 0; i < count; i += 1) {
    lots.push(makeLot(productCode, i + 1, t));
    t += 4;
  }
  return lots;
}

describe('deriveTappingGroups', () => {
  it('returns nothing for an empty plan', () => {
    expect(deriveTappingGroups([])).toEqual([]);
  });

  it('walks the fixed F1,F1,F3,F4,F3,F2,F2 cycle, F3 slots pulling KAI/CRANK', () => {
    const lots = [
      ...makeLots('2TR', 15, 400), // fills F1,F1,F4,F2,F2 (5 slots x 3 lots)
      ...makeLots('CRANK', 3, 500),
      ...makeLots('KAI', 3, 504),
    ];
    const groups = deriveTappingGroups(lots);
    expect(groups).toHaveLength(7);
    expect(groups.map((g) => g.furnaceId)).toEqual([1, 1, 3, 4, 3, 2, 2]);
    expect(groups.map((g) => g.shape)).toEqual([
      'square', 'square', 'triangle', 'square', 'circle', 'square', 'square',
    ]);
  });

  it('falls back to TR (still furnace 3, 2x in the cycle) once KAI/CRANK runs out mid-pass', () => {
    const lots = [
      ...makeLots('CRANK', 3, 400), // only 1 furnace-3 group available
      ...makeLots('2TR', 18, 500), // enough TR to fill every other slot, including the 2nd F3 slot
    ];
    const groups = deriveTappingGroups(lots);
    expect(groups).toHaveLength(7);
    expect(groups.map((g) => g.furnaceId)).toEqual([1, 1, 3, 4, 3, 2, 2]);
    // 1st F3 slot (index 2) got the real CRANK group; 2nd F3 slot (index 4) fell back to TR.
    expect(groups[2].shape).toBe('triangle');
    expect(groups[2].lots.map((l) => l.productCode)).toEqual(['CRANK', 'CRANK', 'CRANK']);
    expect(groups[4].shape).toBe('square');
    expect(groups[4].lots.every((l) => l.productCode === '2TR')).toBe(true);
  });

  it('once KAI/CRANK is fully done before a new pass starts, furnace 3 taps 2x back-to-back (no F4 gap)', () => {
    const lots = [
      ...makeLots('CRANK', 3, 400), // 1 furnace-3 group, consumed entirely within the first pass
      ...makeLots('2TR', 18, 500), // fills the rest of the first pass (F1,F1,F4,[F3 fallback],F2,F2)
      ...makeLots('1TR', 21, 700), // enough for a full second pass under the merged cycle
    ];
    const groups = deriveTappingGroups(lots);
    expect(groups).toHaveLength(14);
    expect(groups.map((g) => g.furnaceId)).toEqual([
      1, 1, 3, 4, 3, 2, 2, // 1st pass: split cycle, KAI/CRANK still had 1 group left
      1, 1, 4, 2, 2, 3, 3, // 2nd pass: merged cycle, furnace 3 back-to-back at the end
    ]);
    // The two 2nd-pass furnace-3 taps (indices 12 and 13) are adjacent and both TR.
    expect(groups[12].furnaceId).toBe(3);
    expect(groups[13].furnaceId).toBe(3);
    expect(groups[12].shape).toBe('square');
    expect(groups[13].shape).toBe('square');
  });

  it('allows 2TR and 1TR to mix within one tapping group', () => {
    const lots = [
      makeLot('2TR', 1, 400), makeLot('1TR', 1, 404), makeLot('2TR', 2, 408),
    ];
    const groups = deriveTappingGroups(lots);
    expect(groups).toHaveLength(1);
    expect(groups[0].furnaceId).toBe(1);
    expect(groups[0].shape).toBe('square');
    expect(groups[0].lots.map((l) => l.productCode)).toEqual(['2TR', '1TR', '2TR']);
  });

  it('never mixes KAI/CRANK lots with 2TR/1TR lots in the same group', () => {
    const lots = [
      ...makeLots('CRANK', 3, 400),
      ...makeLots('2TR', 18, 500),
    ];
    const groups = deriveTappingGroups(lots);
    expect(groups.some((g) => {
      const codes = new Set(g.lots.map((l) => l.productCode));
      return (codes.has('CRANK') || codes.has('KAI')) && (codes.has('2TR') || codes.has('1TR'));
    })).toBe(false);
  });

  it('flags a trailing remainder group (not a multiple of 3) as incomplete', () => {
    const lots = [makeLot('2TR', 1, 400), makeLot('2TR', 2, 404)];
    const groups = deriveTappingGroups(lots);
    expect(groups).toHaveLength(1);
    expect(groups[0].complete).toBe(false);
    expect(groups[0].lots).toHaveLength(2);
  });

  it('numbers sequenceNo in cycle-consumption order starting at 1', () => {
    const lots = [
      ...makeLots('2TR', 15, 400),
      ...makeLots('CRANK', 3, 500),
      ...makeLots('KAI', 3, 504),
    ];
    const groups = deriveTappingGroups(lots);
    expect(groups.map((g) => g.sequenceNo)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('withTappingStatus', () => {
  it('marks a group ACTION once its last lot\'s startMin has passed', () => {
    const lots = [
      makeLot('2TR', 1, 400), makeLot('2TR', 2, 404), makeLot('2TR', 3, 408),
    ];
    const groups = deriveTappingGroups(lots);
    expect(withTappingStatus(groups, 407)[0].status).toBe('PLAN');
    expect(withTappingStatus(groups, 408)[0].status).toBe('ACTION');
    expect(withTappingStatus(groups, 500)[0].status).toBe('ACTION');
  });

  it('evaluates an incomplete trailing group from its last available lot', () => {
    const lots = [makeLot('2TR', 1, 400), makeLot('2TR', 2, 404)];
    const groups = deriveTappingGroups(lots);
    expect(withTappingStatus(groups, 403)[0].status).toBe('PLAN');
    expect(withTappingStatus(groups, 404)[0].status).toBe('ACTION');
  });
});
