import { describe, it, expect } from 'vitest';
import { summarize } from './summary';
import { DEFAULT_PRODUCTS } from '../domain/defaults';
import type { PlanLot } from '../domain/types';

const lot = (code: PlanLot['productCode'], no: number, start: number): PlanLot => ({
  id: `${code}-${no}`, productCode: code, lotNo: no, startMin: start, endMin: start + 5, shifted: false,
});

describe('summarize', () => {
  it('counts plan and actual per product with a TOTAL row', () => {
    const plan = [lot('2TR', 1, 420), lot('2TR', 2, 425), lot('1TR', 1, 430)];
    const actual = [lot('2TR', 1, 420)];
    const rows = summarize(DEFAULT_PRODUCTS, plan, actual);
    const twoTr = rows.find((r) => r.code === '2TR')!;
    expect([twoTr.plan, twoTr.actual]).toEqual([2, 1]);
    const total = rows.find((r) => r.code === 'TOTAL')!;
    expect([total.plan, total.actual]).toEqual([3, 1]);
  });
});
