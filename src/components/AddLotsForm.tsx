import { useState } from 'react';
import { useBoardStore } from '../store/boardStore';
import type { ProductCode } from '../domain/types';

export default function AddLotsForm() {
  const products = useBoardStore((s) => s.products);
  const addLots = useBoardStore((s) => s.addLots);
  const resetBoard = useBoardStore((s) => s.resetBoard);
  const [code, setCode] = useState<ProductCode>('2TR');
  const [count, setCount] = useState(1);

  return (
    <div className="flex items-center gap-2 text-xs p-2 border border-cyan-500/50">
      <span className="text-green-400 font-bold">+ LOT</span>
      <select
        className="bg-black border border-cyan-500 text-white px-1"
        value={code}
        onChange={(e) => setCode(e.target.value as ProductCode)}
      >
        {products.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
      </select>
      <input
        type="number"
        min={1}
        className="bg-black border border-cyan-500 text-white w-14 px-1"
        value={count}
        onChange={(e) => setCount(Math.max(1, Number(e.target.value)))}
      />
      <button
        className="bg-cyan-700 hover:bg-cyan-600 px-2 py-0.5 rounded"
        onClick={() => addLots([{ productCode: code, count }])}
      >
        Tambah
      </button>
      <button
        className="ml-auto bg-gray-700 hover:bg-gray-600 px-2 py-0.5 rounded"
        onClick={resetBoard}
      >
        Reset
      </button>
    </div>
  );
}
