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

describe('deriveTappingGroups', () => {
  it('returns nothing for an empty plan', () => {
    expect(deriveTappingGroups([])).toEqual([]);
  });

  it('groups KAI/CRANK lots into furnace 3, 3 lots per tap', () => {
    const lots = [
      makeLot('CRANK', 1, 400), makeLot('CRANK', 2, 404), makeLot('CRANK', 3, 408),
      makeLot('KAI', 1, 412), makeLot('KAI', 2, 416), makeLot('KAI', 3, 420),
    ];
    const groups = deriveTappingGroups(lots);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.furnaceId === 3)).toBe(true);
    expect(groups[0].lots.map((l) => l.productCode)).toEqual(['CRANK', 'CRANK', 'CRANK']);
    expect(groups[1].lots.map((l) => l.productCode)).toEqual(['KAI', 'KAI', 'KAI']);
  });

  it('rotates 2TR/1TR groups through F1,F1,F4,F2,F2 and repeats', () => {
    const lots: PlanLot[] = [];
    let t = 400;
    for (let i = 0; i < 15; i += 1) {
      lots.push(makeLot('2TR', i + 1, t));
      t += 4;
    }
    const groups = deriveTappingGroups(lots);
    expect(groups).toHaveLength(5);
    expect(groups.map((g) => g.furnaceId)).toEqual([1, 1, 4, 2, 2]);
  });

  it('allows 2TR and 1TR to mix within one tapping group', () => {
    const lots = [
      makeLot('2TR', 1, 400), makeLot('1TR', 1, 404), makeLot('2TR', 2, 408),
    ];
    const groups = deriveTappingGroups(lots);
    expect(groups).toHaveLength(1);
    expect(groups[0].furnaceId).toBe(1);
    expect(groups[0].lots.map((l) => l.productCode)).toEqual(['2TR', '1TR', '2TR']);
  });

  it('never mixes KAI/CRANK lots with 2TR/1TR lots in the same group', () => {
    const lots = [
      makeLot('2TR', 1, 400), makeLot('2TR', 2, 404), makeLot('CRANK', 1, 408),
    ];
    const groups = deriveTappingGroups(lots);
    expect(groups.some((g) => {
      const codes = new Set(g.lots.map((l) => l.productCode));
      return codes.has('CRANK') && (codes.has('2TR') || codes.has('1TR'));
    })).toBe(false);
  });

  it('flags a trailing remainder group (not a multiple of 3) as incomplete', () => {
    const lots = [makeLot('2TR', 1, 400), makeLot('2TR', 2, 404)];
    const groups = deriveTappingGroups(lots);
    expect(groups).toHaveLength(1);
    expect(groups[0].complete).toBe(false);
    expect(groups[0].lots).toHaveLength(2);
  });

  it('numbers sequenceNo chronologically across both furnace-3 and rotation groups combined', () => {
    const lots = [
      makeLot('2TR', 1, 400), makeLot('2TR', 2, 404), makeLot('2TR', 3, 408), // F1 tap, starts 400
      makeLot('CRANK', 1, 412), makeLot('CRANK', 2, 416), makeLot('CRANK', 3, 420), // F3 tap, starts 412
    ];
    const groups = deriveTappingGroups(lots);
    expect(groups.map((g) => g.sequenceNo)).toEqual([1, 2]);
    expect(groups.map((g) => g.furnaceId)).toEqual([1, 3]);
    expect(groups.map((g) => g.startMin)).toEqual([400, 412]);
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
