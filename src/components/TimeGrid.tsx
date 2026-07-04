import { useMemo } from 'react';
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
  lots, hour, products, row,
}: { lots: PlanLot[]; hour: number; products: Product[]; row: number }) {
  return (
    <>
      {lots.map((lot) => {
        const cs = colSpan(lot.startMin, lot.endMin, hour);
        if (!cs) return null;
        return (
          <div
            key={lot.id}
            className="flex items-center justify-center text-[9px] font-bold text-black rounded-sm m-px overflow-hidden"
            style={{
              gridColumn: `${cs.col} / span ${cs.span}`,
              gridRow: row,
              backgroundColor: colorFor(products, lot.productCode),
              outline: lot.shifted ? '1px solid #f87171' : 'none',
            }}
            title={`${lot.productCode} Lot ${lot.lotNo} @ ${toHHmm(lot.startMin)}`}
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
  const nowMin = useNowMin();
  const actualLots = useMemo(() => deriveActual(planLots, nowMin), [planLots, nowMin]);
  const hours = hourRange(shiftConfig);

  return (
    <div className="border-2 border-red-600/70 text-white">
      {/* minute header */}
      <div className="flex border-b border-red-600/50 text-[10px] text-yellow-300">
        <div className="w-24 shrink-0 px-1 py-0.5 font-bold">WAKTU</div>
        <div className="grid flex-1" style={{ gridTemplateColumns: 'repeat(60, 1fr)' }}>
          {MINUTE_HEADERS.map((m) => (
            <div key={m} style={{ gridColumn: `${m} / span 5` }} className="text-center">
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
              backgroundImage:
                'repeating-linear-gradient(to right, transparent, transparent calc(100%/12 - 1px), rgba(220,38,38,0.35) calc(100%/12))',
            }}
          >
            <LotBoxes lots={planLots} hour={hour} products={products} row={1} />
            <LotBoxes lots={actualLots} hour={hour} products={products} row={2} />
            <Overlays breaks={shiftConfig.breaks} lineStops={lineStops} hour={hour} />
          </div>
        </div>
      ))}
    </div>
  );
}
