import { useMemo, useState } from 'react';
import { useBoardStore } from '../store/boardStore';
import type { ProductCode } from '../domain/types';

const HISTORY_COLUMNS: ProductCode[] = ['1TR', '2TR', 'KAI', 'CRANK'];

/** Keeps only digits and strips a leading zero once a further digit follows,
 * so a controlled number field never shows "05" while the user is typing. */
function sanitizeDigits(raw: string): string {
  return raw.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '');
}

export default function UpdatePlanningModal({ onClose }: { onClose: () => void }) {
  const products = useBoardStore((s) => s.products);
  const planLots = useBoardStore((s) => s.planLots);
  const planningHistory = useBoardStore((s) => s.planningHistory);
  const sandPerMixing = useBoardStore((s) => s.sandPerMixing);
  const setSandPerMixing = useBoardStore((s) => s.setSandPerMixing);
  const applyPlanningTargets = useBoardStore((s) => s.applyPlanningTargets);
  const logPlanningSnapshot = useBoardStore((s) => s.logPlanningSnapshot);
  const shiftConfig = useBoardStore((s) => s.shiftConfig);

  const currentCounts = useMemo(() => {
    const counts: Record<ProductCode, number> = {
      '2TR': 0, '1TR': 0, KAI: 0, CRANK: 0,
    };
    for (const l of planLots) counts[l.productCode] += 1;
    return counts;
  }, [planLots]);

  const [target, setTarget] = useState<Record<ProductCode, string>>(
    () => Object.fromEntries(
      Object.entries(currentCounts).map(([code, count]) => [code, String(count)]),
    ) as Record<ProductCode, string>,
  );
  const [sandQty, setSandQty] = useState(String(sandPerMixing));

  // Logs into the same planningHistory Input Planning writes to, so the two
  // entry points share one combined history (spec §5). This window doesn't
  // re-ask for Group/Time Begin, so the snapshot carries the shift's current
  // values for those.
  const submit = () => {
    applyPlanningTargets(products.map((p) => ({ productCode: p.code, qty: Number(target[p.code]) || 0 })));
    setSandPerMixing(Number(sandQty) || 0);
    const entries = products.map((p) => ({
      productCode: p.code, qty: Number(target[p.code]) || 0, sandMeasTimeMin: p.sandMeasTimeMin,
    }));
    logPlanningSnapshot(entries, shiftConfig.group, shiftConfig.productionStartMin);
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
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      className="bg-black border border-cyan-500 w-16 px-1"
                      value={target[p.code]}
                      onChange={(e) => setTarget((t) => ({ ...t, [p.code]: sanitizeDigits(e.target.value) }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center gap-2">
            <span>JML.SAND/MIXING</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              className="bg-black border border-cyan-500 w-20 px-1"
              value={sandQty}
              onChange={(e) => setSandQty(sanitizeDigits(e.target.value))}
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
