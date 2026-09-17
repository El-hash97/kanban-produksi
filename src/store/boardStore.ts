import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  DayType, FurnaceId, InformasiNote, LineStop, LineStopCategory, LotRequest, PlanLot,
  Product, ProductCode, ShiftConfig, TeamGroup,
} from '../domain/types';
import {
  buildShiftConfig, DEFAULT_PRODUCTS, DEFAULT_SHIFT, ensureDandori, migrateShift,
} from '../domain/defaults';
import {
  applyLineStops, autoPlaceLots, effectiveShift, makeBreak, makeLineStop, reflowFrom,
  renumberByProduct,
} from '../lib/scheduling';
import { nowMinForShift, todayDayType } from '../lib/time';

// One shift's own slice of planLots/lineStops/furnaceOverrides, stashed
// away in `shiftData` while that shift isn't the active one.
interface ShiftLotData {
  planLots: PlanLot[];
  lineStops: LineStop[];
  furnaceOverrides: Record<string, FurnaceId>;
}

// The subset of BoardState that's plain data (serializes cleanly to JSON) —
// what Zustand's `persist` middleware writes to localStorage, and what
// useBoardSync pushes/pulls to the shared Neon-backed board. See
// docs/superpowers/specs/2026-09-14-neon-live-sync-design.md.
export interface PersistedBoardState {
  shiftConfig: ShiftConfig;
  // Each shift's own settings (currently just its breaks) are remembered
  // here by shiftNo, so switching shift 1 <-> shift 2 doesn't discard
  // customizations you made earlier for a shift — they become that shift's
  // saved default instead of being regenerated from scratch every time.
  shiftPresets: Record<number, ShiftConfig>;
  products: Product[];
  // planLots/lineStops/furnaceOverrides below are always the *currently
  // active* shift's data. shiftData is where the *other* shift's data waits
  // while it's not on screen — setShiftNo swaps between them, so switching
  // shifts never discards lots/line stops the way resetBoard does.
  planLots: PlanLot[];
  lineStops: LineStop[];
  // Manual furnace reassignments for the Tapping Furnace panel, keyed by
  // TappingGroup.id (stable per-tap id derived from its first lot).
  furnaceOverrides: Record<string, FurnaceId>;
  shiftData: Record<number, ShiftLotData>;
  // Which break schedule (DAY vs FRIDAY) is currently driving the board.
  // Auto-set from the real date on load (persist merge); overridable for
  // the running session via setActiveDay.
  activeDay: DayType;
  informasiLog: InformasiNote[];
  sandPerMixing: number;
}

interface BoardState extends PersistedBoardState {
  addLots: (requests: LotRequest[]) => void;
  setLotProduct: (lotId: string, productCode: ProductCode) => void;
  setLotsProduct: (lotIds: string[], productCode: ProductCode) => void;
  removeLotsByIds: (lotIds: string[]) => void;
  setLotStart: (lotId: string, newStartMin: number) => void;
  addLineStop: (
    startMin: number, endMin: number, keterangan: string,
    counterMeasure?: string, category?: LineStopCategory,
  ) => void;
  updateLineStop: (
    id: string, startMin: number, endMin: number, keterangan: string,
    counterMeasure?: string, category?: LineStopCategory,
  ) => void;
  removeLineStop: (id: string) => void;
  addBreak: (day: DayType, label: string, startMin: number, endMin: number) => void;
  updateBreak: (id: string, startMin: number, endMin: number) => void;
  removeBreak: (id: string) => void;
  setProductionStart: (startMin: number) => void;
  setTaktTime: (tTimeSec: number) => void;
  setShiftNo: (shiftNo: number) => void;
  setActiveDay: (day: DayType) => void;
  setPic: (pic: string) => void;
  setGroup: (group: TeamGroup) => void;
  setSandPerMixing: (n: number) => void;
  addInformasi: (text: string) => void;
  removeInformasi: (id: string) => void;
  applyPlanningTargets: (entries: { productCode: ProductCode; qty: number }[]) => void;
  setTappingFurnaceOverride: (tapId: string, furnaceId: FurnaceId) => void;
  resetBoard: () => void;
}

function recount(planLots: PlanLot[]): LotRequest[] {
  const counts = new Map<ProductCode, number>();
  for (const l of planLots) counts.set(l.productCode, (counts.get(l.productCode) ?? 0) + 1);
  return [...counts.entries()].map(([productCode, count]) => ({ productCode, count }));
}

let uid = 0;
function nextId(prefix: string): string {
  uid += 1;
  return `${prefix}-${Date.now().toString(36)}-${uid}`;
}

