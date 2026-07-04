import type { PlanLot, Product } from '../domain/types';

export interface SummaryRow { code: string; label: string; plan: number; actual: number; }

export function summarize(
  products: Product[], planLots: PlanLot[], actualLots: PlanLot[],
): SummaryRow[] {
  const rows: SummaryRow[] = products.map((p) => ({
    code: p.code,
    label: p.label,
    plan: planLots.filter((l) => l.productCode === p.code).length,
    actual: actualLots.filter((l) => l.productCode === p.code).length,
  }));
  rows.push({
    code: 'TOTAL',
    label: 'TOTAL',
    plan: planLots.length,
    actual: actualLots.length,
  });
  return rows;
}
