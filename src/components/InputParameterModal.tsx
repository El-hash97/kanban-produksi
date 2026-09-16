import { useState } from 'react';
import { useBoardStore } from '../store/boardStore';
import type {
  LineStopCategory, PlanningEntry, ProductCode, TeamGroup,
} from '../domain/types';
import TimeSelect from './TimeSelect';
import { nowMinForShift } from '../lib/time';

const GROUPS: TeamGroup[] = ['RED', 'WHITE'];
const SAND_TIME_OPTIONS = [8.5, 9.5, 10.5, 11.5, 12.5];
const EMPTY_QTY: Record<ProductCode, string> = {
  '2TR': '', '1TR': '', KAI: '', CRANK: '',
};

/** Keeps only digits and strips a leading zero once a further digit follows,
 * so a controlled number field never shows "05" or forces a stray "1" back
 * in front of what the user is typing (see the min-clamp note below). */
function sanitizeDigits(raw: string): string {
  return raw.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '');
}

function InputProblemTab() {
  const shiftConfig = useBoardStore((s) => s.shiftConfig);
  const addLineStop = useBoardStore((s) => s.addLineStop);
  // Default to the current clock: a line stop is normally logged as it happens.
  const [start, setStart] = useState(() => nowMinForShift(shiftConfig));
  const [end, setEnd] = useState(() => nowMinForShift(shiftConfig) + 5);
  const [problem, setProblem] = useState('');
  const [counterMeasure, setCounterMeasure] = useState('');
  const [category, setCategory] = useState<LineStopCategory>('AV');

  const submit = () => {
    if (end <= start || !problem.trim()) return;
    addLineStop(start, end, problem.trim(), counterMeasure.trim(), category);
    setProblem('');
    setCounterMeasure('');
  };

  return (
    <div className="p-3 space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span>Mulai</span><TimeSelect value={start} onChange={setStart} shift={shiftConfig} />
        <span>Selesai</span><TimeSelect value={end} onChange={setEnd} shift={shiftConfig} />
      </div>
      <textarea
        className="w-full bg-black border border-cyan-500 px-2 py-1"
        rows={2}
        placeholder="Problem"
        value={problem}
        onChange={(e) => setProblem(e.target.value)}
      />
      <textarea
        className="w-full bg-black border border-cyan-500 px-2 py-1"
        rows={2}
        placeholder="Counter Measure"
        value={counterMeasure}
        onChange={(e) => setCounterMeasure(e.target.value)}
      />
      <div className="flex gap-4">
        {(['AV', 'PE', 'RQ'] as const).map((c) => (
          <label key={c} className="flex items-center gap-1">
            <input
              type="radio"
              name="lsCategory"
              checked={category === c}
              onChange={() => setCategory(c)}
            />
            {c}
          </label>
        ))}
      </div>
      <button className="bg-red-700 hover:bg-red-600 px-3 py-1 rounded" onClick={submit}>
        INSERT LINE STOP
      </button>
    </div>
  );
}

