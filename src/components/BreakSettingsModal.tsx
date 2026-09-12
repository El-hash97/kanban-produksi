import { useState } from 'react';
import { useBoardStore } from '../store/boardStore';
import type { Break, DayType } from '../domain/types';
import { toHHmm } from '../lib/time';
import TimeSelect from './TimeSelect';

const DAY_TABLES: { day: DayType; title: string }[] = [
  { day: 'DAY', title: 'HARI BIASA (DAY)' },
  { day: 'FRIDAY', title: 'JUMAT (FRIDAY)' },
];

function DayTable({ day, title }: { day: DayType; title: string }) {
  const shiftConfig = useBoardStore((s) => s.shiftConfig);
  const addBreak = useBoardStore((s) => s.addBreak);
  const updateBreak = useBoardStore((s) => s.updateBreak);
  const removeBreak = useBoardStore((s) => s.removeBreak);

  const rows = shiftConfig.breaks
    .filter((b) => b.day === day)
    .sort((a, b) => a.startMin - b.startMin);

  const [start, setStart] = useState(shiftConfig.startMin);
  const [end, setEnd] = useState(shiftConfig.startMin + 10);
  const [label, setLabel] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState(0);
  const [editEnd, setEditEnd] = useState(0);

  const submit = () => {
    if (end <= start || !label.trim()) return;
    addBreak(day, label.trim(), start, end);
    setLabel('');
  };
  const startEdit = (b: Break) => {
    setEditingId(b.id);
    setEditStart(b.startMin);
    setEditEnd(b.endMin);
  };
  const saveEdit = () => {
    if (!editingId || editEnd <= editStart) return;
    updateBreak(editingId, editStart, editEnd);
    setEditingId(null);
  };

  return (
    <div className="flex-1 min-w-[16rem] border border-cyan-500/40">
      <div className="bg-blue-900/40 px-2 py-1 font-bold text-green-400">{title}</div>
      <table className="w-full text-[11px]">
        <thead className="text-green-400">
          <tr className="border-b border-blue-500/40">
            <th className="text-left px-2 py-1">TIME</th>
            <th className="text-left px-2 py-1">NAMA</th>
            <th className="px-2 py-1"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
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
                    <button className="text-cyan-400 hover:text-cyan-200 mr-2" title="Ubah jam" onClick={() => startEdit(b)}>✎</button>
                    {b.type === 'DANDORI' ? (
                      <span className="text-gray-600" title="Dandori wajib ada">🔒</span>
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
      <div className="flex flex-wrap items-center gap-2 p-2 border-t border-blue-500/40">
        <TimeSelect value={start} onChange={setStart} shift={shiftConfig} />
        <span>–</span>
        <TimeSelect value={end} onChange={setEnd} shift={shiftConfig} />
        <input
          className="bg-black border border-cyan-500 px-1 flex-1 min-w-[6rem]"
          placeholder="Nama (mis. Wakom-3)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <button className="bg-blue-700 hover:bg-blue-600 px-2 py-0.5 rounded" onClick={submit}>+ Tambah</button>
      </div>
    </div>
  );
}

export default function BreakSettingsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="bg-black border-2 border-cyan-500 text-white text-xs max-w-4xl w-[90vw] max-h-[85vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between bg-cyan-900/40 px-3 py-2 border-b border-cyan-500/50">
          <span className="font-bold text-green-400">SETTING DANDORI / WAKOM / ISTIRAHAT</span>
          <button className="text-gray-300 hover:text-white text-base" onClick={onClose} title="Tutup">✕</button>
        </div>
        <div className="flex flex-wrap gap-2 p-3">
          {DAY_TABLES.map((t) => <DayTable key={t.day} day={t.day} title={t.title} />)}
        </div>
        <div className="px-3 py-2 text-gray-400 border-t border-cyan-500/30">
          Perubahan langsung tersimpan. Papan mengikuti jadwal hari aktif secara otomatis.
        </div>
      </div>
    </div>
  );
}
