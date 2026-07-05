import { useEffect, useState } from 'react';
import { useBoardStore } from '../store/boardStore';
import { toHHmm } from '../lib/time';
import TimeSelect from './TimeSelect';

const PRESETS = ['Dandori', 'Wakom', 'Istirahat'];

export default function BreakPanel() {
  const shiftConfig = useBoardStore((s) => s.shiftConfig);
  const breaks = shiftConfig.breaks;
  const addBreak = useBoardStore((s) => s.addBreak);
  const updateBreak = useBoardStore((s) => s.updateBreak);
  const removeBreak = useBoardStore((s) => s.removeBreak);
  const [start, setStart] = useState(shiftConfig.startMin);
  const [end, setEnd] = useState(shiftConfig.startMin + 10);
  const [label, setLabel] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState(0);
  const [editEnd, setEditEnd] = useState(0);

  // Default the form to the active shift's own start whenever the shift
  // changes, so shift 2 (19:00-07:00) doesn't default to shift 1's hours.
  useEffect(() => {
    setStart(shiftConfig.startMin);
    setEnd(shiftConfig.startMin + 10);
    setEditingId(null);
  }, [shiftConfig.shiftNo, shiftConfig.startMin]);

  const submit = () => {
    if (end <= start || !label.trim()) return;
    addBreak(label.trim(), start, end);
    setLabel('');
  };

  const startEdit = (id: string, s: number, e: number) => {
    setEditingId(id);
    setEditStart(s);
    setEditEnd(e);
  };

  const saveEdit = () => {
    if (!editingId || editEnd <= editStart) return;
    updateBreak(editingId, editStart, editEnd);
    setEditingId(null);
  };

  const sorted = [...breaks].sort((a, b) => a.startMin - b.startMin);

  return (
    <div className="text-white text-xs">
      <div className="bg-blue-900/40 px-2 py-1 font-bold text-green-400">
        DANDORI / WAKOM / ISTIRAHAT
      </div>

      <div className="flex flex-wrap items-center gap-2 p-2 border-b border-blue-500/40">
        <span>Mulai</span><TimeSelect value={start} onChange={setStart} shift={shiftConfig} />
        <span>Selesai</span><TimeSelect value={end} onChange={setEnd} shift={shiftConfig} />
        <input
          className="bg-black border border-cyan-500 px-1 flex-1 min-w-[8rem]"
          placeholder="Nama (mis. Wakom-3)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <button className="bg-blue-700 hover:bg-blue-600 px-2 py-0.5 rounded" onClick={submit}>
          + Tambah
        </button>
      </div>

      <div className="flex flex-wrap gap-1 p-2 border-b border-blue-500/40">
        {PRESETS.map((p) => (
          <button
            key={p}
            className="bg-gray-700 hover:bg-gray-600 px-2 py-0.5 rounded"
            onClick={() => setLabel(p)}
          >
            {p}
          </button>
        ))}
      </div>

      <table className="w-full text-[11px]">
        <thead className="text-green-400">
          <tr className="border-b border-blue-500/40">
            <th className="text-left px-2 py-1">TIME</th>
            <th className="text-left px-2 py-1">NAMA</th>
            <th className="px-2 py-1"></th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr><td colSpan={3} className="px-2 py-2 text-gray-500">Belum ada dandori/wakom/istirahat.</td></tr>
          )}
          {sorted.map((b) => (
            <tr key={b.id} className="border-b border-blue-500/20">
              {editingId === b.id ? (
                <>
                  <td className="px-2 py-1" colSpan={2}>
                    <span className="inline-flex items-center gap-2">
                      <TimeSelect value={editStart} onChange={setEditStart} shift={shiftConfig} />
                      <span>–</span>
                      <TimeSelect value={editEnd} onChange={setEditEnd} shift={shiftConfig} />
                    </span>
                  </td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">
                    <button className="text-green-400 hover:text-green-200 mr-2" onClick={saveEdit}>✓</button>
                    <button className="text-gray-400 hover:text-gray-200" onClick={() => setEditingId(null)}>✕</button>
                  </td>
                </>
              ) : (
                <>
                  <td className="px-2 py-1 tabular-nums">{toHHmm(b.startMin)}–{toHHmm(b.endMin)}</td>
                  <td className="px-2 py-1">{b.label}</td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">
                    <button
                      className="text-cyan-400 hover:text-cyan-200 mr-2"
                      title="Ubah jam"
                      onClick={() => startEdit(b.id, b.startMin, b.endMin)}
                    >
                      ✎
                    </button>
                    {b.type === 'DANDORI' ? (
                      <span className="text-gray-600" title="Dandori wajib ada agar lot selalu digenerate setelahnya">🔒</span>
                    ) : (
                      <button className="text-red-400 hover:text-red-200" onClick={() => removeBreak(b.id)}>✕</button>
                    )}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
