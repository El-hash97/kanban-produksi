import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SHIFT, DEFAULT_PRODUCTS, DEFAULT_FURNACES, buildShiftConfig, ensureDandori, migrateShift,
  pitchSecFromTakt, TAKT_TO_PITCH_MULTIPLIER, LOT_DURATION_MIN,
} from './defaults';
import type { ShiftConfig } from './types';

describe('defaults', () => {
  it('default shift takt time is 48 seconds, editable via Input Planning', () => {
    expect(DEFAULT_SHIFT.tTimeSec).toBe(48);
  });

  it('lot generation pitch is derived from takt time (x5), 240 seconds at the default 48s takt', () => {
    expect(TAKT_TO_PITCH_MULTIPLIER).toBe(5);
    expect(pitchSecFromTakt(48)).toBe(240);
    expect(pitchSecFromTakt(60)).toBe(300);
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

  it('has exactly four furnaces with unique ids 1-4 and unique colors', () => {
    expect(DEFAULT_FURNACES.map((f) => f.id).sort()).toEqual([1, 2, 3, 4]);
    expect(new Set(DEFAULT_FURNACES.map((f) => f.color)).size).toBe(4);
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

  describe('day-type break defaults', () => {
    it('generates Dandori for both DAY and FRIDAY', () => {
      const shift = buildShiftConfig(1);
      for (const day of ['DAY', 'FRIDAY'] as const) {
        expect(shift.breaks.some((b) => b.type === 'DANDORI' && b.day === day)).toBe(true);
      }
    });

    it('makes the Friday main Istirahat longer than the weekday one', () => {
      const shift = buildShiftConfig(1);
      const dayMain = shift.breaks.find((b) => b.day === 'DAY' && b.type === 'ISTIRAHAT')!;
      const friMain = shift.breaks.find((b) => b.day === 'FRIDAY' && b.type === 'ISTIRAHAT')!;
      expect(friMain.endMin - friMain.startMin).toBeGreaterThan(dayMain.endMin - dayMain.startMin);
    });

    it('migrateShift tags legacy breaks DAY and synthesizes a FRIDAY set', () => {
      const legacy = {
        ...buildShiftConfig(1),
        breaks: [{
          id: 'old-1', type: 'WAKOM1' as const, label: 'W', startMin: 600, endMin: 610,
        }],
      } as unknown as ShiftConfig;
      const migrated = migrateShift(legacy);
      expect(migrated.breaks.every((b) => b.day === 'DAY' || b.day === 'FRIDAY')).toBe(true);
      expect(migrated.breaks.some((b) => b.day === 'DAY')).toBe(true);
      expect(migrated.breaks.some((b) => b.day === 'FRIDAY')).toBe(true);
      expect(migrated.breaks.some((b) => b.type === 'DANDORI' && b.day === 'FRIDAY')).toBe(true);
    });
  });

  describe('input parameter defaults', () => {
    it('relabels KAI as CAMS without changing its product code', () => {
      const kai = DEFAULT_PRODUCTS.find((p) => p.code === 'KAI')!;
      expect(kai.label).toBe('CAMS');
    });

    it('carries reference sand/mold figures per product', () => {
      const byCode = Object.fromEntries(DEFAULT_PRODUCTS.map((p) => [p.code, p]));
      expect(byCode['2TR'].sandMeasTimeMin).toBe(9.5);
      expect(byCode['2TR'].moldPerBatch).toBe(7);
      expect(byCode['1TR'].sandMeasTimeMin).toBe(9.5);
      expect(byCode['1TR'].moldPerBatch).toBe(7);
      expect(byCode.KAI.sandMeasTimeMin).toBe(11.5);
      expect(byCode.KAI.moldPerBatch).toBe(5);
      expect(byCode.CRANK.sandMeasTimeMin).toBe(11.5);
      expect(byCode.CRANK.moldPerBatch).toBe(5);
    });

    it('defaults a new shift\'s team group to RED', () => {
      const shift = buildShiftConfig(1);
      expect(shift.group).toBe('RED');
    });

    it('migrateShift backfills a missing group as RED on legacy state', () => {
      const legacy = { ...buildShiftConfig(1) } as Partial<ShiftConfig>;
      delete legacy.group;
      const migrated = migrateShift(legacy as ShiftConfig);
      expect(migrated.group).toBe('RED');
    });
  });
});
