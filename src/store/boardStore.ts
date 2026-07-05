import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  LineStop, LotRequest, PlanLot, Product, ProductCode, ShiftConfig,
} from '../domain/types';
import {
  buildShiftConfig, DEFAULT_PRODUCTS, DEFAULT_SHIFT, ensureDandori,
} from '../domain/defaults';
import {
  applyLineStops, autoPlaceLots, makeBreak, makeLineStop, renumberByProduct,
} from '../lib/scheduling';

interface BoardState {
  shiftConfig: ShiftConfig;
  // Each shift's own settings (currently just its breaks) are remembered
  // here by shiftNo, so switching shift 1 <-> shift 2 doesn't discard
  // customizations you made earlier for a shift — they become that shift's
  // saved default instead of being regenerated from scratch every time.
  shiftPresets: Record<number, ShiftConfig>;
  products: Product[];
  planLots: PlanLot[];
  lineStops: LineStop[];
  addLots: (requests: LotRequest[]) => void;
  setLotProduct: (lotId: string, productCode: ProductCode) => void;
  setLotsProduct: (lotIds: string[], productCode: ProductCode) => void;
  addLineStop: (startMin: number, endMin: number, keterangan: string) => void;
  removeLineStop: (id: string) => void;
  addBreak: (label: string, startMin: number, endMin: number) => void;
  updateBreak: (id: string, startMin: number, endMin: number) => void;
  removeBreak: (id: string) => void;
  setProductionStart: (startMin: number) => void;
  setShiftNo: (shiftNo: number) => void;
  resetBoard: () => void;
}

function recount(planLots: PlanLot[]): LotRequest[] {
  const counts = new Map<ProductCode, number>();
  for (const l of planLots) counts.set(l.productCode, (counts.get(l.productCode) ?? 0) + 1);
  return [...counts.entries()].map(([productCode, count]) => ({ productCode, count }));
}

export const useBoardStore = create<BoardState>()(
  persist(
    (set, get) => ({
      shiftConfig: DEFAULT_SHIFT,
      shiftPresets: { [DEFAULT_SHIFT.shiftNo]: DEFAULT_SHIFT },
      products: DEFAULT_PRODUCTS,
      planLots: [],
      lineStops: [],

      addLots: (requests) => {
        const { shiftConfig, planLots, lineStops } = get();
        const existing = recount(planLots);
        const merged = [...existing, ...requests];
        const placed = autoPlaceLots(merged, shiftConfig);
        set({ planLots: applyLineStops(placed, shiftConfig, lineStops) });
      },

      setLotProduct: (lotId, productCode) => {
        get().setLotsProduct([lotId], productCode);
      },

      // Retag a whole block of lots (e.g. drag-selected on the grid) in one
      // go, instead of clicking each one individually.
      setLotsProduct: (lotIds, productCode) => {
        const { planLots } = get();
        const idSet = new Set(lotIds);
        const updated = planLots.map((l) => (idSet.has(l.id) ? { ...l, productCode } : l));
        set({ planLots: renumberByProduct(updated) });
      },

      addLineStop: (startMin, endMin, keterangan) => {
        const { shiftConfig, planLots, lineStops } = get();
        const stop = makeLineStop(startMin, endMin, keterangan);
        const nextStops = [...lineStops, stop];
        set({
          lineStops: nextStops,
          planLots: applyLineStops(planLots, shiftConfig, nextStops),
        });
      },

      removeLineStop: (id) => {
        const { shiftConfig, planLots, lineStops } = get();
        const nextStops = lineStops.filter((s) => s.id !== id);
        set({
          lineStops: nextStops,
          planLots: applyLineStops(planLots, shiftConfig, nextStops),
        });
      },

      addBreak: (label, startMin, endMin) => {
        const {
          shiftConfig, planLots, lineStops, shiftPresets,
        } = get();
        const brk = makeBreak(label, startMin, endMin);
        const nextShift = { ...shiftConfig, breaks: [...shiftConfig.breaks, brk] };
        set({
          shiftConfig: nextShift,
          shiftPresets: { ...shiftPresets, [nextShift.shiftNo]: nextShift },
          planLots: applyLineStops(planLots, nextShift, lineStops),
        });
      },

      // Locked breaks (Dandori) can't be removed, but their time is still
      // editable — e.g. if the real shift's setup window isn't 10 minutes.
      updateBreak: (id, startMin, endMin) => {
        const {
          shiftConfig, planLots, lineStops, shiftPresets,
        } = get();
        const nextShift = {
          ...shiftConfig,
          breaks: shiftConfig.breaks.map((b) => (b.id === id ? { ...b, startMin, endMin } : b)),
        };
        set({
          shiftConfig: nextShift,
          shiftPresets: { ...shiftPresets, [nextShift.shiftNo]: nextShift },
          planLots: applyLineStops(planLots, nextShift, lineStops),
        });
      },

      // Dandori is mandatory: it can never be removed, so every generated
      // lot is guaranteed to start after it, not just when it happens to
      // still be in the list.
      removeBreak: (id) => {
        const {
          shiftConfig, planLots, lineStops, shiftPresets,
        } = get();
        const nextShift = {
          ...shiftConfig,
          breaks: shiftConfig.breaks.filter((b) => b.id !== id || b.type === 'DANDORI'),
        };
        set({
          shiftConfig: nextShift,
          shiftPresets: { ...shiftPresets, [nextShift.shiftNo]: nextShift },
          planLots: applyLineStops(planLots, nextShift, lineStops),
        });
      },

      // Changes when the first lot should be generated from (default: right
      // after Dandori). Existing lots reflow immediately, same as breaks.
      setProductionStart: (startMin) => {
        const {
          shiftConfig, planLots, lineStops, shiftPresets,
        } = get();
        const nextShift = { ...shiftConfig, productionStartMin: startMin };
        set({
          shiftConfig: nextShift,
          shiftPresets: { ...shiftPresets, [nextShift.shiftNo]: nextShift },
          planLots: applyLineStops(planLots, nextShift, lineStops),
        });
      },

      setShiftNo: (shiftNo) => {
        const { shiftConfig, shiftPresets } = get();
        if (shiftConfig.shiftNo === shiftNo) return;
        // Reuse this shift's previously-saved settings (breaks included) if
        // it's been visited before; otherwise seed it from the template.
        const nextShift = ensureDandori(
          shiftPresets[shiftNo] ?? buildShiftConfig(shiftNo, shiftConfig.pic, shiftConfig.tTimeSec),
        );
        set({
          shiftConfig: nextShift,
          shiftPresets: { ...shiftPresets, [shiftNo]: nextShift },
          planLots: [],
          lineStops: [],
        });
      },

      // Reset only clears today's production data (lots + line stops). Shift
      // settings — including any Dandori/Wakom/Istirahat breaks the user has
      // configured — are a one-time setup and stay untouched across resets.
      resetBoard: () =>
        set({
          products: DEFAULT_PRODUCTS,
          planLots: [],
          lineStops: [],
        }),
    }),
    {
      name: 'shikake-board-v1',
      // Repair any state saved before Dandori became mandatory (or from a
      // session where it was removed under the old rules), so the fix
      // applies immediately on load rather than only after the next
      // addBreak/removeBreak/setShiftNo call.
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<BoardState>) };
        merged.shiftConfig = ensureDandori(merged.shiftConfig);
        merged.shiftPresets = Object.fromEntries(
          Object.entries(merged.shiftPresets).map(([k, v]) => [k, ensureDandori(v)]),
        );
        return merged;
      },
    },
  ),
);
