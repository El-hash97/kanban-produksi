import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useBoardStore } from '../store/boardStore';
import { deriveActual, effectiveShift } from '../lib/scheduling';
import { useNowMin } from '../hooks/useNowMin';
import { colSpan, hourRange } from '../lib/grid';
import { toHHmm } from '../lib/time';
import { LOT_DURATION_MIN } from '../domain/defaults';
import type { Break, LineStop, PlanLot, Product } from '../domain/types';

const MINUTE_HEADERS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

function colorFor(products: Product[], code: string): string {
  return products.find((p) => p.code === code)?.color ?? '#64748b';
}

function LotBoxes({
  lots, hour, products, row, selectable, onDragStart, onDragEnter, selectedIds, showCumulative,
  movingId,
}: {
  lots: PlanLot[]; hour: number; products: Product[]; row: number;
  selectable?: boolean;
  onDragStart?: (index: number, e: ReactMouseEvent) => void;
  onDragEnter?: (index: number) => void;
  selectedIds?: Set<string>;
  // Shows a small black-background badge above the lot number with this
  // lot's overall position across every model combined (planLots is already
  // in chronological order, so index+1 is exactly that count) — PLN only.
  showCumulative?: boolean;
  // The lot currently being Alt-dragged to a new time — dimmed at its old
  // spot while a preview shows where it will land.
  movingId?: string;
}) {
  return (
    <>
      {lots.map((lot, index) => {
        const cs = colSpan(lot.startMin, lot.endMin, hour);
        if (!cs) return null;
        const selected = selectedIds?.has(lot.id);
        return (
          <div
            key={lot.id}
            className={`flex flex-col rounded-sm m-px overflow-hidden select-none ${selectable ? 'cursor-pointer hover:ring-2 hover:ring-white' : ''} ${selected ? 'ring-2 ring-yellow-300' : ''} ${movingId === lot.id ? 'opacity-30' : ''}`}
            style={{
              gridColumn: `${cs.col} / span ${cs.span}`,
              gridRow: row,
              outline: lot.shifted ? '1px solid #f87171' : 'none',
            }}
            title={`${lot.productCode} Lot ${lot.lotNo} @ ${toHHmm(lot.startMin)}${selectable ? ' — klik/drag beberapa lot untuk ubah model, Alt+drag geser waktu' : ''}`}
            onMouseDown={onDragStart ? (e) => { e.preventDefault(); onDragStart(index, e); } : undefined}
            onMouseEnter={onDragEnter ? () => onDragEnter(index) : undefined}
          >
            {showCumulative && (
              <div className="bg-black text-white text-[7px] leading-none text-center shrink-0 py-px">
                {index + 1}
              </div>
            )}
            <div
              className="flex-1 flex items-center justify-center text-[9px] font-bold text-black"
              style={{ backgroundColor: colorFor(products, lot.productCode) }}
            >
              {lot.lotNo}
            </div>
          </div>
        );
      })}
    </>
  );
}

function Overlays({
  breaks, lineStops, hour,
}: { breaks: Break[]; lineStops: LineStop[]; hour: number }) {
  return (
    <>
      {breaks.map((b, i) => {
        const cs = colSpan(b.startMin, b.endMin, hour);
        if (!cs) return null;
        return (
          <div
            key={`b${i}`}
            className="flex items-center justify-center text-[9px] text-cyan-100 bg-blue-600/40 border border-blue-400/50 overflow-hidden whitespace-nowrap"
            style={{ gridColumn: `${cs.col} / span ${cs.span}`, gridRow: '1 / span 2' }}
          >
            {b.label}
          </div>
        );
      })}
      {lineStops.map((s) => {
        const cs = colSpan(s.startMin, s.endMin, hour);
        if (!cs) return null;
        return (
          <div
            key={s.id}
            className="flex items-center justify-center text-[9px] text-white bg-red-600/70 border border-red-300 overflow-hidden whitespace-nowrap"
            style={{ gridColumn: `${cs.col} / span ${cs.span}`, gridRow: '1 / span 2' }}
            title={s.keterangan}
          >
            LINE STOP
          </div>
        );
      })}
    </>
  );
}