// Strips the action functions off the live store, leaving just the data
// useBoardSync needs to push to (or compare against) the server.
export function pickPersistedState(state: BoardState): PersistedBoardState {
  const {
    shiftConfig, shiftPresets, products, planLots, lineStops,
    furnaceOverrides, shiftData, activeDay, informasiLog, sandPerMixing,
  } = state;
  return {
    shiftConfig, shiftPresets, products, planLots, lineStops,
    furnaceOverrides, shiftData, activeDay, informasiLog, sandPerMixing,
  };
}

export const useBoardStore = create<BoardState>()(
  persist(
    (set, get) => ({
      shiftConfig: DEFAULT_SHIFT,
      shiftPresets: { [DEFAULT_SHIFT.shiftNo]: DEFAULT_SHIFT },
      products: DEFAULT_PRODUCTS,
      planLots: [],
      lineStops: [],
      furnaceOverrides: {},
      shiftData: {},
      activeDay: 'DAY',
      informasiLog: [],
      sandPerMixing: 2700,

      addLots: (requests) => {
        const {
          shiftConfig, planLots, lineStops, activeDay,
        } = get();
        const eff = effectiveShift(shiftConfig, activeDay);
        const existing = recount(planLots);
        const merged = [...existing, ...requests];
        const placed = autoPlaceLots(merged, eff);
        set({ planLots: applyLineStops(placed, eff, lineStops) });
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

      // Drop a drag-selected block of lots from the grid (Backspace/Delete on
      // the model picker), same selection mechanism as setLotsProduct.
      removeLotsByIds: (lotIds) => {
        const {
          shiftConfig, planLots, lineStops, activeDay,
        } = get();
        const idSet = new Set(lotIds);
        const remaining = renumberByProduct(planLots.filter((l) => !idSet.has(l.id)));
        set({ planLots: applyLineStops(remaining, effectiveShift(shiftConfig, activeDay), lineStops) });
      },

      // Manual drag-to-reposition on the grid: used when a real-world delay
      // isn't worth a formal LineStop record, or the auto schedule just needs
      // a small nudge. Only the dragged lot and everything after it reflow
      // (from its new time, cascading with the standard pitch/break/line-stop
      // rules) — lots before it are untouched.
      setLotStart: (lotId, newStartMin) => {
        const {
          shiftConfig, planLots, lineStops, activeDay,
        } = get();
        const index = planLots.findIndex((l) => l.id === lotId);
        if (index === -1) return;
        set({
          planLots: reflowFrom(planLots, effectiveShift(shiftConfig, activeDay), lineStops, index, newStartMin),
        });
      },

      addLineStop: (startMin, endMin, keterangan, counterMeasure, category) => {
        const {
          shiftConfig, planLots, lineStops, activeDay,
        } = get();
        const stop = makeLineStop(startMin, endMin, keterangan, counterMeasure, category);
        const nextStops = [...lineStops, stop];
        set({
          lineStops: nextStops,
          planLots: applyLineStops(planLots, effectiveShift(shiftConfig, activeDay), nextStops),
        });
      },

      // Omitted counterMeasure/category preserve the stop's current value, so
      // the inline time/problem-only edit in LineStopPanel can't accidentally
      // wipe a counter measure set via the Input Parameter modal.
      updateLineStop: (id, startMin, endMin, keterangan, counterMeasure, category) => {
        const {
          shiftConfig, planLots, lineStops, activeDay,
        } = get();
        const nextStops = lineStops.map((s) => (
          s.id === id
            ? {
              ...s,
              startMin,
              endMin,
              durationMin: Math.max(0, endMin - startMin),
              keterangan,
              counterMeasure: counterMeasure ?? s.counterMeasure,
              category: category ?? s.category,
            }
            : s
        ));
        set({
          lineStops: nextStops,
          planLots: applyLineStops(planLots, effectiveShift(shiftConfig, activeDay), nextStops),
        });
      },

      removeLineStop: (id) => {
        const {
          shiftConfig, planLots, lineStops, activeDay,
        } = get();
        const nextStops = lineStops.filter((s) => s.id !== id);
        set({
          lineStops: nextStops,
          planLots: applyLineStops(planLots, effectiveShift(shiftConfig, activeDay), nextStops),
        });
      },

      addBreak: (day, label, startMin, endMin) => {
        const {
          shiftConfig, planLots, lineStops, shiftPresets, activeDay,
        } = get();
        const brk = makeBreak(label, startMin, endMin, day);
        const nextShift = { ...shiftConfig, breaks: [...shiftConfig.breaks, brk] };
        set({
          shiftConfig: nextShift,
          shiftPresets: { ...shiftPresets, [nextShift.shiftNo]: nextShift },
          planLots: applyLineStops(planLots, effectiveShift(nextShift, activeDay), lineStops),
        });
      },

      // Locked breaks (Dandori) can't be removed, but their time is still
      // editable — e.g. if the real shift's setup window isn't 10 minutes.
      updateBreak: (id, startMin, endMin) => {
        const {
          shiftConfig, planLots, lineStops, shiftPresets, activeDay,
        } = get();
        const nextShift = {
          ...shiftConfig,
          breaks: shiftConfig.breaks.map((b) => (b.id === id ? { ...b, startMin, endMin } : b)),
        };
        set({
          shiftConfig: nextShift,
          shiftPresets: { ...shiftPresets, [nextShift.shiftNo]: nextShift },
          planLots: applyLineStops(planLots, effectiveShift(nextShift, activeDay), lineStops),
        });
      },

      // Dandori is mandatory: it can never be removed, so every generated
      // lot is guaranteed to start after it, not just when it happens to
      // still be in the list.
      removeBreak: (id) => {
        const {
          shiftConfig, planLots, lineStops, shiftPresets, activeDay,
        } = get();
        const nextShift = {
          ...shiftConfig,
          breaks: shiftConfig.breaks.filter((b) => b.id !== id || b.type === 'DANDORI'),
        };
        set({
          shiftConfig: nextShift,
          shiftPresets: { ...shiftPresets, [nextShift.shiftNo]: nextShift },
          planLots: applyLineStops(planLots, effectiveShift(nextShift, activeDay), lineStops),
        });
      },

      // Changes when the first lot should be generated from (default: right
      // after Dandori). Existing lots reflow immediately, same as breaks.
      setProductionStart: (startMin) => {
        const {
          shiftConfig, planLots, lineStops, shiftPresets, activeDay,
        } = get();
        const nextShift = { ...shiftConfig, productionStartMin: startMin };
        set({
          shiftConfig: nextShift,
          shiftPresets: { ...shiftPresets, [nextShift.shiftNo]: nextShift },
          planLots: applyLineStops(planLots, effectiveShift(nextShift, activeDay), lineStops),
        });
      },

      // Takt Time (editable via Input Planning) drives the lot pitch —
      // pitchSecFromTakt(tTimeSec) in scheduling.ts — so existing lots reflow
      // immediately, same as productionStartMin/breaks.
      setTaktTime: (tTimeSec) => {
        const {
          shiftConfig, planLots, lineStops, shiftPresets, activeDay,
        } = get();
        const nextShift = { ...shiftConfig, tTimeSec };
        set({
          shiftConfig: nextShift,
          shiftPresets: { ...shiftPresets, [nextShift.shiftNo]: nextShift },
          planLots: applyLineStops(planLots, effectiveShift(nextShift, activeDay), lineStops),
        });
      },

      setShiftNo: (shiftNo) => {
        const {
          shiftConfig, shiftPresets, shiftData, planLots, lineStops, furnaceOverrides,
        } = get();
        if (shiftConfig.shiftNo === shiftNo) return;
        // Reuse this shift's previously-saved settings (breaks included) if
        // it's been visited before; otherwise seed it from the template.
        const nextShift = ensureDandori(
          shiftPresets[shiftNo] ?? buildShiftConfig(shiftNo, shiftConfig.pic, shiftConfig.tTimeSec),
        );
        // Lots/line stops/furnace overrides belong to whichever shift they
        // were entered under — stash the shift we're leaving and restore
        // whatever the target shift had saved (empty the first time it's
        // ever visited). Only resetBoard is allowed to actually discard this.
        const nextData: ShiftLotData = shiftData[shiftNo] ?? {
          planLots: [], lineStops: [], furnaceOverrides: {},
        };
        set({
          shiftConfig: nextShift,
          shiftPresets: { ...shiftPresets, [shiftNo]: nextShift },
          shiftData: {
            ...shiftData,
            [shiftConfig.shiftNo]: { planLots, lineStops, furnaceOverrides },
            [shiftNo]: nextData,
          },
          planLots: nextData.planLots,
          lineStops: nextData.lineStops,
          furnaceOverrides: nextData.furnaceOverrides,
        });
      },

      // Switches which day's break schedule drives the board (DAY vs
      // FRIDAY) and immediately reflows existing lots around it. This is a
      // session-only override — reopening the app re-derives the day from
      // the real date (see the persist `merge` below).
      setActiveDay: (day) => {
        const { shiftConfig, planLots, lineStops } = get();
        set({
          activeDay: day,
          planLots: applyLineStops(planLots, effectiveShift(shiftConfig, day), lineStops),
        });
      },

      // PIC and Group are per-shift settings, same persistence pattern as
      // setProductionStart/addBreak: update shiftConfig and remember it in
      // shiftPresets so it survives a shift switch and back.
      setPic: (pic) => {
        const { shiftConfig, shiftPresets } = get();
        const nextShift = { ...shiftConfig, pic };
        set({
          shiftConfig: nextShift,
          shiftPresets: { ...shiftPresets, [nextShift.shiftNo]: nextShift },
        });
      },

      setGroup: (group) => {
        const { shiftConfig, shiftPresets } = get();
        const nextShift = { ...shiftConfig, group };
        set({
          shiftConfig: nextShift,
          shiftPresets: { ...shiftPresets, [nextShift.shiftNo]: nextShift },
        });
      },

      setSandPerMixing: (n) => set({ sandPerMixing: n }),

      addInformasi: (text) => {
        const { shiftConfig, informasiLog } = get();
        const note = { id: nextId('info'), at: nowMinForShift(shiftConfig), text };
        set({ informasiLog: [note, ...informasiLog] });
      },

      removeInformasi: (id) => {
        set({ informasiLog: get().informasiLog.filter((n) => n.id !== id) });
      },

      // Reconciles current lot counts per product to `entries`' target qty in
      // one pure recompute — the same placement engine addLots/removeLots
      // already use, just fed an absolute target instead of a delta. Products
      // not named in `entries` keep their current count. Existing products
      // keep their board order (only their count changes); a product with no
      // lots yet is appended at the end.
      applyPlanningTargets: (entries) => {
        const {
          shiftConfig, planLots, lineStops, activeDay,
        } = get();
        const targetOf = new Map(entries.map((e) => [e.productCode, Math.max(0, e.qty)]));
        const currentCounts = recount(planLots);
        const requests: LotRequest[] = currentCounts.map((c) => ({
          productCode: c.productCode,
          count: targetOf.has(c.productCode) ? targetOf.get(c.productCode)! : c.count,
        }));
        for (const [productCode, qty] of targetOf) {
          if (qty > 0 && !currentCounts.some((c) => c.productCode === productCode)) {
            requests.push({ productCode, count: qty });
          }
        }
        const eff = effectiveShift(shiftConfig, activeDay);
        const placed = autoPlaceLots(requests.filter((r) => r.count > 0), eff);
        set({ planLots: applyLineStops(placed, eff, lineStops) });
      },

      // Reassigns which furnace a specific tap (by its stable id) runs on,
      // overriding the auto-derived cycle assignment — e.g. furnace 3 is
      // down for maintenance, so the operator manually routes that tap
      // elsewhere. Cycling to the next value happens in the UI layer
      // (lib/tapping.ts's nextFurnaceId); this action just records it.
      setTappingFurnaceOverride: (tapId, furnaceId) => {
        const { furnaceOverrides } = get();
        set({ furnaceOverrides: { ...furnaceOverrides, [tapId]: furnaceId } });
      },

      // Reset only clears today's production data (lots + line stops). Shift
      // settings — including any Dandori/Wakom/Istirahat breaks the user has
      // configured — are a one-time setup and stay untouched across resets.
      resetBoard: () =>
        set({
          products: DEFAULT_PRODUCTS,
          planLots: [],
          lineStops: [],
          furnaceOverrides: {},
          shiftData: {},
        }),
    }),
    {
      name: 'shikake-board-v1',
      // Repair any state saved before Dandori became mandatory (or from a
      // session where it was removed under the old rules), and upgrade
      // breaks persisted before they carried a `day` tag (migrateShift
      // tags them DAY and synthesizes a FRIDAY set, then ensures Dandori
      // for both days) — so the fix applies immediately on load rather
      // than only after the next addBreak/removeBreak/setShiftNo call.
      // activeDay is re-derived from the real date on every load.
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<BoardState>) };
        merged.shiftConfig = migrateShift(merged.shiftConfig);
        merged.shiftPresets = Object.fromEntries(
          Object.entries(merged.shiftPresets).map(([k, v]) => [k, migrateShift(v)]),
        );
        merged.activeDay = todayDayType();
        // products is a fixed catalog (nothing ever edits an individual
        // product's fields — resetBoard restores DEFAULT_PRODUCTS too), so
        // always resync it from source instead of trusting a persisted copy
        // that may predate a label/reference-figure change.
        merged.products = DEFAULT_PRODUCTS;
        return merged;
      },
    },
  ),
);
