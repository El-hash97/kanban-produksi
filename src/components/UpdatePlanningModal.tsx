import { useMemo, useState } from 'react';
import { useBoardStore } from '../store/boardStore';
import type { ProductCode } from '../domain/types';

const HISTORY_COLUMNS: ProductCode[] = ['1TR', '2TR', 'KAI', 'CRANK'];

export default function UpdatePlanningModal({ onClose }: { onClose: () => void }) {
  const products = useBoardStore((s) => s.products);
  const planLots = useBoardStore((s) => s.planLots);
  const planningHistory = useBoardStore((s) => s.planningHistory);
  const sandPerMixing = useBoardStore((s) => s.sandPerMixing);
  const setSandPerMixing = useBoardStore((s) => s.setSandPerMixing);
  const applyPlanningTargets = useBoardStore((s) => s.applyPlanningTargets);

  const currentCounts = useMemo(() => {
    const counts: Record<ProductCode, number> = {
      '2TR': 0, '1TR': 0, KAI: 0, CRANK: 0,
    };
    for (const l of planLots) counts[l.productCode] += 1;
    return counts;
  }, [planLots]);

  const [target, setTarget] = useState<Record<ProductCode, number>>(currentCounts);
  const [sandQty, setSandQty] = useState(sandPerMixing);

  const submit = () => {
    applyPlanningTargets(products.map((p) => ({ productCode: p.code, qty: target[p.code] })));
    setSandPerMixing(sandQty);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="bg-black border-2 border-cyan-500 text-white text-xs max-w-2xl w-[90vw] max-h-[85vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between bg-cyan-900/40 px-3 py-2 border-b border-cyan-500/50">
          <span className="font-bold text-green-400">UPDATE PLANNING</span>
          <button className="text-gray-300 hover:text-white text-base" onClick={onClose} title="Tutup">✕</button>
        </div>
        <div className="p-3 space-y-3">
          <table className="w-full">
            <thead className="text-green-400">
              <tr>
                <th className="text-left">MODEL</th>
                <th>CURRENT</th>
                <th>PLANNING</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.code}>
                  <td>{p.label}</td>
                  <td className="text-center">{currentCounts[p.code]}</td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      className="bg-black border border-cyan-500 w-16 px-1"
                      value={target[p.code]}
                      onChange={(e) => setTarget((t) => ({ ...t, [p.code]: Math.max(0, Number(e.target.value)) }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center gap-2">
            <span>JML.SAND/MIXING</span>
            <input
              type="number"
              className="bg-black border border-cyan-500 w-20 px-1"
              value={sandQty}
              onChange={(e) => setSandQty(Number(e.target.value))}
            />
          </div>
          <button className="bg-cyan-700 hover:bg-cyan-600 px-3 py-1 rounded" onClick={submit}>
            UPDATE PLANNING
          </button>

          <div className="pt-2 border-t border-cyan-500/30">
            <div className="text-green-400 font-bold mb-1">HISTORY PLANNING</div>
            {planningHistory.length === 0 ? (
              <div className="text-gray-500">No data to display</div>
            ) : (
              <table className="w-full">
                <thead className="text-green-400">
                  <tr>
                    <th>No</th>
                    {HISTORY_COLUMNS.map((code) => <th key={code}>{code === 'KAI' ? 'CAMS' : code}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {planningHistory.map((snap, i) => (
                    <tr key={snap.id}>
                      <td className="text-center">{planningHistory.length - i}</td>
                      {HISTORY_COLUMNS.map((code) => (
                        <td key={code} className="text-center">
                          {snap.entries.find((e) => e.productCode === code)?.qty ?? 0}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
