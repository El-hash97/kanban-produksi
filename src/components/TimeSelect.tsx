import type { ShiftConfig } from '../domain/types';
import { toHHmm, toMinOfDay, toShiftMin } from '../lib/time';

interface Props { value: number; onChange: (min: number) => void; shift: ShiftConfig; }

/**
 * Native time-of-day picker (same compact "click to open a wheel/clock"
 * widget browsers use for <input type="date">), instead of two long
 * single-row <select> lists. The typed HH:MM is always a plain 00:00-23:59
 * clock reading; toShiftMin folds it onto the active shift's own timeline
 * (so e.g. 02:00 on an overnight shift 2 lands after 24:00, not before it).
 */
export default function TimeSelect({ value, onChange, shift }: Props) {
  return (
    <input
      type="time"
      className="bg-black border border-cyan-500 text-white text-xs px-1"
      value={toHHmm(value)}
      onChange={(e) => {
        if (!e.target.value) return;
        onChange(toShiftMin(shift, toMinOfDay(e.target.value)));
      }}
    />
  );
}
