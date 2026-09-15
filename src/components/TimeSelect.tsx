import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { ShiftConfig } from '../domain/types';
import { toHHmm, toShiftMin } from '../lib/time';
import {
  CENTER, HOUR_OUTER_R, HOUR_INNER_R, MINUTE_R,
  pointFor, hourFromPoint, minuteFromPoint, hourHandPoint, minuteHandPoint,
} from '../lib/clockGeometry';

interface Props { value: number; onChange: (min: number) => void; shift: ShiftConfig; }

type Step = 'hour' | 'minute';

function svgPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const loc = pt.matrixTransform(ctm.inverse());
  return { x: loc.x, y: loc.y };
}

/** A 24-hour clock face: outer ring picks 00-11, inner ring picks 12-23, so
 * the whole 0-23 range is reachable without ever falling back to AM/PM. */
function HourRing({ hour, onPick }: { hour: number; onPick: (h: number) => void }) {
  return (
    <>
      {Array.from({ length: 12 }, (_, i) => {
        const p = pointFor(i, 12, HOUR_OUTER_R);
        const h = i;
        const selected = hour === h;
        return (
          <text
            key={`o${i}`}
            x={p.x}
            y={p.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={selected ? 13 : 11}
            fontWeight={selected ? 700 : 400}
            fill={selected ? '#000000' : '#67e8f9'}
            onPointerDown={() => onPick(h)}
            style={{ cursor: 'pointer' }}
          >
            {String(h).padStart(2, '0')}
          </text>
        );
      })}
      {Array.from({ length: 12 }, (_, i) => {
        const p = pointFor(i, 12, HOUR_INNER_R);
        const h = i + 12;
        const selected = hour === h;
        return (
          <text
            key={`i${i}`}
            x={p.x}
            y={p.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={selected ? 12 : 10}
            fontWeight={selected ? 700 : 400}
            fill={selected ? '#000000' : '#9ca3af'}
            onPointerDown={() => onPick(h)}
            style={{ cursor: 'pointer' }}
          >
            {h}
          </text>
        );
      })}
    </>
  );
}

function MinuteRing({ minute, onPick }: { minute: number; onPick: (m: number) => void }) {
  return (
    <>
      {Array.from({ length: 60 }, (_, m) => {
        const onFive = m % 5 === 0;
        const p = pointFor(m, 60, MINUTE_R);
        const selected = minute === m;
        if (!onFive && !selected) {
          const tick = pointFor(m, 60, MINUTE_R - 4);
          return <circle key={m} cx={tick.x} cy={tick.y} r={1} fill="#374151" />;
        }
        return (
          <text
            key={m}
            x={p.x}
            y={p.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={selected ? 12 : 10}
            fontWeight={selected ? 700 : 400}
            fill={selected ? '#000000' : '#67e8f9'}
            onPointerDown={() => onPick(m)}
            style={{ cursor: 'pointer' }}
          >
            {String(m).padStart(2, '0')}
          </text>
        );
      })}
    </>
  );
}

function ClockDial({
  step, hour, minute, onPickHour, onPickMinute,
}: {
  step: Step; hour: number; minute: number;
  onPickHour: (h: number) => void; onPickMinute: (m: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);

  const pickFromClient = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const { x, y } = svgPoint(svg, clientX, clientY);
    if (step === 'hour') {
      onPickHour(hourFromPoint(x, y));
    } else {
      onPickMinute(minuteFromPoint(x, y));
    }
  };

  const handPoint = step === 'hour' ? hourHandPoint(hour) : minuteHandPoint(minute);

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 200 200"
      className="w-52 h-52 touch-none select-none"
      onPointerDown={(e: ReactPointerEvent<SVGSVGElement>) => {
        (e.target as Element).setPointerCapture?.(e.pointerId);
        setDragging(true);
        pickFromClient(e.clientX, e.clientY);
      }}
      onPointerMove={(e: ReactPointerEvent<SVGSVGElement>) => {
        if (!dragging) return;
        pickFromClient(e.clientX, e.clientY);
      }}
      onPointerUp={() => setDragging(false)}
      onPointerLeave={() => setDragging(false)}
    >
      <circle cx={CENTER} cy={CENTER} r={94} fill="#0a0a0a" stroke="#06b6d4" strokeWidth={1} />
      <line x1={CENTER} y1={CENTER} x2={handPoint.x} y2={handPoint.y} stroke="#06b6d4" strokeWidth={1.5} />
      <circle cx={handPoint.x} cy={handPoint.y} r={11} fill="#06b6d4" />
      <circle cx={CENTER} cy={CENTER} r={2.5} fill="#06b6d4" />
      {step === 'hour'
        ? <HourRing hour={hour} onPick={onPickHour} />
        : <MinuteRing minute={minute} onPick={onPickMinute} />}
    </svg>
  );
}

function TimePickerPopup({
  hour: initHour, minute: initMinute, onCancel, onConfirm,
}: {
  hour: number; minute: number; onCancel: () => void; onConfirm: (h: number, m: number) => void;
}) {
  const [step, setStep] = useState<Step>('hour');
  const [hour, setHour] = useState(initHour);
  const [minute, setMinute] = useState(initMinute);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70" onClick={onCancel}>
      <div
        className="bg-black border-2 border-cyan-500 text-white text-xs p-3 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-center gap-2 text-2xl font-bold tabular-nums">
          <button
            type="button"
            className={step === 'hour' ? 'text-cyan-300' : 'text-gray-500 hover:text-white'}
            onClick={() => setStep('hour')}
          >
            {String(hour).padStart(2, '0')}
          </button>
          <span className="text-gray-500">:</span>
          <button
            type="button"
            className={step === 'minute' ? 'text-cyan-300' : 'text-gray-500 hover:text-white'}
            onClick={() => setStep('minute')}
          >
            {String(minute).padStart(2, '0')}
          </button>
          <span className="text-xs text-gray-500 ml-1">24 JAM</span>
        </div>
        <ClockDial
          step={step}
          hour={hour}
          minute={minute}
          onPickHour={(h) => { setHour(h); setStep('minute'); }}
          onPickMinute={(m) => setMinute(m)}
        />
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            className="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600"
            onClick={onCancel}
          >
            BATAL
          </button>
          <button
            type="button"
            className="px-3 py-1 rounded bg-cyan-700 hover:bg-cyan-600"
            onClick={() => onConfirm(hour, minute)}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Custom 24-hour clock-face picker — never falls back to the native
 * <input type="time">, whose AM/PM-vs-24h display depends on the browser's
 * locale. toHHmm always renders a plain 00:00-23:59 reading; toShiftMin folds
 * it onto the active shift's own timeline (so e.g. 02:00 on an overnight
 * shift 2 lands after 24:00, not before it).
 */
export default function TimeSelect({ value, onChange, shift }: Props) {
  const [open, setOpen] = useState(false);
  const clock = ((value % 1440) + 1440) % 1440;
  const currentHour = Math.floor(clock / 60);
  const currentMinute = clock % 60;

  return (
    <>
      <button
        type="button"
        className="bg-black border border-cyan-500 text-white text-xs px-1"
        onClick={() => setOpen(true)}
      >
        {toHHmm(value)}
      </button>
      {open && (
        <TimePickerPopup
          hour={currentHour}
          minute={currentMinute}
          onCancel={() => setOpen(false)}
          onConfirm={(h, m) => {
            onChange(toShiftMin(shift, h * 60 + m));
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
