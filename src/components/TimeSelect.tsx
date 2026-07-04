interface Props { value: number; onChange: (min: number) => void; startHour?: number; endHour?: number; }

export default function TimeSelect({ value, onChange, startHour = 7, endHour = 19 }: Props) {
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  const minutes = Array.from({ length: 60 }, (_, i) => i);
  return (
    <span className="inline-flex gap-1 items-center">
      <select
        className="bg-black border border-cyan-500 text-white text-xs px-1"
        value={hour}
        onChange={(e) => onChange(Number(e.target.value) * 60 + minute)}
      >
        {hours.map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}</option>)}
      </select>
      <span>:</span>
      <select
        className="bg-black border border-cyan-500 text-white text-xs px-1"
        value={minute}
        onChange={(e) => onChange(hour * 60 + Number(e.target.value))}
      >
        {minutes.map((m) => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
      </select>
    </span>
  );
}
