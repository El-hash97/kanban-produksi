import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SHIFT, DEFAULT_PRODUCTS, buildShiftConfig, ensureDandori, LOT_PITCH_SEC, LOT_DURATION_MIN,
} from './defaults';

describe('defaults', () => {
  it('default shift takt time is 48 seconds (a separate reference figure)', () => {
    expect(DEFAULT_SHIFT.tTimeSec).toBe(48);
  });

  it('lot generation pitch is a fixed 240 seconds (4 minutes)', () => {
    expect(LOT_PITCH_SEC).toBe(240);
  });

  it('a lot occupies 1 minute of that pitch', () => {
    expect(LOT_DURATION_MIN).toBe(1);
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

  describe('buildShiftConfig', () => {
    it('shift 1 runs 07:00 to 19:00', () => {
      const shift = buildShiftConfig(1);
      expect(shift.startMin).toBe(420);
      expect(shift.endMin).toBe(1140);
    });

    it('shift 2 runs 19:00 to 07:00 the next day, expressed continuously', () => {
      const shift = buildShiftConfig(2);
      expect(shift.startMin).toBe(1140);
      expect(shift.endMin).toBe(1860); // 1860 % 1440 = 420 = 07:00
    });

    it('shifts break offsets along with the shift start, keeping them in-window', () => {
      const shift = buildShiftConfig(2);
      for (const b of shift.breaks) {
        expect(b.startMin).toBeGreaterThanOrEqual(shift.startMin);
        expect(b.endMin).toBeLessThanOrEqual(shift.endMin);
      }
    });

    it('defaults productionStartMin to right after the default Dandori window', () => {
      const shift = buildShiftConfig(1);
      expect(shift.productionStartMin).toBe(shift.startMin + 10);
    });
  });

  describe('ensureDandori', () => {
    it('is a no-op when Dandori and productionStartMin are already present', () => {
      const shift = buildShiftConfig(2);
      expect(ensureDandori(shift)).toBe(shift);
    });

    it('re-adds a missing Dandori at the shift\'s own start', () => {
      const shift = buildShiftConfig(2);
      const withoutDandori = { ...shift, breaks: shift.breaks.filter((b) => b.type !== 'DANDORI') };
      const repaired = ensureDandori(withoutDandori);
      const dandori = repaired.breaks.find((b) => b.type === 'DANDORI');
      expect(dandori).toBeDefined();
      expect(dandori!.startMin).toBe(shift.startMin);
      expect(dandori!.endMin).toBe(shift.startMin + 10);
    });

    it('backfills a missing productionStartMin (state saved before that field existed)', () => {
      const shift = buildShiftConfig(2);
      const legacy = { ...shift } as Partial<typeof shift>;
      delete legacy.productionStartMin;
      const repaired = ensureDandori(legacy as typeof shift);
      expect(repaired.productionStartMin).toBe(shift.startMin + 10);
    });
  });
});
