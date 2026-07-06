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

// While furnace 3 still has KAI/CRANK queued, its two taps sit split around
// furnace 4 (matches the real tapping order for that product).
const CYCLE_WITH_F3_SPECIAL: FurnaceId[] = [1, 1, 3, 4, 3, 2, 2];
// Once furnace 3's KAI/CRANK queue is empty, it falls back to TR like any
// other furnace — so its two taps move back-to-back (no F4 gap), matching
// the same "2x in a row" rule F1/F2 already follow.
const CYCLE_F3_MERGED: FurnaceId[] = [1, 1, 4, 2, 2, 3, 3];

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
 * Walks the furnace cycle one 7-slot pass at a time, pulling the next group
 * of 3 lots for each slot from the queue that slot's furnace normally
 * serves. Each pass picks its template based on whether furnace 3's
 * dedicated KAI/CRANK queue still has anything left *at the start of that
 * pass*: while it does, the pass uses the split cycle (a KAI/CRANK tap may
 * still land in either of furnace 3's two slots); once it's empty, every
 * following pass uses the merged cycle, where furnace 3's two TR taps sit
 * back-to-back like furnace 1/2 instead of split around furnace 4.
 */
export function deriveTappingGroups(planLots: PlanLot[]): TappingGroup[] {
  const furnace3Queue = chunk(planLots.filter((l) => FURNACE3_CODES.includes(l.productCode)), 3);
  const trQueue = chunk(planLots.filter((l) => TR_CODES.includes(l.productCode)), 3);

  let f3i = 0;
  let ti = 0;
  const groups: Omit<TappingGroup, 'id' | 'sequenceNo'>[] = [];

  while (f3i < furnace3Queue.length || ti < trQueue.length) {
    const template = f3i < furnace3Queue.length ? CYCLE_WITH_F3_SPECIAL : CYCLE_F3_MERGED;

    for (const slot of template) {
      if (f3i >= furnace3Queue.length && ti >= trQueue.length) break;

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
  }

  // `id` is derived from the group's first lot (not its position), so it
  // stays stable across recomputation — needed for manual furnace overrides
  // to keep pointing at "the same" tap even as other lots are added/shifted.
  return groups.map((g, i) => ({ ...g, id: `tap-${g.lots[0].id}`, sequenceNo: i + 1 }));
}

/** Cycles a furnace id 1 -> 2 -> 3 -> 4 -> 1, used for manual reassignment. */
export function nextFurnaceId(current: FurnaceId): FurnaceId {
  return ((current % 4) + 1) as FurnaceId;
}

/**
 * Applies manual furnace reassignments (keyed by TappingGroup.id) on top of
 * the auto-derived groups. Only furnaceId changes — the underlying lots and
 * shape (which reflects what product is actually being produced) stay as
 * computed, since a manual override just says "this tap runs on a different
 * furnace than suggested," not "this tap produces something else."
 */
export function applyFurnaceOverrides(
  groups: TappingGroup[],
  overrides: Record<string, FurnaceId>,
): TappingGroup[] {
  return groups.map((g) => (
    overrides[g.id] !== undefined ? { ...g, furnaceId: overrides[g.id] } : g
  ));
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
