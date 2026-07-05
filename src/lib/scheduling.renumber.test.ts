import { describe, it, expect } from 'vitest';
import { autoPlaceLots, renumberByProduct } from './scheduling';

const shift = {
  startMin: 420, endMin: 1140, pic: 'X', shiftNo: 1, tTimeSec: 48, breaks: [], productionStartMin: 420,
};

describe('renumberByProduct', () => {
  it('restarts lotNo at 1 for each productCode, in order', () => {
    const plan = autoPlaceLots([{ productCode: '2TR', count: 4 }], shift);
    const retagged = plan.map((l, i) => (i === 1 ? { ...l, productCode: 'KAI' as const } : l));
    const renumbered = renumberByProduct(retagged);
    expect(renumbered.map((l) => `${l.productCode}#${l.lotNo}`)).toEqual([
      '2TR#1', 'KAI#1', '2TR#2', '2TR#3',
    ]);
  });

  it('is a no-op when all lots are already numbered sequentially', () => {
    const plan = autoPlaceLots([{ productCode: '2TR', count: 3 }], shift);
    const renumbered = renumberByProduct(plan);
    expect(renumbered.map((l) => l.lotNo)).toEqual([1, 2, 3]);
  });
});
