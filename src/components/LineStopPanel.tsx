import { useEffect, useState } from 'react';
import { useBoardStore } from '../store/boardStore';
import { toHHmm } from '../lib/time';
import TimeSelect from './TimeSelect';

export default function LineStopPanel() {
  const shiftConfig = useBoardStore((s) => s.shiftConfig);
  const lineStops = useBoardStore((s) => s.lineStops);
  const addLineStop = useBoardStore((s) => s.addLineStop);
  const removeLineStop = useBoardStore((s) => s.removeLineStop);
  const [start, setStart] = useState(shiftConfig.startMin);
  const [end, setEnd] = useState(shiftConfig.startMin + 5);
  const [ket, setKet] = useState('');

  // Keep the form's default time inside the active shift's own window.
  useEffect(() => {
    setStart(shiftConfig.startMin);
    setEnd(shiftConfig.startMin + 5);
  }, [shiftConfig.shiftNo, shiftConfig.startMin]);

  const submit = () => {
    if (end <= start || !ket.trim()) return;
    addLineStop(start, end, ket.trim());
    setKet('');
  };

  return (
    <div className="text-white text-xs">
      <div className="bg-red-900/40 px-2 py-1 font-bold text-green-400">INFORMASI LINE STOP</div>

      <div className="flex flex-wrap items-center gap-2 p-2 border-b border-red-600/40">
        <span>Mulai</span><TimeSelect value={start} onChange={setStart} shift={shiftConfig} />
        <span>Selesai</span><TimeSelect value={end} onChange={setEnd} shift={shiftConfig} />
        <input
          className="bg-black border border-cyan-500 px-1 flex-1 min-w-[8rem]"
          placeholder="Keterangan (mis. F.Releasing LS Fault)"
          value={ket}
          onChange={(e) => setKet(e.target.value)}
        />
        <button className="bg-red-700 hover:bg-red-600 px-2 py-0.5 rounded" onClick={submit}>
          + Line Stop
        </button>
      </div>

      <table className="w-full text-[11px]">
        <thead className="text-green-400">
          <tr className="border-b border-red-600/40">
            <th className="text-left px-2 py-1">TIME</th>
            <th className="text-left px-2 py-1">DUR</th>
            <th className="text-left px-2 py-1">PROBLEM</th>
            <th className="px-2 py-1"></th>
          </tr>
        </thead>
        <tbody>
          {lineStops.length === 0 && (
            <tr><td colSpan={4} className="px-2 py-2 text-gray-500">Belum ada line stop.</td></tr>
          )}
          {lineStops.map((s) => (
            <tr key={s.id} className="border-b border-red-600/20">
              <td className="px-2 py-1 tabular-nums">{toHHmm(s.startMin)}–{toHHmm(s.endMin)}</td>
              <td className="px-2 py-1">{s.durationMin}'</td>
              <td className="px-2 py-1">{s.keterangan}</td>
              <td className="px-2 py-1 text-right">
                <button className="text-red-400 hover:text-red-200" onClick={() => removeLineStop(s.id)}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
