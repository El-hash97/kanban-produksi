import type {
  Break, BreakType, DayType, Product, ShiftConfig, Furnace,
} from './types';

const h = (hh: number, mm = 0) => hh * 60 + mm;

export const SHIFT_LENGTH_MIN = h(12);

/** Spacing between one lot's start and the next when generating lots is
 * derived from the shift's own Takt Time (tTimeSec, editable via Input
 * Planning): pitchSec = tTimeSec * TAKT_TO_PITCH_MULTIPLIER. At the default
 * 48s takt time this gives 240s (4min), matching the board's original fixed
 * spacing. */
export const TAKT_TO_PITCH_MULTIPLIER = 5;
export function pitchSecFromTakt(tTimeSec: number): number {
  return tTimeSec * TAKT_TO_PITCH_MULTIPLIER;
}
export const LOT_DURATION_MIN = 1;

/** Break timings expressed as offsets from the shift's own start, so the
 * same pattern (Dandori right at start, Istirahat mid-shift, ...) applies
 * whichever hour the shift begins at. Two parallel sets — DAY and FRIDAY —
 * are identical except the main Istirahat runs longer on Friday (Jumatan). */
const BREAK_TEMPLATE: {
  idSuffix: string; type: BreakType; label: string; day: DayType;
  offsetStart: number; offsetEnd: number;
}[] = [
  // Weekday (DAY)
  {
    idSuffix: 'dandori', type: 'DANDORI', label: 'Dandori', day: 'DAY', offsetStart: h(0), offsetEnd: h(0, 10),
  },
  {
    idSuffix: 'wakom1', type: 'WAKOM1', label: 'Wakom-1', day: 'DAY', offsetStart: h(3), offsetEnd: h(3, 5),
  },
  {
    idSuffix: 'istirahat1', type: 'ISTIRAHAT1', label: 'Istirahat-1', day: 'DAY', offsetStart: h(4), offsetEnd: h(4, 15),
  },
  {
    idSuffix: 'istirahat', type: 'ISTIRAHAT', label: 'Istirahat', day: 'DAY', offsetStart: h(5), offsetEnd: h(5, 45),
  },
  {
    idSuffix: 'wakom2', type: 'WAKOM2', label: 'Wakom-2', day: 'DAY', offsetStart: h(7), offsetEnd: h(7, 5),
  },
  // Friday (FRIDAY) — only the main Istirahat is longer
  {
    idSuffix: 'dandori', type: 'DANDORI', label: 'Dandori', day: 'FRIDAY', offsetStart: h(0), offsetEnd: h(0, 10),
  },
  {
    idSuffix: 'wakom1', type: 'WAKOM1', label: 'Wakom-1', day: 'FRIDAY', offsetStart: h(3), offsetEnd: h(3, 5),
  },
  {
    idSuffix: 'istirahat1', type: 'ISTIRAHAT1', label: 'Istirahat-1', day: 'FRIDAY', offsetStart: h(4), offsetEnd: h(4, 15),
  },
  {
    idSuffix: 'istirahat', type: 'ISTIRAHAT', label: 'Istirahat (Jumat)', day: 'FRIDAY', offsetStart: h(5), offsetEnd: h(6, 15),
  },
  {
    idSuffix: 'wakom2', type: 'WAKOM2', label: 'Wakom-2', day: 'FRIDAY', offsetStart: h(7), offsetEnd: h(7, 5),
  },
];

function buildBreaks(shiftNo: number, shiftStartMin: number): Break[] {
  return BREAK_TEMPLATE.map((b) => ({
    id: `brk-${shiftNo}-${b.day}-${b.idSuffix}`,
    type: b.type,
    label: b.label,
    day: b.day,
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
    group: 'RED',
  };
}

export const DEFAULT_SHIFT: ShiftConfig = buildShiftConfig(1);

const DAY_TYPES: DayType[] = ['DAY', 'FRIDAY'];

/**
 * Repairs a shift persisted from before a field became mandatory: Dandori
 * (see boardStore.removeBreak) might be missing — for either or both days —
 * if it was removed in an older session, and productionStartMin might be
 * entirely absent from state saved before that field existed. Called on
 * shift switch and on every app load (persist `merge`), so old sessions
 * self-heal without user action. Returns the same reference when nothing
 * needs repair.
 */
export function ensureDandori(shift: ShiftConfig): ShiftConfig {
  let next = shift;
  const missing = DAY_TYPES.filter(
    (d) => !next.breaks.some((b) => b.type === 'DANDORI' && b.day === d),
  );
  if (missing.length > 0) {
    const added: Break[] = missing.map((d) => ({
      id: `brk-${next.shiftNo}-${d}-dandori`,
      type: 'DANDORI',
      label: 'Dandori',
      day: d,
      startMin: next.startMin,
      endMin: next.startMin + 10,
    }));
    next = { ...next, breaks: [...added, ...next.breaks] };
  }
  if (typeof next.productionStartMin !== 'number') {
    next = { ...next, productionStartMin: next.startMin + 10 };
  }
  return next;
}

/**
 * Upgrades a shift persisted before breaks carried a `day` tag: existing
 * breaks are assumed to be the weekday (DAY) set, and a FRIDAY set is
 * synthesized from them (same times) if none exists yet — the user can then
 * adjust Friday's hours from the settings pop-up. Finishes with
 * ensureDandori so both days are guaranteed to have one.
 */
export function migrateShift(shift: ShiftConfig): ShiftConfig {
  let breaks = shift.breaks.map((b) => (b.day ? b : { ...b, day: 'DAY' as DayType }));
  if (!breaks.some((b) => b.day === 'FRIDAY')) {
    const friday = breaks
      .filter((b) => b.day === 'DAY')
      .map((b) => ({
        ...b,
        id: b.id.includes('-DAY-') ? b.id.replace('-DAY-', '-FRIDAY-') : `${b.id}-friday`,
        day: 'FRIDAY' as DayType,
      }));
    breaks = [...breaks, ...friday];
  }
  const withGroup = shift.group ? shift : { ...shift, group: 'RED' as const };
  return ensureDandori({ ...withGroup, breaks });
}

export const DEFAULT_PRODUCTS: Product[] = [
  {
    code: '2TR', label: 'B/C 2TR', color: '#3b82f6', sandMeasTimeMin: 9.5, moldPerBatch: 7,
  },
  {
    code: '1TR', label: 'B/C 1TR', color: '#d946ef', sandMeasTimeMin: 9.5, moldPerBatch: 7,
  },
  {
    code: 'KAI', label: 'CAMS', color: '#f59e0b', sandMeasTimeMin: 11.5, moldPerBatch: 5,
  },
  {
    code: 'CRANK', label: 'CRANK', color: '#22c55e', sandMeasTimeMin: 11.5, moldPerBatch: 5,
  },
];

export const DEFAULT_FURNACES: Furnace[] = [
  { id: 1, label: 'Furnace 1', color: '#f97316' },
  { id: 2, label: 'Furnace 2', color: '#06b6d4' },
  { id: 3, label: 'Furnace 3', color: '#a855f7' },
  { id: 4, label: 'Furnace 4', color: '#f43f5e' },
];
