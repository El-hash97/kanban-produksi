import type {
  Break, DayType, LineStop, LineStopCategory, LotRequest, PlanLot, ProductCode, Range, ShiftConfig,
} from '../domain/types';
import { pitchSecFromTakt, LOT_DURATION_MIN } from '../domain/defaults';
import { rangesOverlap } from './time';

let idCounter = 0;
function makeId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

/**
 * Advance `cursor` forward until a LOT_DURATION_MIN slot starting there
 * overlaps no block. On overlap, `pos` jumps past the block by the block's own
 * duration (`b.endMin - b.startMin`). Blocks may overlap each other; we loop
 * until the position is stable. Used for the lot itself; the gap between lots
 * is walked by advanceFree below.
 */
function nextFreeStart(cursor: number, blocks: Range[]): number {
  let pos = cursor;
  let moved = true;
  while (moved) {
    moved = false;
    for (const b of blocks) {
      if (rangesOverlap({ startMin: pos, endMin: pos + LOT_DURATION_MIN }, b)) {
        pos += b.endMin - b.startMin;
        moved = true;
      }
    }
  }
  return pos;
}

/**
 * Walk `minutes` of *free* (unblocked) time forward from `pos`, skipping over
 * any block met on the way. This is what makes the gap between lots always
 * equal (pitch - LOT_DURATION_MIN) worth of empty columns regardless of where
 * a break / line stop falls: a block lying entirely inside the empty gap
 * (touching no lot slot) still consumes its duration, and gap-before +
 * gap-after a block always sum to the standard gap (2 before → 1 after, etc.).
 */
function advanceFree(pos: number, minutes: number, blocks: Range[]): number {
  let cur = pos;
  let remaining = minutes;
  while (remaining > 0) {
    const inside = blocks.find((b) => b.startMin <= cur && cur < b.endMin);
    if (inside) { cur = inside.endMin; continue; }
    const nextBlock = Math.min(...blocks.filter((b) => b.startMin > cur).map((b) => b.startMin));
    const step = Math.min(remaining, nextBlock - cur);
    cur += step;
    remaining -= step;
  }
  return cur;
}

/**
 * Place an ordered list of lots on a pitch derived from the shift's own Takt
 * Time (pitchSecFromTakt(shift.tTimeSec), 240s/4min at the default 48s takt),
 * starting from the shift's configured production start time
 * (shift.productionStartMin, not necessarily shift.startMin), stepping over
 * `blocks` (breaks + line stops) — so it still pushes past Dandori if that
 * runs later than the configured start. Each lot occupies only
 * LOT_DURATION_MIN of that pitch, leaving a gap before the next lot. Order is
 * preserved; lots that spill past shift end are still returned (never
 * dropped).
 */
export function placeSequence(
  order: { productCode: ProductCode; lotNo: number }[],
  shift: ShiftConfig,
  blocks: Range[],
  startCursor: number = shift.productionStartMin,
): PlanLot[] {
  const pitchMin = pitchSecFromTakt(shift.tTimeSec) / 60;
  const result: PlanLot[] = [];
  let cursor = startCursor;
  for (const item of order) {
    cursor = nextFreeStart(cursor, blocks);
    result.push({
      id: makeId('lot'),
      productCode: item.productCode,
      lotNo: item.lotNo,
      startMin: cursor,
      endMin: cursor + LOT_DURATION_MIN,
      shifted: false,
    });
    cursor = advanceFree(cursor, pitchMin, blocks);
  }
  return result;
}

export function effectiveShift(shift: ShiftConfig, day: DayType): ShiftConfig {
  return { ...shift, breaks: shift.breaks.filter((b) => b.day === day) };
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

/**
 * Renumber lots in place (order unchanged) so lotNo restarts at 1 for each
 * productCode, in the order lots appear. Used after retagging a single lot's
 * model so numbering stays "lot 1 per model".
 */
export function renumberByProduct(planLots: PlanLot[]): PlanLot[] {
  const counters: Partial<Record<ProductCode, number>> = {};
  return planLots.map((l) => {
    const next = (counters[l.productCode] ?? 0) + 1;
    counters[l.productCode] = next;
    return { ...l, lotNo: next };
  });
}

export function makeBreak(
  label: string, startMin: number, endMin: number, day: DayType = 'DAY',
): Break {
  return {
    id: makeId('brk'), type: 'CUSTOM', label, startMin, endMin, day,
  };
}

export function makeLineStop(
  startMin: number,
  endMin: number,
  keterangan: string,
  counterMeasure = '',
  category: LineStopCategory = 'AV',
): LineStop {
  return {
    id: makeId('ls'),
    startMin,
    endMin,
    durationMin: Math.max(0, endMin - startMin),
    keterangan,
    counterMeasure,
    category,
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

/**
 * Re-place lots from `fromIndex` onward, starting the first of them at
 * `overrideStartMin` instead of wherever it currently sits — used when the
 * operator manually drags a plan lot to a new time (line-stop-without-a-
 * record, or a manual correction). Lots before `fromIndex` are untouched;
 * lots from `fromIndex` on cascade with the normal pitch/break/line-stop
 * rules, same as applyLineStops, just anchored at a custom cursor.
 */
export function reflowFrom(
  planLots: PlanLot[],
  shift: ShiftConfig,
  lineStops: LineStop[],
  fromIndex: number,
  overrideStartMin: number,
): PlanLot[] {
  const before = planLots.slice(0, fromIndex);
  const toReplace = planLots.slice(fromIndex);
  const order = toReplace.map((l) => ({ productCode: l.productCode, lotNo: l.lotNo }));
  const blocks: Range[] = [
    ...shift.breaks.map((b) => ({ startMin: b.startMin, endMin: b.endMin })),
    ...lineStops.map((s) => ({ startMin: s.startMin, endMin: s.endMin })),
  ];
  const replaced = placeSequence(order, shift, blocks, overrideStartMin);
  const after = replaced.map((lot, i) => ({
    ...lot,
    id: toReplace[i].id,
    shifted: lot.startMin !== toReplace[i].startMin,
  }));
  return [...before, ...after];
}

export type { LineStop };
