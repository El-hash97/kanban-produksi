# Input Parameter Modal + Update Planning Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the board's scattered inline add-forms with a single tabbed "Input Parameter" pop-up (Input Problem / Input Planning / Input Informasi / InputPic) plus a separate "Update Planning" pop-up, matching the reference HMI.

**Architecture:** Extend existing domain types (`LineStop`, `Product`, `ShiftConfig`) and the existing pure scheduling engine (`autoPlaceLots`, `applyLineStops`, `renumberByProduct` — unchanged) with new store actions that reuse that engine rather than reimplementing placement logic. Two new modal components follow the exact shell pattern already established by `BreakSettingsModal.tsx`. Existing inline forms are retired; existing read-only tables (line-stop log, model summary) are extended in place, not replaced.

**Tech Stack:** React 18, TypeScript, Zustand (persist), Vitest — same stack already in use, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-13-input-parameter-modal-design.md`

## Global Constraints

- Sand Meas. Time / Mold per Batch are **reference-only** — never passed into `autoPlaceLots`/`applyLineStops`/`LOT_PITCH_SEC`.
- Product code `KAI` is unchanged internally; only `Product.label` becomes `"CAMS"`.
- AV/PE/RQ is a **single-select** value (`LineStopCategory`), not multiple.
- Old persisted state (`shikake-board-v1`) must keep loading without errors — no field introduced here is allowed to crash on state saved before it existed.
- `Input Planning` (modal tab) creates new lots (via `addLots`); `Update Planning` (separate window) reconciles current vs. target qty (via a new `applyPlanningTargets`) and both log to the same `planningHistory`.

## Deliberate simplifications vs. the spec (documented, not silent)

- `LineStop.counterMeasure`/`category` and `makeLineStop`'s/`addLineStop`'s new parameters are **optional with defaults** (`''` / `'AV'`), not required — this avoids rewriting every existing `addLineStop`/`makeLineStop` call site (tests, and the retained inline-edit path) for a field only the new modal actually needs to set. `updateLineStop`'s new params default to *preserving the stop's current value* (not resetting it), so the existing inline ✎ edit (time/problem only) can't accidentally wipe a counter measure set via the modal.
- `applyPlanningTargets` does **not** implement a separate incremental diff/reconciliation algorithm. It builds an absolute target `LotRequest[]` (existing products in their current board order, counts overridden per the targets given) and calls the **existing** `autoPlaceLots` + `applyLineStops`, exactly the same pure-recompute pattern `addLots`/`removeLots` already use. Net effect matches the spec's described behavior (unaffected products keep their lot numbers and relative order; only clock positions after a resized block shift, which is how the engine already behaves everywhere else) with no new algorithm to maintain.

## File Structure

- `src/domain/types.ts` — add `LineStopCategory`, `TeamGroup`, `PlanningEntry`, `PlanningSnapshot`, `InformasiNote` types; extend `LineStop`, `Product`, `ShiftConfig`.
- `src/domain/defaults.ts` — update `DEFAULT_PRODUCTS` (CAMS label + sand/mold reference figures), default `group` in `buildShiftConfig`/`migrateShift`.
- `src/lib/scheduling.ts` — extend `makeLineStop` with optional `counterMeasure`/`category` params (defaults).
- `src/store/boardStore.ts` — new state (`planningHistory`, `informasiLog`, `sandPerMixing`) and actions (`setPic`, `setGroup`, `setSandPerMixing`, `addInformasi`, `logPlanningSnapshot`, `applyPlanningTargets`); extend `addLineStop`/`updateLineStop`.
- `src/components/LineStopPanel.tsx` — remove inline add-form; add Counter Measure + category columns to the log table.
- `src/components/InputParameterModal.tsx` (new) — the 4-tab pop-up (mirrors `BreakSettingsModal.tsx`'s shell).
- `src/components/UpdatePlanningModal.tsx` (new) — the separate Current/Planning/History pop-up.
- `src/components/BoardHeader.tsx` — display `Group`.
- `src/App.tsx` — wire the two new modals + buttons, remove the retired `AddLotsForm`.
- `src/components/AddLotsForm.tsx` — deleted.

---

### Task 1: Domain types + defaults (LineStop, Product, ShiftConfig, Group)

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/defaults.ts`
- Modify: `src/domain/defaults.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `LineStopCategory`, `TeamGroup`, `PlanningEntry`, `PlanningSnapshot`, `InformasiNote` types; `LineStop.counterMeasure: string`, `LineStop.category: LineStopCategory`; `Product.sandMeasTimeMin: number`, `Product.moldPerBatch: number`; `ShiftConfig.group: TeamGroup`. These are consumed by Tasks 2, 3, 4, 6, 7.

- [ ] **Step 1: Write the failing tests**

Append to `src/domain/defaults.test.ts` (inside the existing `describe('defaults', ...)` block, after the `describe('day-type break defaults', ...)` block, before its closing `});`):

```ts
  describe('input parameter defaults', () => {
    it('relabels KAI as CAMS without changing its product code', () => {
      const kai = DEFAULT_PRODUCTS.find((p) => p.code === 'KAI')!;
      expect(kai.label).toBe('CAMS');
    });

    it('carries reference sand/mold figures per product', () => {
      const byCode = Object.fromEntries(DEFAULT_PRODUCTS.map((p) => [p.code, p]));
      expect(byCode['2TR'].sandMeasTimeMin).toBe(9.5);
      expect(byCode['2TR'].moldPerBatch).toBe(7);
      expect(byCode['1TR'].sandMeasTimeMin).toBe(9.5);
      expect(byCode['1TR'].moldPerBatch).toBe(7);
      expect(byCode.KAI.sandMeasTimeMin).toBe(11.5);
      expect(byCode.KAI.moldPerBatch).toBe(5);
      expect(byCode.CRANK.sandMeasTimeMin).toBe(11.5);
      expect(byCode.CRANK.moldPerBatch).toBe(5);
    });

    it('defaults a new shift\'s team group to RED', () => {
      const shift = buildShiftConfig(1);
      expect(shift.group).toBe('RED');
    });

    it('migrateShift backfills a missing group as RED on legacy state', () => {
      const legacy = { ...buildShiftConfig(1) } as Partial<ShiftConfig>;
      delete legacy.group;
      const migrated = migrateShift(legacy as ShiftConfig);
      expect(migrated.group).toBe('RED');
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/domain/defaults.test.ts`
Expected: FAIL — `label` is still `'TR-KAI'`, `sandMeasTimeMin`/`moldPerBatch`/`group` are `undefined`.

- [ ] **Step 3: Extend `src/domain/types.ts`**

Add after `export type DayType = 'DAY' | 'FRIDAY';`:

```ts
export type LineStopCategory = 'AV' | 'PE' | 'RQ';

export type TeamGroup = 'RED' | 'BLUE' | 'GREEN' | 'YELLOW';
```

Change the `LineStop` interface:

```ts
export interface LineStop {
  id: string;
  startMin: number;
  endMin: number;
  durationMin: number;
  keterangan: string;
  counterMeasure: string;
  category: LineStopCategory;
}
```

Change the `Product` interface:

```ts
export interface Product {
  code: ProductCode;
  label: string;
  color: string;
  sandMeasTimeMin: number;
  moldPerBatch: number;
}
```

Change the `ShiftConfig` interface (add one field, keep everything else):

```ts
export interface ShiftConfig {
  startMin: number;
  endMin: number;
  pic: string;
  shiftNo: number;
  tTimeSec: number;
  breaks: Break[];
  productionStartMin: number;
  group: TeamGroup;
}
```

Add at the end of the file:

```ts
export interface PlanningEntry {
  productCode: ProductCode;
  qty: number;
  sandMeasTimeMin: number;
}

export interface PlanningSnapshot {
  id: string;
  at: number;
  entries: PlanningEntry[];
  totalQty: number;
  taktTimeSec: number;
  timeBeginMin: number;
  group: TeamGroup;
  sandPerMixing: number;
}

export interface InformasiNote {
  id: string;
  at: number;
  text: string;
}
```

- [ ] **Step 4: Update `src/domain/defaults.ts`**

Change `DEFAULT_PRODUCTS`:

```ts
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
```

In `buildShiftConfig`, add `group: 'RED',` to the returned object (after `productionStartMin`):

```ts
export function buildShiftConfig(shiftNo: number, pic = 'Bernad', tTimeSec = 48): ShiftConfig {
  const startMin = shiftNo === 2 ? h(19) : h(7);
  return {
    startMin,
    endMin: startMin + SHIFT_LENGTH_MIN,
    pic,
    shiftNo,
    tTimeSec,
    breaks: buildBreaks(shiftNo, startMin),
    productionStartMin: startMin + 10,
    group: 'RED',
  };
}
```

In `migrateShift`, add a group backfill. Change the function to:

```ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/domain/defaults.test.ts`
Expected: PASS (all tests, including the 4 new ones).

- [ ] **Step 6: Verify the whole suite still type-checks**

Run: `npm run build 2>&1 | head -60`
Expected: TypeScript errors in `boardStore.ts`, `LineStopPanel.tsx`, and various test files — these are the files Tasks 2-4 fix. Confirm the errors are exactly "missing `counterMeasure`/`category`/`group`/`sandMeasTimeMin`/`moldPerBatch`" style errors, nothing unrelated.

- [ ] **Step 7: Commit**

```bash
git add src/domain/types.ts src/domain/defaults.ts src/domain/defaults.test.ts
git commit -m "feat: add LineStop category/counter-measure, product sand/mold refs, shift group"
```

---

### Task 2: `makeLineStop` — optional counter measure & category

**Files:**
- Modify: `src/lib/scheduling.ts`
- Create: `src/lib/scheduling.makelinestop.test.ts`

**Interfaces:**
- Consumes: `LineStopCategory` (Task 1).
- Produces: `makeLineStop(startMin, endMin, keterangan, counterMeasure?, category?): LineStop` — consumed by Task 3's `addLineStop`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { makeLineStop } from './scheduling';

describe('makeLineStop', () => {
  it('defaults counterMeasure to empty string and category to AV when omitted', () => {
    const stop = makeLineStop(430, 440, 'Sand jam');
    expect(stop.counterMeasure).toBe('');
    expect(stop.category).toBe('AV');
  });

  it('stores counterMeasure and category when given', () => {
    const stop = makeLineStop(430, 440, 'Sand jam', 'Bersihkan hopper', 'PE');
    expect(stop.counterMeasure).toBe('Bersihkan hopper');
    expect(stop.category).toBe('PE');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/scheduling.makelinestop.test.ts`
Expected: FAIL — `stop.counterMeasure`/`stop.category` are `undefined`.

- [ ] **Step 3: Update `makeLineStop` in `src/lib/scheduling.ts`**

Add `LineStopCategory` to the type-only import at the top of the file:

```ts
import type {
  Break, DayType, LineStop, LineStopCategory, LotRequest, PlanLot, ProductCode, Range, ShiftConfig,
} from '../domain/types';
```

Replace the `makeLineStop` function:

```ts
export function makeLineStop(
  startMin: number,
  endMin: number,
  keterangan: string,
  counterMeasure = '',
  category: LineStopCategory = 'AV',
): LineStop {
  return {
    id: makeId('ls'),
    startMin,
    endMin,
    durationMin: Math.max(0, endMin - startMin),
    keterangan,
    counterMeasure,
    category,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/scheduling.makelinestop.test.ts src/lib/scheduling.linestop.test.ts`
Expected: PASS — the 2 new tests, plus the 4 pre-existing `scheduling.linestop.test.ts` tests (their `makeLineStop(424, 434, '...')`-style 3-arg calls keep working via the new defaults).

- [ ] **Step 5: Commit**

```bash
git add src/lib/scheduling.ts src/lib/scheduling.makelinestop.test.ts
git commit -m "feat: makeLineStop accepts optional counter measure and category"
```

---

### Task 3: Board store — planning history, informasi log, group/PIC setters, applyPlanningTargets

**Files:**
- Modify: `src/store/boardStore.ts`
- Modify: `src/store/boardStore.test.ts`

**Interfaces:**
- Consumes: `PlanningEntry`, `PlanningSnapshot`, `InformasiNote`, `TeamGroup`, `LineStopCategory` (Task 1); `makeLineStop` (Task 2); `nowMinForShift` (existing, `src/lib/time.ts`); `autoPlaceLots`, `applyLineStops`, `renumberByProduct`, `effectiveShift` (existing, unchanged).
- Produces (consumed by Tasks 4, 6, 7):
  - State: `planningHistory: PlanningSnapshot[]`, `informasiLog: InformasiNote[]`, `sandPerMixing: number`.
  - `setPic(pic: string): void`
  - `setGroup(group: TeamGroup): void`
  - `setSandPerMixing(n: number): void`
  - `addInformasi(text: string): void`
  - `logPlanningSnapshot(entries: PlanningEntry[], group: TeamGroup, timeBeginMin: number): void`
  - `applyPlanningTargets(entries: { productCode: ProductCode; qty: number }[]): void`
  - `addLineStop(startMin, endMin, keterangan, counterMeasure?, category?): void` (extended)
  - `updateLineStop(id, startMin, endMin, keterangan, counterMeasure?, category?): void` (extended — omitted params preserve the stop's current value)

- [ ] **Step 1: Write the failing tests**

Update the `beforeEach` reset in `src/store/boardStore.test.ts` to include the 3 new top-level fields (Zustand's `setState` without `replace:true` is a shallow merge, so without this, one test's `planningHistory`/`informasiLog`/`sandPerMixing` mutation would leak into the next test):

```ts
beforeEach(() => {
  localStorage.clear();
  useBoardStore.setState({
    shiftConfig: DEFAULT_SHIFT,
    shiftPresets: { [DEFAULT_SHIFT.shiftNo]: DEFAULT_SHIFT },
    products: DEFAULT_PRODUCTS,
    planLots: [],
    lineStops: [],
    furnaceOverrides: {},
    activeDay: 'DAY',
    planningHistory: [],
    informasiLog: [],
    sandPerMixing: 2700,
  });
});
```

Append these tests inside the existing `describe('boardStore', ...)` block, before its closing `});`:

```ts
  it('setPic updates the PIC name for the active shift', () => {
    useBoardStore.getState().setPic('Rudi');
    expect(useBoardStore.getState().shiftConfig.pic).toBe('Rudi');
  });

  it('setGroup updates the team group for the active shift', () => {
    useBoardStore.getState().setGroup('BLUE');
    expect(useBoardStore.getState().shiftConfig.group).toBe('BLUE');
  });

  it('setSandPerMixing updates the sand-per-mixing setting', () => {
    useBoardStore.getState().setSandPerMixing(3000);
    expect(useBoardStore.getState().sandPerMixing).toBe(3000);
  });

  it('addInformasi records a note with the newest first', () => {
    useBoardStore.getState().addInformasi('Mesin A maintenance');
    useBoardStore.getState().addInformasi('Ganti sand hopper');
    const log = useBoardStore.getState().informasiLog;
    expect(log.map((n) => n.text)).toEqual(['Ganti sand hopper', 'Mesin A maintenance']);
  });

  it('logPlanningSnapshot records a planning entry with the newest first', () => {
    useBoardStore.getState().logPlanningSnapshot(
      [{ productCode: '2TR', qty: 10, sandMeasTimeMin: 9.5 }],
      'RED',
      430,
    );
    const [snap] = useBoardStore.getState().planningHistory;
    expect(snap.totalQty).toBe(10);
    expect(snap.group).toBe('RED');
    expect(snap.timeBeginMin).toBe(430);
  });

  it('addLineStop stores counterMeasure and category when given', () => {
    useBoardStore.getState().addLineStop(430, 440, 'Sand jam', 'Bersihkan hopper', 'AV');
    const stop = useBoardStore.getState().lineStops[0];
    expect(stop.counterMeasure).toBe('Bersihkan hopper');
    expect(stop.category).toBe('AV');
  });

  it('addLineStop defaults counterMeasure/category when omitted (legacy callers)', () => {
    useBoardStore.getState().addLineStop(430, 440, 'Sand jam');
    const stop = useBoardStore.getState().lineStops[0];
    expect(stop.counterMeasure).toBe('');
    expect(stop.category).toBe('AV');
  });

  it('updateLineStop preserves counterMeasure/category when only editing time/problem', () => {
    useBoardStore.getState().addLineStop(430, 440, 'Sand jam', 'Bersihkan hopper', 'PE');
    const id = useBoardStore.getState().lineStops[0].id;
    useBoardStore.getState().updateLineStop(id, 430, 445, 'Sand jam parah');
    const stop = useBoardStore.getState().lineStops[0];
    expect(stop.counterMeasure).toBe('Bersihkan hopper');
    expect(stop.category).toBe('PE');
    expect(stop.endMin).toBe(445);
  });

  describe('applyPlanningTargets', () => {
    it('grows a product already on the board, keeping a later untouched product\'s order', () => {
      useBoardStore.getState().addLots([
        { productCode: '2TR', count: 2 }, { productCode: 'CRANK', count: 2 },
      ]);
      useBoardStore.getState().applyPlanningTargets([{ productCode: '2TR', qty: 4 }]);
      const lots = useBoardStore.getState().planLots;
      expect(lots.map((l) => `${l.productCode}#${l.lotNo}`)).toEqual([
        '2TR#1', '2TR#2', '2TR#3', '2TR#4', 'CRANK#1', 'CRANK#2',
      ]);
    });

    it('shrinks a product by dropping its highest-numbered lots', () => {
      useBoardStore.getState().addLots([{ productCode: '2TR', count: 4 }]);
      useBoardStore.getState().applyPlanningTargets([{ productCode: '2TR', qty: 2 }]);
      const lots = useBoardStore.getState().planLots;
      expect(lots.map((l) => l.lotNo)).toEqual([1, 2]);
    });

    it('leaves an earlier untouched product\'s lot positions unchanged', () => {
      useBoardStore.getState().addLots([
        { productCode: '2TR', count: 2 }, { productCode: 'CRANK', count: 2 },
      ]);
      const before = useBoardStore.getState().planLots
        .filter((l) => l.productCode === '2TR').map((l) => l.startMin);
      useBoardStore.getState().applyPlanningTargets([{ productCode: 'CRANK', qty: 3 }]);
      const after = useBoardStore.getState().planLots
        .filter((l) => l.productCode === '2TR').map((l) => l.startMin);
      expect(after).toEqual(before);
    });
  });
