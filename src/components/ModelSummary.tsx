import { useMemo } from 'react';
import { useBoardStore } from '../store/boardStore';
import { deriveActual } from '../lib/scheduling';
import { summarize } from '../lib/summary';
import { useNowMin } from '../hooks/useNowMin';

export default function ModelSummary() {
  const products = useBoardStore((s) => s.products);
  const planLots = useBoardStore((s) => s.planLots);
  const nowMin = useNowMin();
  const actual = useMemo(() => deriveActual(planLots, nowMin), [planLots, nowMin]);
  const rows = summarize(products, planLots, actual);

  return (
    <table className="w-full text-[11px] border-2 border-cyan-500/60 text-white">
      <thead className="text-green-400">
        <tr className="border-b border-cyan-500/40">
          <th className="text-left px-2 py-1">MODEL</th>
          <th className="px-2 py-1">PLAN</th>
          <th className="px-2 py-1">ACTUAL</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.code} className={r.code === 'TOTAL' ? 'font-bold border-t border-cyan-500/40' : ''}>
            <td className="px-2 py-0.5">{r.label}</td>
            <td className="px-2 py-0.5 text-center tabular-nums">{r.plan}</td>
            <td className="px-2 py-0.5 text-center tabular-nums">{r.actual}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
