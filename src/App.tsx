import BoardHeader from './components/BoardHeader';
import TimeGrid from './components/TimeGrid';
import AddLotsForm from './components/AddLotsForm';
import LineStopPanel from './components/LineStopPanel';
import ModelSummary from './components/ModelSummary';

export default function App() {
  return (
    <div className="min-h-full bg-black p-2 text-white space-y-1">
      <BoardHeader />
      <div className="flex gap-1">
        <div className="flex-1 space-y-1">
          <AddLotsForm />
          <TimeGrid />
        </div>
        <div className="w-80 shrink-0 space-y-1">
          <LineStopPanel />
          <ModelSummary />
        </div>
      </div>
    </div>
  );
}
