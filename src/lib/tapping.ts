import type { PlanLot, ProductCode, FurnaceId } from '../domain/types';

export type TappingShape = 'square' | 'triangle' | 'circle';

export interface TappingGroup {
  id: string;
  sequenceNo: number;
  furnaceId: FurnaceId;
  shape: TappingShape;
  lots: PlanLot[];
  startMin: number;
  complete: boolean;
}

const FURNACE3_CODES: ProductCode[] = ['KAI', 'CRANK'];
const TR_CODES: ProductCode[] = ['2TR', '1TR'];

// Fixed furnace tapping cycle: F1 and F2 tap 2x in a row, F4 taps 1x, and F3
// taps 2x (split around F4) — repeats indefinitely.
const CYCLE_TEMPLATE: FurnaceId[] = [1, 1, 3, 4, 3, 2, 2];

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

function shapeFor(lots: PlanLot[]): TappingShape {
  if (lots.some((l) => l.productCode === 'CRANK')) return 'triangle';
  if (lots.some((l) => l.productCode === 'KAI')) return 'circle';
  return 'square';
}

/**
 * Walks the fixed 7-slot furnace cycle (F1,F1,F3,F4,F3,F2,F2, repeating),
 * pulling the next group of 3 lots for each slot from the queue that slot's
 * furnace normally serves. Furnace 3's two slots prefer KAI/CRANK (its
 * dedicated product) — once that queue runs dry, those same slots fall back
 * to TR, so furnace 3 keeps tapping 2x in the same cycle position instead of
 * sitting idle once KAI/CRANK production is done for the day.
 */
export function deriveTappingGroups(planLots: PlanLot[]): TappingGroup[] {
  const furnace3Queue = chunk(planLots.filter((l) => FURNACE3_CODES.includes(l.productCode)), 3);
  const trQueue = chunk(planLots.filter((l) => TR_CODES.includes(l.productCode)), 3);

  let f3i = 0;
  let ti = 0;
  const groups: Omit<TappingGroup, 'id' | 'sequenceNo'>[] = [];
  let cycleIdx = 0;

  while (f3i < furnace3Queue.length || ti < trQueue.length) {
    const slot = CYCLE_TEMPLATE[cycleIdx % CYCLE_TEMPLATE.length];
    cycleIdx += 1;

    let lots: PlanLot[] | undefined;
    if (slot === 3) {
      if (f3i < furnace3Queue.length) {
        lots = furnace3Queue[f3i];
        f3i += 1;
      } else if (ti < trQueue.length) {
        lots = trQueue[ti];
        ti += 1;
      }
    } else if (ti < trQueue.length) {
      lots = trQueue[ti];
      ti += 1;
    }

    if (lots) {
      groups.push({
        furnaceId: slot,
        shape: shapeFor(lots),
        lots,
        startMin: lots[0].startMin,
        complete: lots.length === 3,
      });
    }
  }

  return groups.map((g, i) => ({ ...g, id: `tap-${i + 1}`, sequenceNo: i + 1 }));
}

export type TappingStatus = 'PLAN' | 'ACTION';

/**
 * Mirrors deriveActual's clock-driven rule: a group moves to ACTION once its
 * last lot has "started" per the running clock, no manual confirmation.
 */
export function withTappingStatus(
  groups: TappingGroup[],
  nowMin: number,
): (TappingGroup & { status: TappingStatus })[] {
  return groups.map((g) => ({
    ...g,
    status: g.lots[g.lots.length - 1].startMin <= nowMin ? 'ACTION' : 'PLAN',
  }));
}
