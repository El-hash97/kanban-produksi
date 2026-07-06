import { useMemo } from 'react';
import { useBoardStore } from '../store/boardStore';
import { useNowMin } from '../hooks/useNowMin';
import { deriveTappingGroups, withTappingStatus } from '../lib/tapping';
import type { TappingGroup, TappingStatus } from '../lib/tapping';
import { DEFAULT_FURNACES } from '../domain/defaults';
import type { PlanLot } from '../domain/types';

function furnaceColor(furnaceId: number): string {
  return DEFAULT_FURNACES.find((f) => f.id === furnaceId)?.color ?? '#888';
}

// e.g. "2TR Lot 5-6, 1TR Lot 1" — one clause per product code present in the group.
function summarizeLots(lots: PlanLot[]): string {
  const byProduct = new Map<string, number[]>();
  for (const l of lots) {
    const arr = byProduct.get(l.productCode) ?? [];
    arr.push(l.lotNo);
    byProduct.set(l.productCode, arr);
  }
  return [...byProduct.entries()]
    .map(([code, nos]) => {
      const min = Math.min(...nos);
      const max = Math.max(...nos);
      return min === max ? `${code} Lot ${min}` : `${code} Lot ${min}-${max}`;
    })
    .join(', ');
}

const SHAPE_SIZE = 'w-10 h-10';

function TappingShapeIcon({ group }: { group: TappingGroup }) {
  const color = furnaceColor(group.furnaceId);
  const numberEl = <span className="font-bold text-black text-sm">{group.furnaceId}</span>;

  if (group.shape === 'circle') {
    return (
      <div className={`${SHAPE_SIZE} rounded-full flex items-center justify-center`} style={{ backgroundColor: color }}>
        {numberEl}
      </div>
    );
  }
  if (group.shape === 'triangle') {
    return (
      <div
        className={`${SHAPE_SIZE} flex items-end justify-center pb-1.5`}
        style={{ backgroundColor: color, clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }}
      >
        {numberEl}
      </div>
    );
  }
  return (
    <div className={`${SHAPE_SIZE} flex items-center justify-center`} style={{ backgroundColor: color }}>
      {numberEl}
    </div>
  );
}

function TappingToken({ group }: { group: TappingGroup & { status: TappingStatus } }) {
  return (
    <div className="flex flex-col items-center gap-0.5 w-16">
      <TappingShapeIcon group={group} />
      <div className="text-[9px] text-gray-400 text-center leading-tight">
        Tap #{group.sequenceNo}
        <br />
        {summarizeLots(group.lots)}
      </div>
      {!group.complete && <div className="text-[9px] text-yellow-400">belum lengkap</div>}
    </div>
  );
}

export default function TappingPanel() {
  const planLots = useBoardStore((s) => s.planLots);
  const shiftConfig = useBoardStore((s) => s.shiftConfig);
  const nowMin = useNowMin(shiftConfig);

  const groups = useMemo(
    () => withTappingStatus(deriveTappingGroups(planLots), nowMin),
    [planLots, nowMin],
  );
  const plan = groups.filter((g) => g.status === 'PLAN');
  const action = groups.filter((g) => g.status === 'ACTION');

  return (
    <div className="text-white text-xs">
      <div className="bg-cyan-900/40 px-2 py-1 font-bold text-green-400">URUTAN TAPPING FURNACE</div>
      <div className="p-2 space-y-3">
        <div>
          <div className="font-bold text-green-400 mb-1">PLAN</div>
          <div className="flex flex-wrap gap-3">
            {plan.length === 0 && <div className="text-gray-500">Belum ada tapping.</div>}
            {plan.map((g) => <TappingToken key={g.id} group={g} />)}
          </div>
        </div>
        <div className="border-t border-cyan-500/30 pt-2">
          <div className="font-bold text-green-400 mb-1">ACTION</div>
          <div className="flex flex-wrap gap-3">
            {action.length === 0 && <div className="text-gray-500">Belum ada tapping berjalan.</div>}
            {action.map((g) => <TappingToken key={g.id} group={g} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