function InputPlanningTab() {
  const products = useBoardStore((s) => s.products);
  const shiftConfig = useBoardStore((s) => s.shiftConfig);
  const sandPerMixing = useBoardStore((s) => s.sandPerMixing);
  const activeDay = useBoardStore((s) => s.activeDay);
  const setActiveDay = useBoardStore((s) => s.setActiveDay);
  const addLots = useBoardStore((s) => s.addLots);
  const setProductionStart = useBoardStore((s) => s.setProductionStart);
  const setGroup = useBoardStore((s) => s.setGroup);
  const setSandPerMixing = useBoardStore((s) => s.setSandPerMixing);
  const setTaktTime = useBoardStore((s) => s.setTaktTime);
  const logPlanningSnapshot = useBoardStore((s) => s.logPlanningSnapshot);

  const [qty, setQty] = useState<Record<ProductCode, string>>(EMPTY_QTY);
  const [sandTime, setSandTime] = useState<Record<ProductCode, number>>(
    () => Object.fromEntries(products.map((p) => [p.code, p.sandMeasTimeMin])) as Record<ProductCode, number>,
  );
  const [timeBegin, setTimeBegin] = useState(shiftConfig.productionStartMin);
  const [group, setGroupLocal] = useState<TeamGroup>(shiftConfig.group);
  const [sandQty, setSandQty] = useState(String(sandPerMixing));
  const [taktTime, setTaktTimeLocal] = useState(String(shiftConfig.tTimeSec));

  const total = Object.values(qty).reduce((a, b) => a + (Number(b) || 0), 0);

  const submit = () => {
    const entries: PlanningEntry[] = products
      .map((p) => ({ productCode: p.code, qty: Number(qty[p.code]) || 0, sandMeasTimeMin: sandTime[p.code] }))
      .filter((e) => e.qty > 0);
    if (entries.length === 0) return;
    setGroup(group);
    setProductionStart(timeBegin);
    setSandPerMixing(Number(sandQty) || 0);
    setTaktTime(Math.max(1, Number(taktTime) || 1));
    addLots(entries.map((e) => ({ productCode: e.productCode, count: e.qty })));
    logPlanningSnapshot(entries, group, timeBegin);
    setQty(EMPTY_QTY);
  };

  return (
    <div className="p-3 space-y-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-gray-400">HARI</span>
        <button
          className={`px-2 py-0.5 rounded font-bold ${activeDay === 'DAY' ? 'bg-cyan-700 text-white' : 'text-gray-400 hover:text-white'}`}
          onClick={() => setActiveDay('DAY')}
        >
          DAY
        </button>
        <button
          className={`px-2 py-0.5 rounded font-bold ${activeDay === 'FRIDAY' ? 'bg-cyan-700 text-white' : 'text-gray-400 hover:text-white'}`}
          onClick={() => setActiveDay('FRIDAY')}
        >
          FRIDAY
        </button>
        <span className="text-gray-500">(otomatis FRIDAY tiap hari Jumat)</span>
      </div>
      <table className="w-full">
        <thead className="text-green-400">
          <tr>
            <th className="text-left">MODEL</th>
            <th>QTY</th>
            <th>SAND MEAS. TIME</th>
            <th>MOLD/BATCH</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.code}>
              <td>{p.label}</td>
              <td>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  className="bg-black border border-cyan-500 w-16 px-1"
                  value={qty[p.code]}
                  onChange={(e) => setQty((q) => ({ ...q, [p.code]: sanitizeDigits(e.target.value) }))}
                />
              </td>
              <td>
                <select
                  className="bg-black border border-cyan-500 px-1"
                  value={sandTime[p.code]}
                  onChange={(e) => setSandTime((s) => ({ ...s, [p.code]: Number(e.target.value) }))}
                >
                  {SAND_TIME_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </td>
              <td className="text-center">{p.moldPerBatch}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-3">
        <span>TOTAL: <b>{total}</b></span>
        <span>TAKT TIME</span>
        <input
          type="text"
          inputMode="numeric"
          placeholder="1"
          className="bg-black border border-cyan-500 w-16 px-1"
          value={taktTime}
          onChange={(e) => setTaktTimeLocal(sanitizeDigits(e.target.value))}
        />
        <span>TIME BEGIN</span>
        <TimeSelect value={timeBegin} onChange={setTimeBegin} shift={shiftConfig} />
        <span>GROUP</span>
        <select
          className="bg-black border border-cyan-500 px-1"
          value={group}
          onChange={(e) => setGroupLocal(e.target.value as TeamGroup)}
        >
          {GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
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
        INSERT PLAN
      </button>
    </div>
  );
}

function InputInformasiTab() {
  const informasiLog = useBoardStore((s) => s.informasiLog);
  const addInformasi = useBoardStore((s) => s.addInformasi);
  const [text, setText] = useState('');

  const submit = () => {
    if (!text.trim()) return;
    addInformasi(text.trim());
    setText('');
  };

  return (
    <div className="p-3 space-y-2 text-xs">
      <textarea
        className="w-full bg-black border border-cyan-500 px-2 py-1"
        rows={3}
        placeholder="Informasi"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button className="bg-cyan-700 hover:bg-cyan-600 px-3 py-1 rounded" onClick={submit}>
        INSERT INFORMASI
      </button>
      <ul className="space-y-1 max-h-40 overflow-auto">
        {informasiLog.length === 0 && <li className="text-gray-500">Belum ada informasi.</li>}
        {informasiLog.map((n) => (
          <li key={n.id} className="border-b border-cyan-500/20 py-1">{n.text}</li>
        ))}
      </ul>
    </div>
  );
}

function InputPicTab() {
  const shiftConfig = useBoardStore((s) => s.shiftConfig);
  const setPic = useBoardStore((s) => s.setPic);
  const setGroup = useBoardStore((s) => s.setGroup);
  const setShiftNo = useBoardStore((s) => s.setShiftNo);
  const [pic, setPicLocal] = useState(shiftConfig.pic);
  const [shiftNo, setShiftNoLocal] = useState(shiftConfig.shiftNo);
  const [group, setGroupLocal] = useState<TeamGroup>(shiftConfig.group);

  const submit = () => {
    setPic(pic);
    setGroup(group);
    if (shiftNo !== shiftConfig.shiftNo) setShiftNo(shiftNo);
  };

  return (
    <div className="p-3 space-y-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="w-16">PIC</span>
        <input
          className="bg-black border border-cyan-500 px-1 flex-1"
          value={pic}
          onChange={(e) => setPicLocal(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="w-16">SHIFT</span>
        <select
          className="bg-black border border-cyan-500 px-1"
          value={shiftNo}
          onChange={(e) => setShiftNoLocal(Number(e.target.value))}
        >
          <option value={1}>1 (07:00–19:00)</option>
          <option value={2}>2 (19:00–07:00)</option>
        </select>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-16">GROUP</span>
        <select
          className="bg-black border border-cyan-500 px-1"
          value={group}
          onChange={(e) => setGroupLocal(e.target.value as TeamGroup)}
        >
          {GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>
      <button className="bg-cyan-700 hover:bg-cyan-600 px-3 py-1 rounded" onClick={submit}>
        UPDATE
      </button>
    </div>
  );
}

const TABS = [
  { key: 'problem', label: 'Input Problem' },
  { key: 'planning', label: 'Input Planning' },
  { key: 'informasi', label: 'Input Informasi' },
  { key: 'pic', label: 'InputPic' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default function InputParameterModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<TabKey>('problem');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="bg-black border-2 border-cyan-500 text-white text-xs max-w-2xl w-[90vw] max-h-[85vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between bg-cyan-900/40 px-3 py-2 border-b border-cyan-500/50">
          <span className="font-bold text-green-400">INPUT PARAMETER</span>
          <button className="text-gray-300 hover:text-white text-base" onClick={onClose} title="Tutup">✕</button>
        </div>
        <div className="flex border-b border-cyan-500/40">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`px-3 py-1 font-bold border-r border-cyan-500/30 ${
                tab === t.key ? 'bg-cyan-900/50 text-green-400' : 'text-gray-400 hover:text-white'
              }`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'problem' && <InputProblemTab />}
        {tab === 'planning' && <InputPlanningTab />}
        {tab === 'informasi' && <InputInformasiTab />}
        {tab === 'pic' && <InputPicTab />}
      </div>
    </div>
  );
}
