import { describe, it, expect } from 'vitest';
import { LOT_MIN, DEFAULT_SHIFT, DEFAULT_PRODUCTS } from './defaults';

describe('defaults', () => {
  it('lot is 5 minutes', () => {
    expect(LOT_MIN).toBe(5);
  });

  it('shift runs 07:00 to 19:00', () => {
    expect(DEFAULT_SHIFT.startMin).toBe(420);
    expect(DEFAULT_SHIFT.endMin).toBe(1140);
  });

  it('all default breaks fall inside the shift window', () => {
    for (const b of DEFAULT_SHIFT.breaks) {
      expect(b.startMin).toBeGreaterThanOrEqual(DEFAULT_SHIFT.startMin);
      expect(b.endMin).toBeLessThanOrEqual(DEFAULT_SHIFT.endMin);
      expect(b.endMin).toBeGreaterThan(b.startMin);
    }
  });

  it('has exactly the four products with unique codes', () => {
    const codes = DEFAULT_PRODUCTS.map((p) => p.code);
    expect(new Set(codes)).toEqual(new Set(['2TR', '1TR', 'KAI', 'CRANK']));
  });
});
