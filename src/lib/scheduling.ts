import type {
  LineStop, LotRequest, PlanLot, ProductCode, Range, ShiftConfig,
} from '../domain/types';
import { LOT_MIN } from '../domain/defaults';
import { rangesOverlap } from './time';

let idCounter = 0;
function makeId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

/**
 * Advance `cursor` forward until a LOT_MIN slot starting there overlaps no block.
 * Blocks may overlap each other; we loop until the position is stable.
 */
function nextFreeStart(cursor: number, blocks: Range[]): number {
  let pos = cursor;
  let moved = true;
  while (moved) {
    moved = false;
    for (const b of blocks) {
      if (rangesOverlap({ startMin: pos, endMin: pos + LOT_MIN }, b)) {
        pos = b.endMin;
        moved = true;
      }
    }
  }
  return pos;
}

/**
 * Place an ordered list of lots into 5-minute slots from shift start,
 * stepping over `blocks` (breaks + line stops). Order is preserved; lots
 * that spill past shift end are still returned (never dropped).
 */
export function placeSequence(
  order: { productCode: ProductCode; lotNo: number }[],
  shift: ShiftConfig,
  blocks: Range[],
): PlanLot[] {
  const result: PlanLot[] = [];
  let cursor = shift.startMin;
  for (const item of order) {
    cursor = nextFreeStart(cursor, blocks);
    result.push({
      id: makeId('lot'),
      productCode: item.productCode,
      lotNo: item.lotNo,
      startMin: cursor,
      endMin: cursor + LOT_MIN,
      shifted: false,
    });
    cursor += LOT_MIN;
  }
  return result;
}

export function autoPlaceLots(requests: LotRequest[], shift: ShiftConfig): PlanLot[] {
  const order: { productCode: ProductCode; lotNo: number }[] = [];
  const counters: Record<string, number> = {};
  for (const req of requests) {
    for (let i = 0; i < req.count; i += 1) {
      counters[req.productCode] = (counters[req.productCode] ?? 0) + 1;
      order.push({ productCode: req.productCode, lotNo: counters[req.productCode] });
    }
  }
  return placeSequence(order, shift, shift.breaks);
}

/**
 * Actual mirrors Plan up to the current clock (PRD §3.3): every plan lot
 * whose slot has started is considered produced. No manual confirmation.
 */
export function deriveActual(planLots: PlanLot[], nowMin: number): PlanLot[] {
  return planLots.filter((l) => l.startMin <= nowMin);
}

export function makeLineStop(startMin: number, endMin: number, keterangan: string): LineStop {
  return {
    id: makeId('ls'),
    startMin,
    endMin,
    durationMin: Math.max(0, endMin - startMin),
    keterangan,
  };
}

/**
 * Re-place existing lots (in their current order) around breaks + every line
 * stop. A lot whose start minute changes is flagged `shifted` (PRD §3.4).
 */
export function applyLineStops(
  planLots: PlanLot[],
  shift: ShiftConfig,
  lineStops: LineStop[],
): PlanLot[] {
  const order = planLots.map((l) => ({ productCode: l.productCode, lotNo: l.lotNo }));
  const blocks: Range[] = [
    ...shift.breaks.map((b) => ({ startMin: b.startMin, endMin: b.endMin })),
    ...lineStops.map((s) => ({ startMin: s.startMin, endMin: s.endMin })),
  ];
  const replaced = placeSequence(order, shift, blocks);
  return replaced.map((lot, i) => ({
    ...lot,
    id: planLots[i].id,
    shifted: lot.startMin !== planLots[i].startMin,
  }));
}

export type { LineStop };
