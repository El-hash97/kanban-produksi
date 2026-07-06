import { useMemo, type CSSProperties } from 'react';
import { useBoardStore } from '../store/boardStore';
import { useNowMin } from '../hooks/useNowMin';
import {
  deriveTappingGroups, withTappingStatus, applyFurnaceOverrides, nextFurnaceId,
} from '../lib/tapping';
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

const SHAPE_SIZE = 'w-6 h-6';

function TappingShapeIcon({ group, onClick }: { group: TappingGroup; onClick?: () => void }) {
  const color = furnaceColor(group.furnaceId);
  const numberEl = <span className="font-bold text-black text-[10px] leading-none">{group.furnaceId}</span>;

  let shapeClass = `${SHAPE_SIZE} flex items-center justify-center`;
  const style: CSSProperties = { backgroundColor: color };
  if (group.shape === 'circle') {
    shapeClass += ' rounded-full';
  } else if (group.shape === 'triangle') {
    shapeClass = `${SHAPE_SIZE} flex items-end justify-center pb-1`;
    style.clipPath = 'polygon(50% 0%, 0% 100%, 100% 100%)';
  }

  if (onClick) {
    return (
      <button
        type="button"
        className={`${shapeClass} cursor-pointer hover:brightness-110`}
        style={style}
        title="Klik untuk ubah furnace"
        onClick={onClick}
      >
        {numberEl}
      </button>
    );
  }
  return <div className={shapeClass} style={style}>{numberEl}</div>;
}

// Small table-cell-like block: tapping sequence number on top, furnace
// shape below it, lot summary caption underneath. Each row (PLAN/ACTION)
// renders this independently, so both need their own caption.
function TappingToken({ group, onClickFurnace }: { group: TappingGroup; onClickFurnace?: () => void }) {
  return (
    <div className="flex flex-col items-center w-11 border border-cyan-500/30">
      <div className="w-full text-center text-[9px] font-bold text-cyan-300 bg-cyan-900/30 border-b border-cyan-500/30">
        {group.sequenceNo}
      </div>
      <div className="flex justify-center py-1">
        <TappingShapeIcon group={group} onClick={onClickFurnace} />
      </div>
      <div className="text-[8px] text-gray-400 text-center leading-tight px-0.5 pb-0.5">
        {summarizeLots(group.lots)}
      </div>
      {!group.complete && <div className="text-[8px] text-yellow-400 pb-0.5">!lengkap</div>}
    </div>
  );
}

export default function TappingPanel() {
  const planLots = useBoardStore((s) => s.planLots);
  const shiftConfig = useBoardStore((s) => s.shiftConfig);
  const furnaceOverrides = useBoardStore((s) => s.furnaceOverrides);
  const setTappingFurnaceOverride = useBoardStore((s) => s.setTappingFurnaceOverride);
  const nowMin = useNowMin(shiftConfig);

  const groups = useMemo(() => {
    const derived = applyFurnaceOverrides(deriveTappingGroups(planLots), furnaceOverrides);
    return withTappingStatus(derived, nowMin);
  }, [planLots, furnaceOverrides, nowMin]);
  const action = groups.filter((g) => g.status === 'ACTION');

  return (
    <div className="text-white text-xs">
      <div className="bg-cyan-900/40 px-2 py-1 font-bold text-green-400">URUTAN TAPPING FURNACE</div>
      {groups.length === 0 ? (
        <div className="p-2 text-gray-500">Belum ada tapping.</div>
      ) : (
        // Two-column grid: a fixed-width label column (PLAN/ACTION) on the
        // left with a guide-line border, and a flex-wrap token area on the
        // right that wraps onto new lines instead of scrolling sideways.
        <div className="p-2 grid grid-cols-[3.5rem_1fr] gap-x-2">
          <div className="flex items-center font-bold text-green-400 border-r border-cyan-500/30 pr-2">PLAN</div>
          <div className="flex flex-wrap gap-2 pb-2 border-b border-cyan-500/30">
            {groups.map((g) => (
              <TappingToken
                key={g.id}
                group={g}
                onClickFurnace={() => setTappingFurnaceOverride(g.id, nextFurnaceId(g.furnaceId))}
              />
            ))}
          </div>

          <div className="flex items-center font-bold text-green-400 border-r border-cyan-500/30 pr-2 pt-2">ACTION</div>
          <div className="flex flex-wrap gap-2 pt-2">
            {action.length === 0
              ? <div className="text-gray-500">Belum ada yang berjalan.</div>
              : action.map((g) => <TappingToken key={g.id} group={g} />)}
          </div>
        </div>
      )}
    </div>
  );
}
