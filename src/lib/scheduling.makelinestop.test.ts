import { describe, it, expect } from 'vitest';
import { makeLineStop } from './scheduling';

describe('makeLineStop', () => {
  it('defaults counterMeasure to empty string and category to AV when omitted', () => {
    const stop = makeLineStop(430, 440, 'Sand jam');
    expect(stop.counterMeasure).toBe('');
    expect(stop.category).toBe('AV');
  });

  it('stores counterMeasure and category when given', () => {
    const stop = makeLineStop(430, 440, 'Sand jam', 'Bersihkan hopper', 'PE');
    expect(stop.counterMeasure).toBe('Bersihkan hopper');
    expect(stop.category).toBe('PE');
  });
});
