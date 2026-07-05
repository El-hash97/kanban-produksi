import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useBoardStore } from '../store/boardStore';

export default function BoardHeader() {
  const shift = useBoardStore((s) => s.shiftConfig);
  const setShiftNo = useBoardStore((s) => s.setShiftNo);
  const [now, setNow] = useState(() => dayjs());
  useEffect(() => {
    const id = setInterval(() => setNow(dayjs()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="flex items-stretch justify-between border-2 border-cyan-500/60 bg-black text-white">
      <div className="px-3 py-1">
        <div className="text-red-500 font-bold tracking-wide">PT TMMIN</div>
        <div className="text-[10px] text-cyan-300 leading-tight">
          CASTING DIVISION-SUNTER II<br />DEPARTEMENT PRODUCTION
        </div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center">
        <h1 className="text-lg font-bold tracking-wider">
          PRODUCTION CONTROL BOARD MOULDING LINE
        </h1>
        <div className="flex gap-8 text-xs">
          <span className="text-green-400">URUTAN KANBAN</span>
          <span className="text-green-400">INFORMASI LINE STOP</span>
        </div>
      </div>
      <div className="px-3 py-1 text-xs border-l border-cyan-500/40">
        <div>PIC : <span className="text-cyan-300">{shift.pic}</span></div>
        <div className="flex items-center gap-1">
          SHIFT :
          <select
            className="bg-black border border-cyan-500 text-cyan-300 px-1"
            value={shift.shiftNo}
            onChange={(e) => setShiftNo(Number(e.target.value))}
          >
            <option value={1}>1 (07:00–19:00)</option>
            <option value={2}>2 (19:00–07:00)</option>
          </select>
        </div>
        <div>T.TIME : {shift.tTimeSec}</div>
      </div>
      <div className="px-3 py-1 text-right border-l border-cyan-500/40">
        <div className="text-green-400 text-xl font-bold tabular-nums">
          {now.format('HH:mm:ss')}
        </div>
        <div className="text-cyan-300 text-xs">{now.format('ddd, DD-MM-YYYY')}</div>
      </div>
    </header>
  );
}
