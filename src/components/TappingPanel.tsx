import { useMemo } from 'react';
import { useBoardStore } from '../store/boardStore';
import { useNowMin } from '../hooks/useNowMin';
import { deriveTappingGroups, withTappingStatus } from '../lib/tapping';
import type { TappingGroup } from '../lib/tapping';
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

// Full token: shape + caption (tap number, lot summary). Used for the PLAN
// row, which always shows every tap regardless of status.
function TappingToken({ group }: { group: TappingGroup }) {
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

  return (
    <div className="text-white text-xs">
      <div className="bg-cyan-900/40 px-2 py-1 font-bold text-green-400">URUTAN TAPPING FURNACE</div>
      {groups.length === 0 ? (
        <div className="p-2 text-gray-500">Belum ada tapping.</div>
      ) : (
        <div className="p-2">
          <div className="flex gap-4 text-green-400 font-bold mb-2">
            <span>▲ PLAN</span>
            <span>▼ ACTION</span>
          </div>
          {/* flex-wrap (not overflow-x-auto): when a row of taps doesn't fit
              the screen width, the rest wraps onto the next line below
              instead of requiring a horizontal scroll. */}
          <div className="flex flex-wrap gap-3">
            {groups.map((g) => (
              <div key={g.id} className="flex flex-col items-center gap-1 w-16">
                <TappingToken group={g} />
                <div className={`${SHAPE_SIZE} border-t border-cyan-500/30 pt-1 flex items-center justify-center`}>
                  {g.status === 'ACTION' && <TappingShapeIcon group={g} />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
