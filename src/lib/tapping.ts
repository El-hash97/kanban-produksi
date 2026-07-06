import type { PlanLot, ProductCode, FurnaceId } from '../domain/types';

export interface TappingGroup {
  id: string;
  sequenceNo: number;
  furnaceId: FurnaceId;
  lots: PlanLot[];
  startMin: number;
  complete: boolean;
}

const FURNACE3_CODES: ProductCode[] = ['KAI', 'CRANK'];
const ROTATION_CODES: ProductCode[] = ['2TR', '1TR'];
const ROTATION_CYCLE: FurnaceId[] = [1, 1, 4, 2, 2];

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

type UnnumberedGroup = Omit<TappingGroup, 'id' | 'sequenceNo'>;

function groupsFor(lots: PlanLot[], furnaceIdFor: (groupIndex: number) => FurnaceId): UnnumberedGroup[] {
  return chunk(lots, 3).map((group, i) => ({
    furnaceId: furnaceIdFor(i),
    lots: group,
    startMin: group[0].startMin,
    complete: group.length === 3,
  }));
}

/**
 * Derives tapping groups from the plan's existing lot order (chronological):
 * KAI/CRANK lots always chunk to furnace 3; 2TR/1TR lots chunk and rotate
 * through the fixed F1,F1,F4,F2,F2 cycle. The two tracks are independent —
 * furnace-3 assignment never depends on rotation position, and vice versa —
 * then merged back into one chronological, globally-numbered sequence.
 */
export function deriveTappingGroups(planLots: PlanLot[]): TappingGroup[] {
  const furnace3Lots = planLots.filter((l) => FURNACE3_CODES.includes(l.productCode));
  const rotationLots = planLots.filter((l) => ROTATION_CODES.includes(l.productCode));

  const furnace3Groups = groupsFor(furnace3Lots, () => 3);
  const rotationGroups = groupsFor(
    rotationLots,
    (i) => ROTATION_CYCLE[i % ROTATION_CYCLE.length],
  );

  return [...furnace3Groups, ...rotationGroups]
    .sort((a, b) => a.startMin - b.startMin)
    .map((g, i) => ({ ...g, id: `tap-${i + 1}`, sequenceNo: i + 1 }));
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