export default function TimeGrid() {
  const shiftConfig = useBoardStore((s) => s.shiftConfig);
  const planLots = useBoardStore((s) => s.planLots);
  const lineStops = useBoardStore((s) => s.lineStops);
  const products = useBoardStore((s) => s.products);
  const activeDay = useBoardStore((s) => s.activeDay);
  const setLotsProduct = useBoardStore((s) => s.setLotsProduct);
  const setLotStart = useBoardStore((s) => s.setLotStart);
  const nowMin = useNowMin(shiftConfig);
  const actualLots = useMemo(() => deriveActual(planLots, nowMin), [planLots, nowMin]);
  const hours = hourRange(shiftConfig);
  const [picker, setPicker] = useState<{ lotIds: string[]; x: number; y: number } | null>(null);
  const [dragAnchor, setDragAnchor] = useState<number | null>(null);
  const [dragCurrent, setDragCurrent] = useState<number | null>(null);
  const isDragging = dragAnchor !== null;
  // Alt+drag: reposition a single lot in time instead of selecting a range
  // for model retagging. `targetMin` tracks the live preview position.
  const [moveState, setMoveState] = useState<{ index: number; targetMin: number } | null>(null);

  const selectedIds = useMemo(() => {
    if (dragAnchor === null || dragCurrent === null) return undefined;
    const lo = Math.min(dragAnchor, dragCurrent);
    const hi = Math.max(dragAnchor, dragCurrent);
    return new Set(planLots.slice(lo, hi + 1).map((l) => l.id));
  }, [dragAnchor, dragCurrent, planLots]);

  const handleDragStart = (index: number, e: ReactMouseEvent) => {
    if (e.altKey) {
      setMoveState({ index, targetMin: planLots[index].startMin });
      return;
    }
    setDragAnchor(index);
    setDragCurrent(index);
  };
  const handleDragEnter = (index: number) => {
    if (isDragging) setDragCurrent(index);
  };

  // Finish a click/drag-select on mouseup anywhere, so dragging off the last
  // lot box (into empty grid space) still ends the selection cleanly.
  useEffect(() => {
    if (!isDragging) return undefined;
    const onMouseUp = (e: MouseEvent) => {
      if (dragAnchor !== null && dragCurrent !== null) {
        const lo = Math.min(dragAnchor, dragCurrent);
        const hi = Math.max(dragAnchor, dragCurrent);
        const ids = planLots.slice(lo, hi + 1).map((l) => l.id);
        if (ids.length > 0) setPicker({ lotIds: ids, x: e.clientX, y: e.clientY });
      }
      setDragAnchor(null);
      setDragCurrent(null);
    };
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging, dragAnchor, dragCurrent, planLots]);

  // Alt+drag reposition: follow the mouse to compute the target minute (via
  // the hour cell under the cursor), then commit on mouseup.
  useEffect(() => {
    if (!moveState) return undefined;
    const targetMinFromEvent = (e: MouseEvent): number | null => {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-hour]');
      if (!el) return null;
      const hour = Number(el.dataset.hour);
      const rect = el.getBoundingClientRect();
      const frac = (e.clientX - rect.left) / rect.width;
      const minuteOfHour = Math.min(59, Math.max(0, Math.round(frac * 60)));
      return hour + minuteOfHour;
    };
    const onMouseMove = (e: MouseEvent) => {
      const min = targetMinFromEvent(e);
      if (min !== null) setMoveState((s) => (s ? { ...s, targetMin: min } : s));
    };
    const onMouseUp = (e: MouseEvent) => {
      const min = targetMinFromEvent(e) ?? moveState.targetMin;
      const lot = planLots[moveState.index];
      if (lot && min !== lot.startMin) setLotStart(lot.id, min);
      setMoveState(null);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveState, planLots]);

  return (
    <div className="border-2 border-red-600/70 text-white relative">
      {/* minute header */}
      <div className="flex border-b-2 border-red-600/60 text-[10px] text-yellow-300">
        <div className="w-24 shrink-0 px-1 py-0.5 font-bold">WAKTU</div>
        <div className="grid flex-1" style={{ gridTemplateColumns: 'repeat(60, 1fr)' }}>
          {MINUTE_HEADERS.map((m) => (
            <div key={m} style={{ gridColumn: `${m - 2} / span 5` }} className="text-center">
              {String(m).padStart(2, '0')}
            </div>
          ))}
        </div>
      </div>

      {hours.map((hour) => (
        <div key={hour} className="flex border-b-2 border-red-600/50">
          <div className="w-24 shrink-0 flex flex-col text-[10px]">
            <div className="px-1 font-bold text-cyan-200">{toHHmm(hour)}</div>
            <div className="px-1 text-yellow-400 border-t border-red-600/30">PLN</div>
            <div className="px-1 text-yellow-400 border-t border-red-600/30">ACT</div>
          </div>
          <div
            data-hour={hour}
            className="grid flex-1"
            style={{
              gridTemplateColumns: 'repeat(60, 1fr)',
              gridTemplateRows: '26px 18px',
              backgroundImage: [
                'repeating-linear-gradient(to right, transparent, transparent calc(100%/60 - 2px), rgba(220,38,38,0.28) calc(100%/60))',
                'repeating-linear-gradient(to right, transparent, transparent calc(100%/12 - 3px), rgba(220,38,38,0.55) calc(100%/12))',
              ].join(', '),
            }}
          >
            <LotBoxes
              lots={planLots}
              hour={hour}
              products={products}
              row={1}
              selectable
              onDragStart={handleDragStart}
              onDragEnter={handleDragEnter}
              selectedIds={selectedIds}
              showCumulative
              movingId={moveState ? planLots[moveState.index]?.id : undefined}
            />
            <LotBoxes lots={actualLots} hour={hour} products={products} row={2} />
            <Overlays
              breaks={effectiveShift(shiftConfig, activeDay).breaks}
              lineStops={lineStops}
              hour={hour}
            />
            {moveState && (() => {
              const cs = colSpan(moveState.targetMin, moveState.targetMin + LOT_DURATION_MIN, hour);
              if (!cs) return null;
              return (
                <div
                  className="pointer-events-none rounded-sm m-px border-2 border-dashed border-yellow-300 bg-yellow-300/20"
                  style={{ gridColumn: `${cs.col} / span ${cs.span}`, gridRow: 1 }}
                />
              );
            })()}
          </div>
        </div>
      ))}

      {picker && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPicker(null)} />
          <div
            className="fixed z-50 flex gap-1 border-2 border-cyan-500 bg-black p-1"
            style={{ left: picker.x, top: picker.y }}
          >
            {picker.lotIds.length > 1 && (
              <span className="flex items-center px-1 text-[10px] text-yellow-300 font-bold">
                {picker.lotIds.length} lot
              </span>
            )}
            {products.map((p) => (
              <button
                key={p.code}
                className="px-2 py-0.5 text-[10px] font-bold text-black rounded-sm"
                style={{ backgroundColor: p.color }}
                onClick={() => {
                  setLotsProduct(picker.lotIds, p.code);
                  setPicker(null);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
