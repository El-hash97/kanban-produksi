import { useState } from 'react';
import BoardHeader from './components/BoardHeader';
import TimeGrid from './components/TimeGrid';
import AddLotsForm from './components/AddLotsForm';
import LineStopPanel from './components/LineStopPanel';
import ModelSummary from './components/ModelSummary';
import BreakPanel from './components/BreakPanel';
import TappingPanel from './components/TappingPanel';

const TABS = [
  { key: 'linestop', label: 'INFORMASI LINE STOP' },
  { key: 'break', label: 'DANDORI/WAKOM/ISTIRAHAT' },
  { key: 'model', label: 'MODEL' },
  { key: 'tapping', label: 'URUTAN TAPPING FURNACE' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function App() {
  const [tab, setTab] = useState<TabKey>('linestop');

  return (
    <div className="min-h-full bg-black p-2 text-white space-y-1">
      <BoardHeader />
      <TimeGrid />

      <div className="border-2 border-cyan-500/60">
        <div className="flex">
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
        </div>
        {tab === 'linestop' && <LineStopPanel />}
        {tab === 'break' && <BreakPanel />}
        {tab === 'model' && (
          <>
            <AddLotsForm />
            <ModelSummary />
          </>
        )}
        {tab === 'tapping' && <TappingPanel />}
      </div>
    </div>
  );
}
