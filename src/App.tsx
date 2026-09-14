import { useState } from 'react';
import BoardHeader from './components/BoardHeader';
import TimeGrid from './components/TimeGrid';
import LineStopPanel from './components/LineStopPanel';
import ModelSummary from './components/ModelSummary';
import BreakSettingsModal from './components/BreakSettingsModal';
import InputParameterModal from './components/InputParameterModal';
import UpdatePlanningModal from './components/UpdatePlanningModal';
import TappingPanel from './components/TappingPanel';
import { useBoardStore } from './store/boardStore';
import { useBoardSync } from './hooks/useBoardSync';

const TABS = [
  { key: 'linestop', label: 'INFORMASI LINE STOP' },
  { key: 'model', label: 'MODEL' },
  { key: 'tapping', label: 'URUTAN TAPPING FURNACE' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function App() {
  useBoardSync();
  const [tab, setTab] = useState<TabKey>('linestop');
  const [showSettings, setShowSettings] = useState(false);
  const [showInputParameter, setShowInputParameter] = useState(false);
  const [showUpdatePlanning, setShowUpdatePlanning] = useState(false);
  const activeDay = useBoardStore((s) => s.activeDay);
  const setActiveDay = useBoardStore((s) => s.setActiveDay);
  const resetBoard = useBoardStore((s) => s.resetBoard);

  return (
    <div className="min-h-full bg-black p-2 text-white space-y-1">
      <BoardHeader />
      <TimeGrid />

      <div className="border-2 border-cyan-500/60">
        <div className="flex items-center flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`px-3 py-1 text-xs font-bold border-r border-cyan-500/40 ${
                tab === t.key ? 'bg-cyan-900/50 text-green-400' : 'text-gray-400 hover:text-white'
              }`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 px-2 py-1 text-xs">
            <span className="text-gray-400">HARI:</span>
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
            <button
              className="ml-2 px-2 py-0.5 rounded bg-cyan-700 hover:bg-cyan-600"
              onClick={() => setShowInputParameter(true)}
            >
              ⚙ Input Parameter
            </button>
            <button
              className="px-2 py-0.5 rounded bg-cyan-700 hover:bg-cyan-600"
              onClick={() => setShowUpdatePlanning(true)}
            >
              📋 Update Planning
            </button>
            <button
              className="px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600"
              title="Setting Dandori/Wakom/Istirahat"
              onClick={() => setShowSettings(true)}
            >
              ⚙ Setting
            </button>
            <button className="px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600" onClick={resetBoard}>
              Reset
            </button>
          </div>
        </div>
        {tab === 'linestop' && <LineStopPanel />}
        {tab === 'model' && <ModelSummary />}
        {tab === 'tapping' && <TappingPanel />}
      </div>

      {showSettings && <BreakSettingsModal onClose={() => setShowSettings(false)} />}
      {showInputParameter && <InputParameterModal onClose={() => setShowInputParameter(false)} />}
      {showUpdatePlanning && <UpdatePlanningModal onClose={() => setShowUpdatePlanning(false)} />}
    </div>
  );
}
