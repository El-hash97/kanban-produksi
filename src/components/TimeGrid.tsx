import { useEffect, useMemo, useState } from 'react';
import { useBoardStore } from '../store/boardStore';
import { deriveActual } from '../lib/scheduling';
import { useNowMin } from '../hooks/useNowMin';
import { colSpan, hourRange } from '../lib/grid';
import { toHHmm } from '../lib/time';
import type { Break, LineStop, PlanLot, Product } from '../domain/types';

const MINUTE_HEADERS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

function colorFor(products: Product[], code: string): string {
  return products.find((p) => p.code === code)?.color ?? '#64748b';
}

function LotBoxes({
  lots, hour, products, row, selectable, onDragStart, onDragEnter, selectedIds,
}: {
  lots: PlanLot[]; hour: number; products: Product[]; row: number;
  selectable?: boolean;
  onDragStart?: (index: number) => void;
  onDragEnter?: (index: number) => void;
  selectedIds?: Set<string>;
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
            className={`flex items-center justify-center text-[9px] font-bold text-black rounded-sm m-px overflow-hidden select-none ${selectable ? 'cursor-pointer hover:ring-2 hover:ring-white' : ''} ${selected ? 'ring-2 ring-yellow-300' : ''}`}
            style={{
              gridColumn: `${cs.col} / span ${cs.span}`,
              gridRow: row,
              backgroundColor: colorFor(products, lot.productCode),
              outline: lot.shifted ? '1px solid #f87171' : 'none',
            }}
            title={`${lot.productCode} Lot ${lot.lotNo} @ ${toHHmm(lot.startMin)}${selectable ? ' — klik atau drag beberapa lot untuk ubah model' : ''}`}
            onMouseDown={onDragStart ? (e) => { e.preventDefault(); onDragStart(index); } : undefined}
            onMouseEnter={onDragEnter ? () => onDragEnter(index) : undefined}
          >
            {lot.lotNo}
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
  const setLotsProduct = useBoardStore((s) => s.setLotsProduct);
  const nowMin = useNowMin(shiftConfig);
  const actualLots = useMemo(() => deriveActual(planLots, nowMin), [planLots, nowMin]);
  const hours = hourRange(shiftConfig);
  const [picker, setPicker] = useState<{ lotIds: string[]; x: number; y: number } | null>(null);
  const [dragAnchor, setDragAnchor] = useState<number | null>(null);
  const [dragCurrent, setDragCurrent] = useState<number | null>(null);
  const isDragging = dragAnchor !== null;

  const selectedIds = useMemo(() => {
    if (dragAnchor === null || dragCurrent === null) return undefined;
    const lo = Math.min(dragAnchor, dragCurrent);
    const hi = Math.max(dragAnchor, dragCurrent);
    return new Set(planLots.slice(lo, hi + 1).map((l) => l.id));
  }, [dragAnchor, dragCurrent, planLots]);

  const handleDragStart = (index: number) => {
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

  return (
    <div className="border-2 border-red-600/70 text-white relative">
      {/* minute header */}
      <div className="flex border-b border-red-600/50 text-[10px] text-yellow-300">
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
        <div key={hour} className="flex border-b border-red-600/40">
          <div className="w-24 shrink-0 flex flex-col text-[10px]">
            <div className="px-1 font-bold text-cyan-200">{toHHmm(hour)}</div>
            <div className="px-1 text-yellow-400 border-t border-red-600/30">PLN</div>
            <div className="px-1 text-yellow-400 border-t border-red-600/30">ACT</div>
          </div>
          <div
            className="grid flex-1"
            style={{
              gridTemplateColumns: 'repeat(60, 1fr)',
              gridTemplateRows: '18px 18px',
              backgroundImage: [
                'repeating-linear-gradient(to right, transparent, transparent calc(100%/60 - 1px), rgba(220,38,38,0.18) calc(100%/60))',
                'repeating-linear-gradient(to right, transparent, transparent calc(100%/12 - 1px), rgba(220,38,38,0.4) calc(100%/12))',
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
            />
            <LotBoxes lots={actualLots} hour={hour} products={products} row={2} />
            <Overlays breaks={shiftConfig.breaks} lineStops={lineStops} hour={hour} />
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
