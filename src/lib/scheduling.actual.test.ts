import { describe, it, expect } from 'vitest';
import { autoPlaceLots, deriveActual } from './scheduling';

const shift = { startMin: 420, endMin: 1140, pic: 'X', shiftNo: 1, tTimeSec: 48, breaks: [] };

describe('deriveActual', () => {
  it('returns only lots that have started by nowMin', () => {
    const plan = autoPlaceLots([{ productCode: '2TR', count: 4 }], shift);
    // slots: 420,425,430,435. now=431 -> 420,425,430 started
    const act = deriveActual(plan, 431);
    expect(act.map((l) => l.startMin)).toEqual([420, 425, 430]);
  });

  it('returns empty before the shift begins', () => {
    const plan = autoPlaceLots([{ productCode: '2TR', count: 2 }], shift);
    expect(deriveActual(plan, 400)).toEqual([]);
  });

  it('mirrors every plan lot once now is past all of them', () => {
    const plan = autoPlaceLots([{ productCode: '2TR', count: 2 }], shift);
    expect(deriveActual(plan, 1000)).toHaveLength(2);
  });
});