```

Also update the 4 existing `addLineStop(430, 440, '...')` / `addLineStop(1200, 1210, '...')` calls elsewhere in this file — **no change needed**, they already compile against the new optional-params signature unchanged.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/store/boardStore.test.ts`
Expected: FAIL — `setPic`, `setGroup`, `setSandPerMixing`, `addInformasi`, `logPlanningSnapshot`, `applyPlanningTargets` are not functions; `lineStops[0].counterMeasure`/`category` undefined.

- [ ] **Step 3: Update `src/store/boardStore.ts`**

Update the type-only import:

```ts
import type {
  DayType, FurnaceId, InformasiNote, LineStop, LineStopCategory, LotRequest, PlanLot,
  PlanningEntry, PlanningSnapshot, Product, ProductCode, ShiftConfig, TeamGroup,
} from '../domain/types';
```

Add `nowMinForShift` to the `lib/time` import:

```ts
import { nowMinForShift, todayDayType } from '../lib/time';
```

Add a tiny local id helper right after the existing `recount` function (same pattern as `scheduling.ts`'s `makeId`, kept local since only this file needs it for history/log entries):

```ts
let uid = 0;
function nextId(prefix: string): string {
  uid += 1;
  return `${prefix}-${Date.now().toString(36)}-${uid}`;
}
```

Extend the `BoardState` interface — add fields after `activeDay: DayType;`:

```ts
  planningHistory: PlanningSnapshot[];
  informasiLog: InformasiNote[];
  sandPerMixing: number;
```

Change the `addLineStop`/`updateLineStop` interface lines:

```ts
  addLineStop: (
    startMin: number, endMin: number, keterangan: string,
    counterMeasure?: string, category?: LineStopCategory,
  ) => void;
  updateLineStop: (
    id: string, startMin: number, endMin: number, keterangan: string,
    counterMeasure?: string, category?: LineStopCategory,
  ) => void;
```

Add new action signatures after `setActiveDay: (day: DayType) => void;`:

```ts
  setPic: (pic: string) => void;
  setGroup: (group: TeamGroup) => void;
  setSandPerMixing: (n: number) => void;
  addInformasi: (text: string) => void;
  logPlanningSnapshot: (entries: PlanningEntry[], group: TeamGroup, timeBeginMin: number) => void;
  applyPlanningTargets: (entries: { productCode: ProductCode; qty: number }[]) => void;
```

Add initial state after `activeDay: 'DAY',`:

```ts
      planningHistory: [],
      informasiLog: [],
      sandPerMixing: 2700,
```

Replace the `addLineStop` action:

```ts
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
```

Replace the `updateLineStop` action (omitted `counterMeasure`/`category` preserve the stop's current value, so the inline time/problem-only edit in `LineStopPanel` can't wipe them):

```ts
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
```

Add new actions right after `setActiveDay` (before `setTappingFurnaceOverride`):

```ts
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

      logPlanningSnapshot: (entries, group, timeBeginMin) => {
        const { shiftConfig, sandPerMixing, planningHistory } = get();
        const snapshot: PlanningSnapshot = {
          id: nextId('plan'),
          at: nowMinForShift(shiftConfig),
          entries,
          totalQty: entries.reduce((sum, e) => sum + e.qty, 0),
          taktTimeSec: shiftConfig.tTimeSec,
          timeBeginMin,
          group,
          sandPerMixing,
        };
        set({ planningHistory: [snapshot, ...planningHistory] });
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
```

Update the persist `merge` function's `activeDay` line — no change needed there (`migrateShift` from Task 1 already backfills `group`); confirm the function still reads:

```ts
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<BoardState>) };
        merged.shiftConfig = migrateShift(merged.shiftConfig);
        merged.shiftPresets = Object.fromEntries(
          Object.entries(merged.shiftPresets).map(([k, v]) => [k, migrateShift(v)]),
        );
        merged.activeDay = todayDayType();
        return merged;
      },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/store/boardStore.test.ts`
Expected: PASS (all tests, including the new ones).

- [ ] **Step 5: Run the whole suite + build**

Run: `npm test && npm run build`
Expected: PASS. The only remaining build errors, if any, should be in `LineStopPanel.tsx` (Task 4) and `App.tsx`/`AddLotsForm.tsx` (Task 5) — components that haven't been updated yet for the type changes.

- [ ] **Step 6: Commit**

```bash
git add src/store/boardStore.ts src/store/boardStore.test.ts
git commit -m "feat: planning history, informasi log, PIC/Group setters, applyPlanningTargets"
```

---

### Task 4: LineStopPanel — retire inline add-form, show Counter Measure & category

**Files:**
- Modify: `src/components/LineStopPanel.tsx`

**Interfaces:**
- Consumes: `useBoardStore` state/actions (existing + Task 3's extended `updateLineStop`), `toHHmm` (existing), `TimeSelect` (existing).
- Produces: nothing new — this is a leaf UI component.

- [ ] **Step 1: Rewrite `src/components/LineStopPanel.tsx`**

The add-form (`start`/`end`/`ket` state, the `submit` function, and the "+ Line Stop" form block) is removed — line stops are now only created via `InputParameterModal`'s Input Problem tab (Task 6). The inline ✎ edit flow is kept unchanged. Two new read-only columns are added to the table.

```tsx
import { useState } from 'react';
import { useBoardStore } from '../store/boardStore';
import { toHHmm } from '../lib/time';
import TimeSelect from './TimeSelect';

export default function LineStopPanel() {
  const shiftConfig = useBoardStore((s) => s.shiftConfig);
  const lineStops = useBoardStore((s) => s.lineStops);
  const updateLineStop = useBoardStore((s) => s.updateLineStop);
  const removeLineStop = useBoardStore((s) => s.removeLineStop);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState(0);
  const [editEnd, setEditEnd] = useState(0);
  const [editKet, setEditKet] = useState('');

  const startEdit = (id: string, s: number, e: number, k: string) => {
    setEditingId(id);
    setEditStart(s);
    setEditEnd(e);
    setEditKet(k);
  };

  const saveEdit = () => {
    if (!editingId || editEnd <= editStart || !editKet.trim()) return;
    updateLineStop(editingId, editStart, editEnd, editKet.trim());
    setEditingId(null);
  };

  return (
    <div className="text-white text-xs">
      <div className="bg-red-900/40 px-2 py-1 font-bold text-green-400">INFORMASI LINE STOP</div>

      <table className="w-full text-[11px]">
        <thead className="text-green-400">
          <tr className="border-b border-red-600/40">
            <th className="text-left px-2 py-1">TIME</th>
            <th className="text-left px-2 py-1">DUR</th>
            <th className="text-left px-2 py-1">PROBLEM</th>
            <th className="text-left px-2 py-1">COUNTER MEASURE</th>
            <th className="px-2 py-1">CAT</th>
            <th className="px-2 py-1"></th>
          </tr>
        </thead>
        <tbody>
          {lineStops.length === 0 && (
            <tr><td colSpan={6} className="px-2 py-2 text-gray-500">Belum ada line stop.</td></tr>
          )}
          {lineStops.map((s) => (
            <tr key={s.id} className="border-b border-red-600/20">
              {editingId === s.id ? (
                <>
                  <td className="px-2 py-1" colSpan={2}>
                    <span className="inline-flex items-center gap-2">
                      <TimeSelect value={editStart} onChange={setEditStart} shift={shiftConfig} />
                      <span>–</span>
                      <TimeSelect value={editEnd} onChange={setEditEnd} shift={shiftConfig} />
                    </span>
                  </td>
                  <td className="px-2 py-1">
                    <input
                      className="bg-black border border-cyan-500 px-1 w-full"
                      value={editKet}
                      onChange={(e) => setEditKet(e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-1 text-gray-500">{s.counterMeasure ?? ''}</td>
                  <td className="px-2 py-1 text-center text-gray-500">{s.category ?? 'AV'}</td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">
                    <button className="text-green-400 hover:text-green-200 mr-2" onClick={saveEdit}>✓</button>
                    <button className="text-gray-400 hover:text-gray-200" onClick={() => setEditingId(null)}>✕</button>
                  </td>
                </>
              ) : (
                <>
                  <td className="px-2 py-1 tabular-nums">{toHHmm(s.startMin)}–{toHHmm(s.endMin)}</td>
                  <td className="px-2 py-1">{s.durationMin}'</td>
                  <td className="px-2 py-1">{s.keterangan}</td>
                  <td className="px-2 py-1">{s.counterMeasure ?? ''}</td>
                  <td className="px-2 py-1 text-center">{s.category ?? 'AV'}</td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">
                    <button
                      className="text-cyan-400 hover:text-cyan-200 mr-2"
                      title="Ubah"
                      onClick={() => startEdit(s.id, s.startMin, s.endMin, s.keterangan)}
                    >
                      ✎
                    </button>
                    <button className="text-red-400 hover:text-red-200" onClick={() => removeLineStop(s.id)}>✕</button>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: `LineStopPanel.tsx` no longer errors. Remaining errors, if any, are in `App.tsx`/`AddLotsForm.tsx` (Task 5).

- [ ] **Step 3: Commit**

```bash
git add src/components/LineStopPanel.tsx
git commit -m "feat: retire inline line-stop add-form, show counter measure and category"
```

---

### Task 5: App wiring — Input Parameter / Update Planning buttons, retire AddLotsForm, show Group

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/BoardHeader.tsx`
- Delete: `src/components/AddLotsForm.tsx`

**Interfaces:**
- Consumes: `InputParameterModal` (Task 6, created next — this task references it before it exists, which is fine since Task 6 immediately follows and both are verified together in Task 6's build step), `UpdatePlanningModal` (Task 7), `BreakSettingsModal` (existing), `useBoardStore` (existing + Task 3's `resetBoard`).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Delete `src/components/AddLotsForm.tsx`**

Its "+ LOT" and "JAM MULAI PRODUKSI" functionality is superseded by `InputParameterModal`'s Input Planning tab (Task 6); its Reset button moves into `App.tsx`'s utility row below.

- [ ] **Step 2: Rewrite `src/App.tsx`**

```tsx
import { useState } from 'react';
import BoardHeader from './components/BoardHeader';
import TimeGrid from './components/TimeGrid';
import LineStopPanel from './components/LineStopPanel';
import ModelSummary from './components/ModelSummary';
import BreakSettingsModal from './components/BreakSettingsModal';
import InputParameterModal from './components/InputParameterModal';
import UpdatePlanningModal from './components/UpdatePlanningModal';
import TappingPanel from './components/TappingPanel';
import { useBoardStore } from './store/boardStore';

const TABS = [
  { key: 'linestop', label: 'INFORMASI LINE STOP' },
  { key: 'model', label: 'MODEL' },
  { key: 'tapping', label: 'URUTAN TAPPING FURNACE' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function App() {
  const [tab, setTab] = useState<TabKey>('linestop');
  const [showSettings, setShowSettings] = useState(false);
  const [showInputParameter, setShowInputParameter] = useState(false);
  const [showUpdatePlanning, setShowUpdatePlanning] = useState(false);
  const activeDay = useBoardStore((s) => s.activeDay);
  const setActiveDay = useBoardStore((s) => s.setActiveDay);
  const resetBoard = useBoardStore((s) => s.resetBoard);

  return (
    <div className="min-h-full bg-black p-2 text-white space-y-1">
      <BoardHeader />
      <TimeGrid />

      <div className="border-2 border-cyan-500/60">
        <div className="flex items-center flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`px-3 py-1 text-xs font-bold border-r border-cyan-500/40 ${
                tab === t.key ? 'bg-cyan-900/50 text-green-400' : 'text-gray-400 hover:text-white'
              }`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 px-2 py-1 text-xs">
            <span className="text-gray-400">HARI:</span>
            <button
              className={`px-2 py-0.5 rounded font-bold ${activeDay === 'DAY' ? 'bg-cyan-700 text-white' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setActiveDay('DAY')}
            >
              DAY
            </button>
            <button
              className={`px-2 py-0.5 rounded font-bold ${activeDay === 'FRIDAY' ? 'bg-cyan-700 text-white' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setActiveDay('FRIDAY')}
            >
              FRIDAY
            </button>
            <button
              className="ml-2 px-2 py-0.5 rounded bg-cyan-700 hover:bg-cyan-600"
              onClick={() => setShowInputParameter(true)}
            >
              ⚙ Input Parameter
            </button>
            <button
              className="px-2 py-0.5 rounded bg-cyan-700 hover:bg-cyan-600"
              onClick={() => setShowUpdatePlanning(true)}
            >
              📋 Update Planning
            </button>
            <button
              className="px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600"
              title="Setting Dandori/Wakom/Istirahat"
              onClick={() => setShowSettings(true)}
            >
              ⚙ Setting
            </button>
            <button className="px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600" onClick={resetBoard}>
              Reset
            </button>
          </div>
        </div>
        {tab === 'linestop' && <LineStopPanel />}
        {tab === 'model' && <ModelSummary />}
        {tab === 'tapping' && <TappingPanel />}
      </div>

      {showSettings && <BreakSettingsModal onClose={() => setShowSettings(false)} />}
      {showInputParameter && <InputParameterModal onClose={() => setShowInputParameter(false)} />}
      {showUpdatePlanning && <UpdatePlanningModal onClose={() => setShowUpdatePlanning(false)} />}
    </div>
  );
}
```

- [ ] **Step 3: Add Group display to `src/components/BoardHeader.tsx`**

Add one line after the existing `<div>T.TIME : {shift.tTimeSec}</div>`:

```tsx
        <div>T.TIME : {shift.tTimeSec}</div>
        <div>GROUP : <span className="text-cyan-300">{shift.group}</span></div>
```

- [ ] **Step 4: This task cannot build yet**

`App.tsx` imports `InputParameterModal` and `UpdatePlanningModal`, which don't exist until Tasks 6-7. Do not run `npm run build` after this task — proceed directly to Task 6, then verify build after Task 7 (Task 7's Step covers this).

- [ ] **Step 5: Commit**

```bash
git add -A src/App.tsx src/components/BoardHeader.tsx
git rm src/components/AddLotsForm.tsx
git commit -m "feat: wire Input Parameter / Update Planning buttons, retire AddLotsForm, show Group"
```

---

### Task 6: `InputParameterModal.tsx` — 4-tab pop-up

**Files:**
- Create: `src/components/InputParameterModal.tsx`

**Interfaces:**
- Consumes: `useBoardStore` (Task 3's `setPic`, `setGroup`, `setSandPerMixing`, `addInformasi`, `logPlanningSnapshot`, `addLineStop`, `setProductionStart`, `addLots`, `setShiftNo`; existing `shiftConfig`, `products`, `informasiLog`, `sandPerMixing`); `TimeSelect` (existing); `LineStopCategory`, `TeamGroup`, `PlanningEntry`, `ProductCode` (Task 1).
- Produces: `<InputParameterModal onClose={() => void} />`, consumed by `App.tsx` (Task 5).

- [ ] **Step 1: Write `src/components/InputParameterModal.tsx`**

```tsx
import { useState } from 'react';
import { useBoardStore } from '../store/boardStore';
import type {
  LineStopCategory, PlanningEntry, ProductCode, TeamGroup,
} from '../domain/types';
import TimeSelect from './TimeSelect';

const GROUPS: TeamGroup[] = ['RED', 'BLUE', 'GREEN', 'YELLOW'];
const SAND_TIME_OPTIONS = [8.5, 9.5, 10.5, 11.5, 12.5];
const ZERO_QTY: Record<ProductCode, number> = {
  '2TR': 0, '1TR': 0, KAI: 0, CRANK: 0,
};

function InputProblemTab() {
  const shiftConfig = useBoardStore((s) => s.shiftConfig);
  const addLineStop = useBoardStore((s) => s.addLineStop);
  const [start, setStart] = useState(shiftConfig.startMin);
  const [end, setEnd] = useState(shiftConfig.startMin + 5);
  const [problem, setProblem] = useState('');
  const [counterMeasure, setCounterMeasure] = useState('');
  const [category, setCategory] = useState<LineStopCategory>('AV');

  const submit = () => {
    if (end <= start || !problem.trim()) return;
    addLineStop(start, end, problem.trim(), counterMeasure.trim(), category);
    setProblem('');
    setCounterMeasure('');
  };

  return (
    <div className="p-3 space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span>Mulai</span><TimeSelect value={start} onChange={setStart} shift={shiftConfig} />
        <span>Selesai</span><TimeSelect value={end} onChange={setEnd} shift={shiftConfig} />
      </div>
      <textarea
        className="w-full bg-black border border-cyan-500 px-2 py-1"
        rows={2}
        placeholder="Problem"
        value={problem}
        onChange={(e) => setProblem(e.target.value)}
      />
      <textarea
        className="w-full bg-black border border-cyan-500 px-2 py-1"
        rows={2}
        placeholder="Counter Measure"
        value={counterMeasure}
        onChange={(e) => setCounterMeasure(e.target.value)}
      />
      <div className="flex gap-4">
        {(['AV', 'PE', 'RQ'] as const).map((c) => (
          <label key={c} className="flex items-center gap-1">
            <input
              type="radio"
              name="lsCategory"
              checked={category === c}
              onChange={() => setCategory(c)}
            />
            {c}
          </label>
        ))}
      </div>
      <button className="bg-red-700 hover:bg-red-600 px-3 py-1 rounded" onClick={submit}>
        INSERT LINE STOP
      </button>
    </div>
  );
}

function InputPlanningTab() {
  const products = useBoardStore((s) => s.products);
  const shiftConfig = useBoardStore((s) => s.shiftConfig);
  const sandPerMixing = useBoardStore((s) => s.sandPerMixing);
  const addLots = useBoardStore((s) => s.addLots);
  const setProductionStart = useBoardStore((s) => s.setProductionStart);
  const setGroup = useBoardStore((s) => s.setGroup);
  const setSandPerMixing = useBoardStore((s) => s.setSandPerMixing);
  const logPlanningSnapshot = useBoardStore((s) => s.logPlanningSnapshot);

  const [qty, setQty] = useState<Record<ProductCode, number>>(ZERO_QTY);
  const [sandTime, setSandTime] = useState<Record<ProductCode, number>>(
    () => Object.fromEntries(products.map((p) => [p.code, p.sandMeasTimeMin])) as Record<ProductCode, number>,
  );
  const [timeBegin, setTimeBegin] = useState(shiftConfig.productionStartMin);
  const [group, setGroupLocal] = useState<TeamGroup>(shiftConfig.group);
  const [sandQty, setSandQty] = useState(sandPerMixing);

  const total = Object.values(qty).reduce((a, b) => a + b, 0);

  const submit = () => {
    const entries: PlanningEntry[] = products
      .map((p) => ({ productCode: p.code, qty: qty[p.code], sandMeasTimeMin: sandTime[p.code] }))
      .filter((e) => e.qty > 0);
    if (entries.length === 0) return;
    setGroup(group);
    setProductionStart(timeBegin);
    setSandPerMixing(sandQty);
    addLots(entries.map((e) => ({ productCode: e.productCode, count: e.qty })));
    logPlanningSnapshot(entries, group, timeBegin);
    setQty(ZERO_QTY);
  };

  return (
    <div className="p-3 space-y-2 text-xs">
      <table className="w-full">
        <thead className="text-green-400">
          <tr>
            <th className="text-left">MODEL</th>
            <th>QTY</th>
            <th>SAND MEAS. TIME</th>
            <th>MOLD/BATCH</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.code}>
              <td>{p.label}</td>
              <td>
                <input
                  type="number"
                  min={0}
                  className="bg-black border border-cyan-500 w-16 px-1"
                  value={qty[p.code]}
                  onChange={(e) => setQty((q) => ({ ...q, [p.code]: Math.max(0, Number(e.target.value)) }))}
                />
              </td>
              <td>
                <select
                  className="bg-black border border-cyan-500 px-1"
                  value={sandTime[p.code]}
                  onChange={(e) => setSandTime((s) => ({ ...s, [p.code]: Number(e.target.value) }))}
                >
                  {SAND_TIME_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </td>
              <td className="text-center">{p.moldPerBatch}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-3">
        <span>TOTAL: <b>{total}</b></span>
        <span>TAKT TIME: <b>{shiftConfig.tTimeSec}</b></span>
        <span>TIME BEGIN</span>
        <TimeSelect value={timeBegin} onChange={setTimeBegin} shift={shiftConfig} />
        <span>GROUP</span>
        <select
          className="bg-black border border-cyan-500 px-1"
          value={group}
          onChange={(e) => setGroupLocal(e.target.value as TeamGroup)}
        >
          {GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <span>JML.SAND/MIXING</span>
        <input
          type="number"
          className="bg-black border border-cyan-500 w-20 px-1"
          value={sandQty}
          onChange={(e) => setSandQty(Number(e.target.value))}
        />
      </div>
      <button className="bg-cyan-700 hover:bg-cyan-600 px-3 py-1 rounded" onClick={submit}>
        INSERT PLAN
      </button>
    </div>
  );
}

function InputInformasiTab() {
  const informasiLog = useBoardStore((s) => s.informasiLog);
  const addInformasi = useBoardStore((s) => s.addInformasi);
  const [text, setText] = useState('');

  const submit = () => {
    if (!text.trim()) return;
    addInformasi(text.trim());
    setText('');
  };

  return (
    <div className="p-3 space-y-2 text-xs">
      <textarea
        className="w-full bg-black border border-cyan-500 px-2 py-1"
        rows={3}
        placeholder="Informasi"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button className="bg-cyan-700 hover:bg-cyan-600 px-3 py-1 rounded" onClick={submit}>
        INSERT INFORMASI
      </button>
      <ul className="space-y-1 max-h-40 overflow-auto">
        {informasiLog.length === 0 && <li className="text-gray-500">Belum ada informasi.</li>}
        {informasiLog.map((n) => (
          <li key={n.id} className="border-b border-cyan-500/20 py-1">{n.text}</li>
        ))}
      </ul>
    </div>
  );
}

function InputPicTab() {
  const shiftConfig = useBoardStore((s) => s.shiftConfig);
  const setPic = useBoardStore((s) => s.setPic);
  const setGroup = useBoardStore((s) => s.setGroup);
  const setShiftNo = useBoardStore((s) => s.setShiftNo);
  const [pic, setPicLocal] = useState(shiftConfig.pic);
  const [shiftNo, setShiftNoLocal] = useState(shiftConfig.shiftNo);
  const [group, setGroupLocal] = useState<TeamGroup>(shiftConfig.group);

  const submit = () => {
    setPic(pic);
    setGroup(group);
    if (shiftNo !== shiftConfig.shiftNo) setShiftNo(shiftNo);
  };

  return (
    <div className="p-3 space-y-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="w-16">PIC</span>
        <input
          className="bg-black border border-cyan-500 px-1 flex-1"
          value={pic}
          onChange={(e) => setPicLocal(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="w-16">SHIFT</span>
        <select
          className="bg-black border border-cyan-500 px-1"
          value={shiftNo}
          onChange={(e) => setShiftNoLocal(Number(e.target.value))}
        >
          <option value={1}>1 (07:00–19:00)</option>
          <option value={2}>2 (19:00–07:00)</option>
        </select>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-16">GROUP</span>
        <select
          className="bg-black border border-cyan-500 px-1"
          value={group}
          onChange={(e) => setGroupLocal(e.target.value as TeamGroup)}
        >
          {GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>
      <button className="bg-cyan-700 hover:bg-cyan-600 px-3 py-1 rounded" onClick={submit}>
        UPDATE
      </button>
    </div>
  );
}

const TABS = [
  { key: 'problem', label: 'Input Problem' },
  { key: 'planning', label: 'Input Planning' },
  { key: 'informasi', label: 'Input Informasi' },
  { key: 'pic', label: 'InputPic' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default function InputParameterModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<TabKey>('problem');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="bg-black border-2 border-cyan-500 text-white text-xs max-w-2xl w-[90vw] max-h-[85vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between bg-cyan-900/40 px-3 py-2 border-b border-cyan-500/50">
          <span className="font-bold text-green-400">INPUT PARAMETER</span>
          <button className="text-gray-300 hover:text-white text-base" onClick={onClose} title="Tutup">✕</button>
        </div>
        <div className="flex border-b border-cyan-500/40">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`px-3 py-1 font-bold border-r border-cyan-500/30 ${
                tab === t.key ? 'bg-cyan-900/50 text-green-400' : 'text-gray-400 hover:text-white'
              }`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'problem' && <InputProblemTab />}
        {tab === 'planning' && <InputPlanningTab />}
        {tab === 'informasi' && <InputInformasiTab />}
        {tab === 'pic' && <InputPicTab />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/InputParameterModal.tsx
git commit -m "feat: add Input Parameter 4-tab modal"
```

---

### Task 7: `UpdatePlanningModal.tsx` — separate window

**Files:**
- Create: `src/components/UpdatePlanningModal.tsx`

**Interfaces:**
- Consumes: `useBoardStore` (`products`, `planLots`, `planningHistory`, `sandPerMixing`, `setSandPerMixing`, `applyPlanningTargets` — all from Task 3); `ProductCode` (Task 1).
- Produces: `<UpdatePlanningModal onClose={() => void} />`, consumed by `App.tsx` (Task 5).

- [ ] **Step 1: Write `src/components/UpdatePlanningModal.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { useBoardStore } from '../store/boardStore';
import type { ProductCode } from '../domain/types';

const HISTORY_COLUMNS: ProductCode[] = ['1TR', '2TR', 'KAI', 'CRANK'];

export default function UpdatePlanningModal({ onClose }: { onClose: () => void }) {
  const products = useBoardStore((s) => s.products);
  const planLots = useBoardStore((s) => s.planLots);
  const planningHistory = useBoardStore((s) => s.planningHistory);
  const sandPerMixing = useBoardStore((s) => s.sandPerMixing);
  const setSandPerMixing = useBoardStore((s) => s.setSandPerMixing);
  const applyPlanningTargets = useBoardStore((s) => s.applyPlanningTargets);

  const currentCounts = useMemo(() => {
    const counts: Record<ProductCode, number> = {
      '2TR': 0, '1TR': 0, KAI: 0, CRANK: 0,
    };
    for (const l of planLots) counts[l.productCode] += 1;
    return counts;
  }, [planLots]);

  const [target, setTarget] = useState<Record<ProductCode, number>>(currentCounts);
  const [sandQty, setSandQty] = useState(sandPerMixing);

  const submit = () => {
    applyPlanningTargets(products.map((p) => ({ productCode: p.code, qty: target[p.code] })));
    setSandPerMixing(sandQty);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="bg-black border-2 border-cyan-500 text-white text-xs max-w-2xl w-[90vw] max-h-[85vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between bg-cyan-900/40 px-3 py-2 border-b border-cyan-500/50">
          <span className="font-bold text-green-400">UPDATE PLANNING</span>
          <button className="text-gray-300 hover:text-white text-base" onClick={onClose} title="Tutup">✕</button>
        </div>
        <div className="p-3 space-y-3">
          <table className="w-full">
            <thead className="text-green-400">
              <tr>
                <th className="text-left">MODEL</th>
                <th>CURRENT</th>
                <th>PLANNING</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.code}>
                  <td>{p.label}</td>
                  <td className="text-center">{currentCounts[p.code]}</td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      className="bg-black border border-cyan-500 w-16 px-1"
                      value={target[p.code]}
                      onChange={(e) => setTarget((t) => ({ ...t, [p.code]: Math.max(0, Number(e.target.value)) }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center gap-2">
            <span>JML.SAND/MIXING</span>
            <input
              type="number"
              className="bg-black border border-cyan-500 w-20 px-1"
              value={sandQty}
              onChange={(e) => setSandQty(Number(e.target.value))}
            />
          </div>
          <button className="bg-cyan-700 hover:bg-cyan-600 px-3 py-1 rounded" onClick={submit}>
            UPDATE PLANNING
          </button>

          <div className="pt-2 border-t border-cyan-500/30">
            <div className="text-green-400 font-bold mb-1">HISTORY PLANNING</div>
            {planningHistory.length === 0 ? (
              <div className="text-gray-500">No data to display</div>
            ) : (
              <table className="w-full">
                <thead className="text-green-400">
                  <tr>
                    <th>No</th>
                    {HISTORY_COLUMNS.map((code) => <th key={code}>{code === 'KAI' ? 'CAMS' : code}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {planningHistory.map((snap, i) => (
                    <tr key={snap.id}>
                      <td className="text-center">{planningHistory.length - i}</td>
                      {HISTORY_COLUMNS.map((code) => (
                        <td key={code} className="text-center">
                          {snap.entries.find((e) => e.productCode === code)?.qty ?? 0}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify full build + full test suite**

Run: `npm run build && npm test`
Expected: PASS. This is the first point since Task 5 that `App.tsx` fully compiles (all of `InputParameterModal`, `UpdatePlanningModal`, and the retired `AddLotsForm` reference are now resolved).

- [ ] **Step 3: Commit**

```bash
git add src/components/UpdatePlanningModal.tsx
git commit -m "feat: add Update Planning window with current/target qty and history"
```

---

### Task 8: Visual verification

**Files:** none (no code changes — verification only).

**Interfaces:** none.

- [ ] **Step 1: Start the dev server**

Use the existing `shikake-dev` launch config (`.claude/launch.json`, port 5173) via the preview tool.

- [ ] **Step 2: Exercise Input Parameter**

In the browser: open **⚙ Input Parameter**. On **Input Problem**, fill Problem + Counter Measure, pick a category, submit — confirm a new row appears in the Line Stop tab's table with the Counter Measure and category columns populated. On **Input Planning**, enter a qty for 2TR and CAMS, submit — confirm lots appear on the grid and in the Model tab's summary, and `TOTAL`/`TAKT TIME` displayed correctly before submit. On **Input Informasi**, submit a note — confirm it appears in the list below. On **InputPic**, change PIC and Group, submit — confirm `BoardHeader` shows the new PIC and Group.

- [ ] **Step 3: Exercise Update Planning**

Open **📋 Update Planning** — confirm CURRENT reflects the lots added in Step 2. Change a target qty up and down, submit — confirm the grid/model summary reflect the new counts and **HISTORY PLANNING** shows a new row with the right per-model quantities.

- [ ] **Step 4: Confirm retired UI is gone**

Confirm the Model tab no longer shows a "+ LOT" / "JAM MULAI PRODUKSI" inline form (only `ModelSummary`'s table + "− LOT" remain), and the Line Stop tab no longer shows an inline "+ Line Stop" add-form (only the table, with working ✎ inline edit).

- [ ] **Step 5: Final full check**

Run: `npm run build && npm test`
Expected: PASS.

- [ ] **Step 6: Commit** (only if Step 2-4 surfaced fixes; otherwise skip — nothing to commit)

```bash
git add -A
git commit -m "fix: visual verification fixes for Input Parameter / Update Planning"
```

---

## Self-Review

**Spec coverage:**
- §3.1 (LineStop fields) → Task 1, 2, 3, 4.
- §3.2 (Product fields, CAMS relabel) → Task 1.
- §3.3 (ShiftConfig.group) → Task 1, 3, 5 (BoardHeader).
- §3.4 (PlanningEntry/Snapshot/InformasiNote) → Task 1, 3.
- §4.1 Input Problem → Task 6.
- §4.2 Input Planning → Task 6.
- §4.3 Input Informasi → Task 6.
- §4.4 InputPic → Task 6.
- §5 Update Planning window → Task 7.
- §6 (retire AddLotsForm/inline add-form, keep read-only tables) → Task 4, 5.
- §7 (store actions/state, persist migration) → Task 3.
- §8 (testing) → Tasks 1, 2, 3 each carry their own tests; Task 8 covers the component-level visual check the spec calls for.
- §9 (backward compat, engine untouched, visual consistency) → Task 1 (`migrateShift`), Task 3 (`applyPlanningTargets` reuses the existing engine), Tasks 6-7 (palette matches `BreakSettingsModal`).

**Placeholder scan:** no TBD/TODO; every step has complete, runnable code.

**Type consistency:** `LineStopCategory`, `TeamGroup`, `PlanningEntry`, `PlanningSnapshot`, `InformasiNote` (Task 1) are used with identical shapes in Tasks 2, 3, 6, 7. `makeLineStop`'s and `addLineStop`'s/`updateLineStop`'s optional-parameter signatures match exactly between Task 2 (scheduling.ts) and Task 3 (boardStore.ts). `applyPlanningTargets`'s parameter shape (`{ productCode: ProductCode; qty: number }[]`) matches between its Task 3 definition and its Task 7 (`UpdatePlanningModal`) call site.
