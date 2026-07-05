import { useMemo } from 'react';
import { useBoardStore } from '../store/boardStore';
import { deriveActual } from '../lib/scheduling';
import { summarize } from '../lib/summary';
import { useNowMin } from '../hooks/useNowMin';

function colorFor(products: { code: string; color: string }[], code: string): string | null {
  return products.find((p) => p.code === code)?.color ?? null;
}

export default function ModelSummary() {
  const products = useBoardStore((s) => s.products);
  const planLots = useBoardStore((s) => s.planLots);
  const shiftConfig = useBoardStore((s) => s.shiftConfig);
  const nowMin = useNowMin(shiftConfig);
  const actual = useMemo(() => deriveActual(planLots, nowMin), [planLots, nowMin]);
  const rows = summarize(products, planLots, actual);

  return (
    <table className="text-[11px] text-white">
      <thead className="text-green-400">
        <tr className="border-b border-cyan-500/40">
          <th className="text-left py-1 pr-4">MODEL</th>
          <th className="py-1 pr-3 text-right">PLAN</th>
          <th className="py-1 text-right">ACTUAL</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const color = colorFor(products, r.code);
          return (
            <tr key={r.code} className={r.code === 'TOTAL' ? 'font-bold border-t border-cyan-500/40' : ''}>
              <td className="py-0.5 pr-4">
                <span className="inline-flex items-center gap-1.5">
                  {color && (
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: color }}
                    />
                  )}
                  {r.label}
                </span>
              </td>
              <td className="py-0.5 pr-3 text-right tabular-nums">{r.plan}</td>
              <td className="py-0.5 text-right tabular-nums">{r.actual}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
