import { useState } from 'react';
import { useBoardStore } from '../store/boardStore';
import TimeSelect from './TimeSelect';

export default function AddLotsForm() {
  const shiftConfig = useBoardStore((s) => s.shiftConfig);
  const addLots = useBoardStore((s) => s.addLots);
  const setProductionStart = useBoardStore((s) => s.setProductionStart);
  const resetBoard = useBoardStore((s) => s.resetBoard);
  const [count, setCount] = useState(1);

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs p-2 border border-cyan-500/50">
      <span className="text-green-400 font-bold">JAM MULAI PRODUKSI</span>
      <TimeSelect
        value={shiftConfig.productionStartMin}
        onChange={setProductionStart}
        shift={shiftConfig}
      />
      <span className="text-green-400 font-bold ml-2">+ LOT</span>
      <input
        type="number"
        min={1}
        className="bg-black border border-cyan-500 text-white w-14 px-1"
        value={count}
        onChange={(e) => setCount(Math.max(1, Number(e.target.value)))}
      />
      <button
        className="bg-cyan-700 hover:bg-cyan-600 px-2 py-0.5 rounded"
        onClick={() => addLots([{ productCode: '2TR', count }])}
      >
        Tambah
      </button>
      <span className="text-gray-500">Klik nomor lot pada grid untuk ubah model</span>
      <button
        className="ml-auto bg-gray-700 hover:bg-gray-600 px-2 py-0.5 rounded"
        onClick={resetBoard}
      >
        Reset
      </button>
    </div>
  );
}
