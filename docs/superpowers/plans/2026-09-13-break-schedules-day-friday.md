# DAY/FRIDAY Break Schedules + Settings Pop-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Dandori/Wakom/Istirahat two schedules — DAY (weekday) and FRIDAY — chosen automatically by the real date (overridable), and add an editable settings pop-up to manage both.

**Architecture:** Each `Break` gains a `day: DayType` tag; `ShiftConfig.breaks` holds both days at once. Scheduling stays day-agnostic — the store hands it an `effectiveShift(shift, activeDay)` whose breaks are filtered to the active day, so `autoPlaceLots`/`applyLineStops` internals are untouched. A new `BreakSettingsModal` (opened by a ⚙ button, with a DAY/FRIDAY toggle) replaces the old break tab.

**Tech Stack:** React 18 + Vite 6 + TypeScript + Zustand (persist) + Vitest.

**Spec:** `docs/superpowers/specs/2026-09-13-break-schedules-day-friday-design.md`

## Global Constraints

- `DayType = 'DAY' | 'FRIDAY'`. Every `Break` has a required `day: DayType`.
- Break `id` encodes shift + day: `brk-${shiftNo}-${day}-${idSuffix}` (e.g. `brk-1-FRIDAY-istirahat1`).
- Scheduling never filters by day — the store always passes `effectiveShift(shiftConfig, activeDay)`; the grid renders the same filtered set.
- Only the **midday Istirahat differs** between DAY and FRIDAY (DAY 45 min, FRIDAY 75 min). All other breaks are identical across days.
- **Dandori seed stays 10 min** (07:00–07:10) and `productionStartMin = startMin + 10` — unchanged from today (existing tests depend on it; the spec's 07:15 was illustrative, and the value is editable in the pop-up).
- `activeDay` initial state is a deterministic `'DAY'`; it is auto-set from the real date **only on load** (persist `merge`), via `todayDayType()` (`Date.getDay() === 5 ? 'FRIDAY' : 'DAY'`).
- localStorage key stays `shikake-board-v1`; old state (breaks without `day`) must migrate cleanly.
- Modal edits **apply immediately** to the store (no draft/save state), matching today's live-reflow behavior.

---

### Task 1: Day-type break model (domain, scheduling, defaults, store, grid)

Introduces the DAY/FRIDAY model end-to-end in the data layer so the board is
behaviorally correct with the active day's breaks. UI (modal) comes in Task 2;
the existing break tab keeps working until then.

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/lib/time.ts`
- Modify: `src/lib/scheduling.ts`
- Modify: `src/domain/defaults.ts`
- Modify: `src/store/boardStore.ts`
- Modify: `src/components/TimeGrid.tsx`
- Modify: `src/components/BreakPanel.tsx` (only its one `addBreak` call — keeps build green; deleted in Task 2)
- Test: `src/lib/time.test.ts` (add), `src/domain/defaults.test.ts` (add), `src/store/boardStore.test.ts` (update + add)
- Test (create): `src/lib/scheduling.effectiveshift.test.ts`
- Test (update literal): `src/lib/scheduling.autoplace.test.ts`

**Interfaces:**
- Consumes: existing `autoPlaceLots`, `applyLineStops`, `renumberByProduct`, `makeLineStop`, `buildShiftConfig`.
- Produces:
  - `type DayType = 'DAY' | 'FRIDAY'` (types.ts)
  - `Break.day: DayType` (required)
  - `todayDayType(d?: Date): DayType` (time.ts)
  - `effectiveShift(shift: ShiftConfig, day: DayType): ShiftConfig` (scheduling.ts)
  - `makeBreak(label, startMin, endMin, day?: DayType): Break` — `day` defaults `'DAY'`
  - `migrateShift(shift: ShiftConfig): ShiftConfig` (defaults.ts)
  - store: `activeDay: DayType`, `setActiveDay(day: DayType): void`, `addBreak(day: DayType, label: string, startMin: number, endMin: number): void`

- [ ] **Step 1: Add `DayType` and `Break.day` to types**

In `src/domain/types.ts`, add the type and field:
```ts
export type DayType = 'DAY' | 'FRIDAY';
```
And add `day: DayType;` to the `Break` interface:
```ts
export interface Break extends Range {
  id: string;
  type: BreakType;
  label: string;
  day: DayType;
}
```

- [ ] **Step 2: Write the failing test for `todayDayType`**

Append to `src/lib/time.test.ts`:
```ts
import { todayDayType } from './time';

describe('todayDayType', () => {
  it('returns FRIDAY on a Friday and DAY otherwise', () => {
    expect(todayDayType(new Date(2026, 8, 11))).toBe('FRIDAY'); // 2026-09-11 is a Friday
    expect(todayDayType(new Date(2026, 8, 14))).toBe('DAY');    // Monday
    expect(todayDayType(new Date(2026, 8, 13))).toBe('DAY');    // Sunday
  });
});
```

- [ ] **Step 3: Run it, expect fail**

Run: `npm test -- src/lib/time.test.ts`
Expected: FAIL — `todayDayType` is not exported.

- [ ] **Step 4: Implement `todayDayType`**

In `src/lib/time.ts`, add the import type and function:
```ts
import type { DayType } from '../domain/types';

export function todayDayType(d: Date = new Date()): DayType {
  return d.getDay() === 5 ? 'FRIDAY' : 'DAY';
}
```
(Add `DayType` to the existing `import type { Range, ShiftConfig }` line, or add a new import — either compiles.)

- [ ] **Step 5: Run it, expect pass**

Run: `npm test -- src/lib/time.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing test for `effectiveShift`**

Create `src/lib/scheduling.effectiveshift.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { effectiveShift, autoPlaceLots } from './scheduling';
import type { Break, ShiftConfig } from '../domain/types';

const brk = (day: 'DAY' | 'FRIDAY', startMin: number, endMin: number): Break => ({
  id: `b-${day}-${startMin}`, type: 'CUSTOM', label: 'x', day, startMin, endMin,
});

const shift: ShiftConfig = {
  startMin: 420, endMin: 1140, pic: 'X', shiftNo: 1, tTimeSec: 48, productionStartMin: 420,
  breaks: [brk('DAY', 700, 745), brk('FRIDAY', 700, 780)],
};

describe('effectiveShift', () => {
  it('keeps only the requested day\'s breaks', () => {
    expect(effectiveShift(shift, 'DAY').breaks).toEqual([shift.breaks[0]]);
    expect(effectiveShift(shift, 'FRIDAY').breaks).toEqual([shift.breaks[1]]);
  });

  it('leaves every other shift field untouched', () => {
    const eff = effectiveShift(shift, 'DAY');
    expect([eff.startMin, eff.endMin, eff.productionStartMin]).toEqual([420, 1140, 420]);
  });

  it('drives autoPlaceLots so FRIDAY\'s longer break pushes lots differently', () => {
    // A lot placed right at the break start on each day. DAY break ends 745,
    // FRIDAY ends 780, so a lot arriving at 700 resumes later on Friday.
    const near = { ...shift, productionStartMin: 700 };
    const dayStart = autoPlaceLots([{ productCode: '2TR', count: 1 }], effectiveShift(near, 'DAY'))[0].startMin;
    const friStart = autoPlaceLots([{ productCode: '2TR', count: 1 }], effectiveShift(near, 'FRIDAY'))[0].startMin;
    expect(dayStart).toBe(745);
    expect(friStart).toBe(780);
  });
});
```

- [ ] **Step 7: Run it, expect fail**

Run: `npm test -- src/lib/scheduling.effectiveshift.test.ts`
Expected: FAIL — `effectiveShift` is not exported.

- [ ] **Step 8: Implement `effectiveShift` and extend `makeBreak`**

In `src/lib/scheduling.ts`, add `DayType` to the type import from `../domain/types`, then add:
```ts
export function effectiveShift(shift: ShiftConfig, day: DayType): ShiftConfig {
  return { ...shift, breaks: shift.breaks.filter((b) => b.day === day) };
}
```
And change `makeBreak` to carry a day (default `'DAY'` so existing 3-arg callers still compile):
```ts
export function makeBreak(
  label: string, startMin: number, endMin: number, day: DayType = 'DAY',
): Break {
  return {
    id: makeId('brk'), type: 'CUSTOM', label, startMin, endMin, day,
  };
}
```

- [ ] **Step 9: Run it, expect pass**

Run: `npm test -- src/lib/scheduling.effectiveshift.test.ts`
Expected: PASS.

- [ ] **Step 10: Fix the existing autoplace test literal**

In `src/lib/scheduling.autoplace.test.ts`, the break literal now needs `day`. Change:
```ts
    const brk = [{
      id: 'b1', type: 'WAKOM1' as const, label: 'W', startMin: 424, endMin: 434,
    }];
```
to:
```ts
    const brk = [{
      id: 'b1', type: 'WAKOM1' as const, label: 'W', day: 'DAY' as const, startMin: 424, endMin: 434,
    }];
```

- [ ] **Step 11: Rewrite `defaults.ts` break templates for both days + per-day Dandori**

Replace the `BREAK_TEMPLATE`, `buildBreaks`, and `ensureDandori` in `src/domain/defaults.ts` with:
```ts
const BREAK_TEMPLATE: {
  idSuffix: string; type: BreakType; label: string; day: DayType;
  offsetStart: number; offsetEnd: number;
}[] = [
  // Weekday (DAY)
  { idSuffix: 'dandori', type: 'DANDORI', label: 'Dandori', day: 'DAY', offsetStart: h(0), offsetEnd: h(0, 10) },
  { idSuffix: 'wakom1', type: 'WAKOM1', label: 'Wakom-1', day: 'DAY', offsetStart: h(2, 30), offsetEnd: h(2, 40) },
  { idSuffix: 'istirahat1', type: 'ISTIRAHAT1', label: 'Istirahat-1', day: 'DAY', offsetStart: h(4, 45), offsetEnd: h(5, 30) },
  { idSuffix: 'wakom2', type: 'WAKOM2', label: 'Wakom-2', day: 'DAY', offsetStart: h(7, 30), offsetEnd: h(7, 40) },
  { idSuffix: 'istirahat2', type: 'ISTIRAHAT', label: 'Istirahat-2', day: 'DAY', offsetStart: h(9, 30), offsetEnd: h(10) },
  // Friday (FRIDAY) — only the midday Istirahat is longer
  { idSuffix: 'dandori', type: 'DANDORI', label: 'Dandori', day: 'FRIDAY', offsetStart: h(0), offsetEnd: h(0, 10) },
  { idSuffix: 'wakom1', type: 'WAKOM1', label: 'Wakom-1', day: 'FRIDAY', offsetStart: h(2, 30), offsetEnd: h(2, 40) },
  { idSuffix: 'istirahat', type: 'ISTIRAHAT', label: 'Istirahat (Jumat)', day: 'FRIDAY', offsetStart: h(4, 45), offsetEnd: h(6) },
  { idSuffix: 'wakom2', type: 'WAKOM2', label: 'Wakom-2', day: 'FRIDAY', offsetStart: h(7, 30), offsetEnd: h(7, 40) },
  { idSuffix: 'istirahat2', type: 'ISTIRAHAT', label: 'Istirahat-2', day: 'FRIDAY', offsetStart: h(9, 30), offsetEnd: h(10) },
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
```
Add `DayType` to the type import at the top (`import type { Break, BreakType, DayType, Product, ShiftConfig, Furnace } from './types';`).

Now replace `ensureDandori` with a per-day version and add `migrateShift`:
```ts
const DAY_TYPES: DayType[] = ['DAY', 'FRIDAY'];

/**
 * Guarantees a Dandori break exists for BOTH days (so generated lots always
 * start after it whichever day is active) and backfills a missing
 * productionStartMin. Returns the same reference when nothing needs repair.
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
 * Upgrades a shift persisted before breaks had a `day`: tag existing breaks
 * as DAY, clone them into a FRIDAY set if none exists, then ensure Dandori.
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
  return ensureDandori({ ...shift, breaks });
}
```

- [ ] **Step 12: Add default-breaks tests**

Append to `src/domain/defaults.test.ts` (add `migrateShift` to the import from `./defaults`, then add a new `describe`):
```ts
import { migrateShift } from './defaults';

describe('day-type break defaults', () => {
  it('generates Dandori for both DAY and FRIDAY', () => {
    const shift = buildShiftConfig(1);
    for (const day of ['DAY', 'FRIDAY'] as const) {
      expect(shift.breaks.some((b) => b.type === 'DANDORI' && b.day === day)).toBe(true);
    }
  });

  it('makes the Friday midday Istirahat longer than the weekday one', () => {
    const shift = buildShiftConfig(1);
    const dayMid = shift.breaks.find((b) => b.day === 'DAY' && b.type === 'ISTIRAHAT1')!;
    const friMid = shift.breaks.find((b) => b.day === 'FRIDAY' && b.id.endsWith('-istirahat'))!;
    expect(friMid.endMin - friMid.startMin).toBeGreaterThan(dayMid.endMin - dayMid.startMin);
  });

  it('migrateShift tags legacy breaks DAY and synthesizes a FRIDAY set', () => {
    const legacy = {
      ...buildShiftConfig(1),
      breaks: [{ id: 'old-1', type: 'WAKOM1' as const, label: 'W', startMin: 600, endMin: 610 }],
    } as unknown as import('./types').ShiftConfig;
    const migrated = migrateShift(legacy);
    expect(migrated.breaks.every((b) => b.day === 'DAY' || b.day === 'FRIDAY')).toBe(true);
    expect(migrated.breaks.some((b) => b.day === 'DAY')).toBe(true);
    expect(migrated.breaks.some((b) => b.day === 'FRIDAY')).toBe(true);
    expect(migrated.breaks.some((b) => b.type === 'DANDORI' && b.day === 'FRIDAY')).toBe(true);
  });
});
```

- [ ] **Step 13: Run domain tests, expect pass**

Run: `npm test -- src/domain/defaults.test.ts src/lib/time.test.ts src/lib/scheduling.autoplace.test.ts`
Expected: PASS (existing tests still green; `ensureDandori` no-op ref-equality holds because `buildShiftConfig` now emits Dandori for both days).

- [ ] **Step 14: Add `activeDay` + `setActiveDay` + day-aware breaks to the store**

In `src/store/boardStore.ts`:

(a) Import additions:
```ts
import type {
  DayType, FurnaceId, LineStop, LotRequest, PlanLot, Product, ProductCode, ShiftConfig,
} from '../domain/types';
import {
  buildShiftConfig, DEFAULT_PRODUCTS, DEFAULT_SHIFT, ensureDandori, migrateShift,
} from '../domain/defaults';
import {
  applyLineStops, autoPlaceLots, effectiveShift, makeBreak, makeLineStop, renumberByProduct,
} from '../lib/scheduling';
import { todayDayType } from '../lib/time';
```

(b) In `interface BoardState`, add:
```ts
  activeDay: DayType;
  setActiveDay: (day: DayType) => void;
```
and change the `addBreak` signature to:
```ts
  addBreak: (day: DayType, label: string, startMin: number, endMin: number) => void;
```

(c) In the initial state object, add `activeDay: 'DAY',` next to `furnaceOverrides: {}`.

(d) Replace scheduling calls to use the effective shift. `addLots`:
```ts
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
```
`removeLots`:
```ts
      removeLots: (productCode, count) => {
        const {
          shiftConfig, planLots, lineStops, activeDay,
        } = get();
        const toDrop = planLots
          .filter((l) => l.productCode === productCode)
          .sort((a, b) => b.lotNo - a.lotNo)
          .slice(0, count)
          .map((l) => l.id);
        const dropSet = new Set(toDrop);
        const remaining = renumberByProduct(planLots.filter((l) => !dropSet.has(l.id)));
        set({ planLots: applyLineStops(remaining, effectiveShift(shiftConfig, activeDay), lineStops) });
      },
```
`addLineStop`, `updateLineStop`, `removeLineStop`: in each, pull `activeDay` from `get()` and pass `effectiveShift(shiftConfig, activeDay)` to `applyLineStops` instead of `shiftConfig`. Example for `addLineStop`:
```ts
      addLineStop: (startMin, endMin, keterangan) => {
        const {
          shiftConfig, planLots, lineStops, activeDay,
        } = get();
        const stop = makeLineStop(startMin, endMin, keterangan);
        const nextStops = [...lineStops, stop];
        set({
          lineStops: nextStops,
          planLots: applyLineStops(planLots, effectiveShift(shiftConfig, activeDay), nextStops),
        });
      },
```
Apply the same `effectiveShift(shiftConfig, activeDay)` substitution in `updateLineStop` and `removeLineStop`.

(e) `addBreak` gains the `day` arg and reflows through the effective shift:
```ts
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
```

(f) `updateBreak`, `removeBreak`, `setProductionStart`: replace their `applyLineStops(planLots, nextShift, lineStops)` with `applyLineStops(planLots, effectiveShift(nextShift, activeDay), lineStops)` (pull `activeDay` from `get()` in each).

(g) Add `setActiveDay` (place after `setShiftNo`):
```ts
      setActiveDay: (day) => {
        const { shiftConfig, planLots, lineStops } = get();
        set({
          activeDay: day,
          planLots: applyLineStops(planLots, effectiveShift(shiftConfig, day), lineStops),
        });
      },
```

(h) Migration: in the `persist` `merge`, use `migrateShift` and set `activeDay` from the date:
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
(`ensureDandori` stays imported for `setShiftNo`, which is unchanged.)

- [ ] **Step 15: Update `BreakPanel.tsx`'s single addBreak call (keep build green)**

In `src/components/BreakPanel.tsx`, add a selector near the others:
```ts
  const activeDay = useBoardStore((s) => s.activeDay);
```
and change the `submit` handler's `addBreak(label.trim(), start, end)` to:
```ts
    addBreak(activeDay, label.trim(), start, end);
```
(BreakPanel is deleted in Task 2; this keeps it compiling in the meantime.)

- [ ] **Step 16: Render only the active day's breaks in the grid**

In `src/components/TimeGrid.tsx`:
- Add `effectiveShift` to the scheduling import: `import { deriveActual, effectiveShift } from '../lib/scheduling';`
- Add a selector: `const activeDay = useBoardStore((s) => s.activeDay);`
- Change the `Overlays` breaks prop from `shiftConfig.breaks` to the active-day set:
```tsx
            <Overlays
              breaks={effectiveShift(shiftConfig, activeDay).breaks}
              lineStops={lineStops}
              hour={hour}
            />
```

- [ ] **Step 17: Update the store tests for the new signatures + add day tests**

In `src/store/boardStore.test.ts`:

(a) Add `activeDay: 'DAY',` to the `useBoardStore.setState({...})` object in `beforeEach`.

(b) Update every `addBreak(...)` call to pass a day first: `addBreak('DAY', 'Wakom-3', 430, 440)` (the calls using `'Wakom-3'`, `'Shift1-Only'`, `'Shift2-Only'`). Example:
```ts
    useBoardStore.getState().addBreak('DAY', 'Wakom-3', 430, 440);
```

(c) Add new tests at the end of the top-level `describe('boardStore', ...)`:
```ts
  it('setActiveDay reflows lots around that day\'s breaks', () => {
    // FRIDAY midday Istirahat is longer; place enough lots to reach it and
    // confirm switching days changes the schedule tail.
    useBoardStore.getState().addLots([{ productCode: '2TR', count: 120 }]);
    const dayEnds = useBoardStore.getState().planLots.at(-1)!.startMin;
    useBoardStore.getState().setActiveDay('FRIDAY');
    expect(useBoardStore.getState().activeDay).toBe('FRIDAY');
    const friEnds = useBoardStore.getState().planLots.at(-1)!.startMin;
    expect(friEnds).toBeGreaterThan(dayEnds); // longer Friday break pushes the tail later
  });

  it('adding a FRIDAY break does not move the board while DAY is active', () => {
    useBoardStore.getState().addLots([{ productCode: '2TR', count: 3 }]);
    const before = useBoardStore.getState().planLots.map((l) => l.startMin);
    useBoardStore.getState().addBreak('FRIDAY', 'F-only', 430, 460);
    expect(useBoardStore.getState().planLots.map((l) => l.startMin)).toEqual(before);
    // but it applies once FRIDAY is active
    useBoardStore.getState().setActiveDay('FRIDAY');
    expect(useBoardStore.getState().planLots[0].startMin).toBeGreaterThanOrEqual(460);
  });
```

- [ ] **Step 18: Run the full suite, expect pass**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 19: Type-check + build**

Run: `npm run build`
Expected: PASS, no type errors.

- [ ] **Step 20: Commit**

```bash
git add src docs
git commit -m "feat: DAY/FRIDAY break schedules with active-day scheduling

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Break settings pop-up + ⚙ button + day toggle

Adds the editable pop-up (both days), a DAY/FRIDAY toggle, and a ⚙ button in
the tab strip; removes the old break tab and `BreakPanel.tsx`.

**Files:**
- Create: `src/components/BreakSettingsModal.tsx`
- Modify: `src/App.tsx`
- Delete: `src/components/BreakPanel.tsx`

**Interfaces:**
- Consumes (store): `shiftConfig.breaks`, `activeDay`, `setActiveDay`, `addBreak(day, label, start, end)`, `updateBreak(id, start, end)`, `removeBreak(id)`; component `TimeSelect`; `toHHmm`.
- Produces: `<BreakSettingsModal onClose={() => void} />`.

- [ ] **Step 1: Create `BreakSettingsModal.tsx`**

```tsx
import { useState } from 'react';
import { useBoardStore } from '../store/boardStore';
import type { Break, DayType } from '../domain/types';
import { toHHmm } from '../lib/time';
import TimeSelect from './TimeSelect';

const DAY_TABLES: { day: DayType; title: string }[] = [
  { day: 'DAY', title: 'HARI BIASA (DAY)' },
  { day: 'FRIDAY', title: 'JUMAT (FRIDAY)' },
];

function DayTable({ day, title }: { day: DayType; title: string }) {
  const shiftConfig = useBoardStore((s) => s.shiftConfig);
  const addBreak = useBoardStore((s) => s.addBreak);
  const updateBreak = useBoardStore((s) => s.updateBreak);
  const removeBreak = useBoardStore((s) => s.removeBreak);

  const rows = shiftConfig.breaks
    .filter((b) => b.day === day)
    .sort((a, b) => a.startMin - b.startMin);

  const [start, setStart] = useState(shiftConfig.startMin);
  const [end, setEnd] = useState(shiftConfig.startMin + 10);
  const [label, setLabel] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState(0);
  const [editEnd, setEditEnd] = useState(0);

  const submit = () => {
    if (end <= start || !label.trim()) return;
    addBreak(day, label.trim(), start, end);
    setLabel('');
  };
  const startEdit = (b: Break) => {
    setEditingId(b.id);
    setEditStart(b.startMin);
    setEditEnd(b.endMin);
  };
  const saveEdit = () => {
    if (!editingId || editEnd <= editStart) return;
    updateBreak(editingId, editStart, editEnd);
    setEditingId(null);
  };

  return (
    <div className="flex-1 min-w-[16rem] border border-cyan-500/40">
      <div className="bg-blue-900/40 px-2 py-1 font-bold text-green-400">{title}</div>
      <table className="w-full text-[11px]">
        <thead className="text-green-400">
          <tr className="border-b border-blue-500/40">
            <th className="text-left px-2 py-1">TIME</th>
            <th className="text-left px-2 py-1">NAMA</th>
            <th className="px-2 py-1"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id} className="border-b border-blue-500/20">
              {editingId === b.id ? (
                <>
                  <td className="px-2 py-1" colSpan={2}>
                    <span className="inline-flex items-center gap-2">
                      <TimeSelect value={editStart} onChange={setEditStart} shift={shiftConfig} />
                      <span>–</span>
                      <TimeSelect value={editEnd} onChange={setEditEnd} shift={shiftConfig} />
                    </span>
                  </td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">
                    <button className="text-green-400 hover:text-green-200 mr-2" onClick={saveEdit}>✓</button>
                    <button className="text-gray-400 hover:text-gray-200" onClick={() => setEditingId(null)}>✕</button>
                  </td>
                </>
              ) : (
                <>
                  <td className="px-2 py-1 tabular-nums">{toHHmm(b.startMin)}–{toHHmm(b.endMin)}</td>
                  <td className="px-2 py-1">{b.label}</td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">
                    <button className="text-cyan-400 hover:text-cyan-200 mr-2" title="Ubah jam" onClick={() => startEdit(b)}>✎</button>
                    {b.type === 'DANDORI' ? (
                      <span className="text-gray-600" title="Dandori wajib ada">🔒</span>
                    ) : (
                      <button className="text-red-400 hover:text-red-200" onClick={() => removeBreak(b.id)}>✕</button>
                    )}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-2 p-2 border-t border-blue-500/40">
        <TimeSelect value={start} onChange={setStart} shift={shiftConfig} />
        <span>–</span>
        <TimeSelect value={end} onChange={setEnd} shift={shiftConfig} />
        <input
          className="bg-black border border-cyan-500 px-1 flex-1 min-w-[6rem]"
          placeholder="Nama (mis. Wakom-3)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <button className="bg-blue-700 hover:bg-blue-600 px-2 py-0.5 rounded" onClick={submit}>+ Tambah</button>
      </div>
    </div>
  );
}

export default function BreakSettingsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="bg-black border-2 border-cyan-500 text-white text-xs max-w-4xl w-[90vw] max-h-[85vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between bg-cyan-900/40 px-3 py-2 border-b border-cyan-500/50">
          <span className="font-bold text-green-400">SETTING DANDORI / WAKOM / ISTIRAHAT</span>
          <button className="text-gray-300 hover:text-white text-base" onClick={onClose} title="Tutup">✕</button>
        </div>
        <div className="flex flex-wrap gap-2 p-3">
          {DAY_TABLES.map((t) => <DayTable key={t.day} day={t.day} title={t.title} />)}
        </div>
        <div className="px-3 py-2 text-gray-400 border-t border-cyan-500/30">
          Perubahan langsung tersimpan. Papan mengikuti jadwal hari aktif secara otomatis.
        </div>
      </div>
    </div>
  );
}
```
Note: each `DayTable` keeps its own add/edit form state, so the two days don't share inputs.

- [ ] **Step 2: Wire the ⚙ button + DAY/FRIDAY toggle into `App.tsx`, drop the break tab**

In `src/App.tsx`:
- Remove the `import BreakPanel ...` line and add `import BreakSettingsModal from './components/BreakSettingsModal';` plus `import { useBoardStore } from './store/boardStore';`.
- Remove `{ key: 'break', label: 'DANDORI/WAKOM/ISTIRAHAT' }` from `TABS` and the `{tab === 'break' && <BreakPanel />}` line.
- Replace the component body with:
```tsx
export default function App() {
  const [tab, setTab] = useState<TabKey>('linestop');
  const [showSettings, setShowSettings] = useState(false);
  const activeDay = useBoardStore((s) => s.activeDay);
  const setActiveDay = useBoardStore((s) => s.setActiveDay);

  return (
    <div className="min-h-full bg-black p-2 text-white space-y-1">
      <BoardHeader />
      <TimeGrid />

      <div className="border-2 border-cyan-500/60">
        <div className="flex items-center">
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
          <div className="ml-auto flex items-center gap-2 px-2 text-xs">
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
              className="ml-2 px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600"
              title="Setting Dandori/Wakom/Istirahat"
              onClick={() => setShowSettings(true)}
            >
              ⚙ Setting
            </button>
          </div>
        </div>
        {tab === 'linestop' && <LineStopPanel />}
        {tab === 'model' && (
          <>
            <AddLotsForm />
            <ModelSummary />
          </>
        )}
        {tab === 'tapping' && <TappingPanel />}
      </div>

      {showSettings && <BreakSettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
```

- [ ] **Step 3: Delete the old break panel**

```bash
git rm src/components/BreakPanel.tsx
```

- [ ] **Step 4: Type-check + build + tests**

Run: `npm run build && npm test`
Expected: PASS (no dangling `BreakPanel` import; all tests green).

- [ ] **Step 5: Visual verification**

Start the `shikake-dev` preview. Then:
- Add ~90 lots (Model tab). Confirm the board shows the **DAY** breaks (Istirahat-1 11:45–12:30).
- Click **FRIDAY** in the toggle → the midday Istirahat block widens to 11:45–13:00 and lots after it shift right.
- Click **⚙ Setting** → pop-up shows two tables (DAY & FRIDAY); edit a Wakom time and confirm the board (active day) reflows live; Dandori shows 🔒.
- Screenshot for the record.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: break settings pop-up with DAY/FRIDAY toggle; remove break tab

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- §3 data model (`DayType`, `Break.day`, `effectiveShift`) → Task 1 Steps 1, 8.
- §4 default times (both days, Friday longer Istirahat) → Task 1 Step 11–12. (Dandori seed kept at 10 min per Global Constraints — documented deviation from the illustrative 15 min.)
- §5 day selection (auto on load + `setActiveDay` override) → Task 1 Steps 4, 14(g,h).
- §6 UI (modal, tab strip ⚙ + toggle, grid renders active day) → Task 1 Step 16; Task 2 Steps 1–3.
- §7 store (activeDay, setActiveDay, addBreak(day), effectiveShift everywhere, ensureDandori per day, migration) → Task 1 Steps 11, 14.
- §8 testing → Task 1 Steps 2, 6, 12, 17.
- §9 non-functional (compatibility via `migrateShift`, palette, no draft-state) → Task 1 Step 14(h); Task 2 Step 1.

**Placeholder scan:** none. Every code step shows the actual code; the only judgment step (Task 2 Step 5 visual check) has an explicit checklist.

**Type consistency:** `DayType` used identically across types/time/scheduling/defaults/store/modal. `effectiveShift(shift, day)`, `makeBreak(label, startMin, endMin, day?)`, `addBreak(day, label, startMin, endMin)`, `setActiveDay(day)`, `migrateShift(shift)`, `todayDayType(d?)` signatures match between their defining task and every consumer. Break `id` scheme `brk-${shiftNo}-${day}-${idSuffix}` is consistent between `buildBreaks`, `ensureDandori`, and `migrateShift`'s `-DAY-`→`-FRIDAY-` rewrite.
