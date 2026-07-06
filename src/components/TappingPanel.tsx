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

function furnaceLabel(furnaceId: number): string {
  return DEFAULT_FURNACES.find((f) => f.id === furnaceId)?.label ?? `Furnace ${furnaceId}`;
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

function TappingCard({ group }: { group: TappingGroup & { status: TappingStatus } }) {
  return (
    <div
      className="border-l-4 bg-white/5 px-2 py-1"
      style={{ borderLeftColor: furnaceColor(group.furnaceId) }}
    >
      <div className="flex items-center justify-between font-bold">
        <span>Tap #{group.sequenceNo}</span>
        <span style={{ color: furnaceColor(group.furnaceId) }}>{furnaceLabel(group.furnaceId)}</span>
      </div>
      <div className="text-gray-300">{summarizeLots(group.lots)}</div>
      {!group.complete && <div className="text-yellow-400">belum lengkap</div>}
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
      <div className="grid grid-cols-2 gap-2 p-2">
        <div>
          <div className="font-bold text-green-400 mb-1">PLAN</div>
          <div className="space-y-1">
            {plan.length === 0 && <div className="text-gray-500">Belum ada tapping.</div>}
            {plan.map((g) => <TappingCard key={g.id} group={g} />)}
          </div>
        </div>
        <div>
          <div className="font-bold text-green-400 mb-1">ACTION</div>
          <div className="space-y-1">
            {action.length === 0 && <div className="text-gray-500">Belum ada tapping berjalan.</div>}
            {action.map((g) => <TappingCard key={g.id} group={g} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
