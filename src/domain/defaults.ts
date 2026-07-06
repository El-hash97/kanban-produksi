import type {
  Break, BreakType, Product, ShiftConfig, Furnace,
} from './types';

const h = (hh: number, mm = 0) => hh * 60 + mm;

export const SHIFT_LENGTH_MIN = h(12);

/** Fixed spacing between one lot's start and the next when generating lots
 * — 240s (4min), independent of T.TIME (tTimeSec, a separate reference
 * figure shown on the board header). */
export const LOT_PITCH_SEC = 240;
export const LOT_DURATION_MIN = 1;

/** Break timings expressed as offsets from the shift's own start, so the
 * same pattern (Dandori right at start, Istirahat mid-shift, ...) applies
 * whichever hour the shift begins at. */
const BREAK_TEMPLATE: { idSuffix: string; type: BreakType; label: string; offsetStart: number; offsetEnd: number }[] = [
  {
    idSuffix: 'dandori', type: 'DANDORI', label: 'Dandori', offsetStart: h(0), offsetEnd: h(0, 10),
  },
  {
    idSuffix: 'wakom1', type: 'WAKOM1', label: 'Wakom-1', offsetStart: h(3), offsetEnd: h(3, 5),
  },
  {
    idSuffix: 'istirahat1', type: 'ISTIRAHAT1', label: 'Istirahat-1', offsetStart: h(4), offsetEnd: h(4, 15),
  },
  {
    idSuffix: 'istirahat', type: 'ISTIRAHAT', label: 'Istirahat', offsetStart: h(5), offsetEnd: h(5, 45),
  },
  {
    idSuffix: 'wakom2', type: 'WAKOM2', label: 'Wakom-2', offsetStart: h(7), offsetEnd: h(7, 5),
  },
];

function buildBreaks(shiftNo: number, shiftStartMin: number): Break[] {
  return BREAK_TEMPLATE.map((b) => ({
    id: `brk-${shiftNo}-${b.idSuffix}`,
    type: b.type,
    label: b.label,
    startMin: shiftStartMin + b.offsetStart,
    endMin: shiftStartMin + b.offsetEnd,
  }));
}

/** Shift 1 runs 07:00-19:00; shift 2 runs 19:00-07:00 (next day), expressed
 * as continuous minutes past the shift's own start so scheduling never has
 * to deal with midnight wraparound. */
export function buildShiftConfig(shiftNo: number, pic = 'Bernad', tTimeSec = 48): ShiftConfig {
  const startMin = shiftNo === 2 ? h(19) : h(7);
  return {
    startMin,
    endMin: startMin + SHIFT_LENGTH_MIN,
    pic,
    shiftNo,
    tTimeSec,
    breaks: buildBreaks(shiftNo, startMin),
    productionStartMin: startMin + 10, // right after the default Dandori window
  };
}

export const DEFAULT_SHIFT: ShiftConfig = buildShiftConfig(1);

/**
 * Repairs a shift persisted from before a field became mandatory: Dandori
 * (see boardStore.removeBreak) might be missing if it was removed in an
 * older session, and productionStartMin might be entirely absent from state
 * saved before that field existed. Called on shift switch and on every app
 * load (persist `merge`), so old sessions self-heal without user action.
 */
export function ensureDandori(shift: ShiftConfig): ShiftConfig {
  let next = shift;
  if (!next.breaks.some((b) => b.type === 'DANDORI')) {
    const dandori: Break = {
      id: `brk-${next.shiftNo}-dandori`,
      type: 'DANDORI',
      label: 'Dandori',
      startMin: next.startMin,
      endMin: next.startMin + 10,
    };
    next = { ...next, breaks: [dandori, ...next.breaks] };
  }
  if (typeof next.productionStartMin !== 'number') {
    next = { ...next, productionStartMin: next.startMin + 10 };
  }
  return next;
}

export const DEFAULT_PRODUCTS: Product[] = [
  { code: '2TR', label: 'B/C 2TR', color: '#3b82f6' },
  { code: '1TR', label: 'B/C 1TR', color: '#d946ef' },
  { code: 'KAI', label: 'TR-KAI', color: '#f59e0b' },
  { code: 'CRANK', label: 'CRANK', color: '#22c55e' },
];

export const DEFAULT_FURNACES: Furnace[] = [
  { id: 1, label: 'Furnace 1', color: '#f97316' },
  { id: 2, label: 'Furnace 2', color: '#06b6d4' },
  { id: 3, label: 'Furnace 3', color: '#a855f7' },
  { id: 4, label: 'Furnace 4', color: '#f43f5e' },
];
