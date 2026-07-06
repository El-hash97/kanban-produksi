# Tapping Furnace Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "URUTAN TAPPING FURNACE" panel — a 2-column PLAN/ACTION mini-kanban showing which of 4 furnaces handles each group of 3 small lots, derived purely from the existing `planLots` array.

**Architecture:** One new pure/React-free module `src/lib/tapping.ts` (grouping + furnace assignment + PLAN/ACTION status, unit-tested like `scheduling.ts`), one new presentational component `TappingPanel.tsx` (reads `boardStore`, no logic of its own), wired into `App.tsx` as a new tab. No changes to `boardStore.ts` or `autoPlaceLots` — the panel is entirely derived from state that already exists.

**Tech Stack:** React 18 + TypeScript + Vite + Tailwind v4 + Zustand + Vitest (existing stack, no new dependencies).

## Global Constraints

- Do not change lot generation/ordering in `autoPlaceLots` or `boardStore.ts` — the main board's PLN row must behave exactly as it does today (per spec §1 "Di luar cakupan").
- `KAI` and `CRANK` lots always group to Furnace 3 and never mix with `2TR`/`1TR` in the same tapping card.
- `2TR`/`1TR` lots may mix within one tapping card and rotate furnaces in the fixed cycle `[1, 1, 4, 2, 2]` (repeating).
- 1 tapping card = 3 consecutive small lots (of the compatible kind); a trailing remainder of 1–2 lots is still shown, flagged `complete: false`.
- PLAN → ACTION transition is automatic, driven by the same clock (`nowMin`) mechanism as `deriveActual` — no manual button/click.
- Furnace colors: F1 `#f97316`, F2 `#06b6d4`, F3 `#a855f7`, F4 `#f43f5e` (must differ visually from the 4 existing product colors).
- Source spec: `docs/superpowers/specs/2026-07-06-tapping-furnace-panel-design.md`.

---

### Task 1: Furnace domain model + defaults

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/defaults.ts`
- Modify: `src/domain/defaults.test.ts`

**Interfaces:**
- Produces: `FurnaceId` (`1 | 2 | 3 | 4`), `Furnace { id: FurnaceId; label: string; color: string }` (from `src/domain/types.ts`), `DEFAULT_FURNACES: Furnace[]` (from `src/domain/defaults.ts`) — consumed by Task 2 and Task 4.

- [ ] **Step 1: Write the failing test**

Append to `src/domain/defaults.test.ts` (add this import to the existing import line and this new test case at the end of the file, inside the outer `describe('defaults', ...)` block, before its closing `});`):

```ts
// add DEFAULT_FURNACES to the existing import from './defaults'
import {
  DEFAULT_SHIFT, DEFAULT_PRODUCTS, DEFAULT_FURNACES, buildShiftConfig, ensureDandori, LOT_PITCH_SEC, LOT_DURATION_MIN,
} from './defaults';
```

```ts
  it('has exactly four furnaces with unique ids 1-4 and unique colors', () => {
    expect(DEFAULT_FURNACES.map((f) => f.id).sort()).toEqual([1, 2, 3, 4]);
    expect(new Set(DEFAULT_FURNACES.map((f) => f.color)).size).toBe(4);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- defaults.test.ts`
Expected: FAIL — `DEFAULT_FURNACES` is not exported from `./defaults` (TypeScript/import error).

- [ ] **Step 3: Add the `Furnace` type**

In `src/domain/types.ts`, add after the existing `Product` interface (after line 35, `}`):

```ts
export type FurnaceId = 1 | 2 | 3 | 4;

export interface Furnace {
  id: FurnaceId;
  label: string;
  color: string;
}
```

- [ ] **Step 4: Add `DEFAULT_FURNACES`**

In `src/domain/defaults.ts`, update the type import on line 1 to include `Furnace`:

```ts
import type {
  Break, BreakType, Product, ShiftConfig, Furnace,
} from './types';
```

Then append at the end of the file (after the existing `DEFAULT_PRODUCTS` array):

```ts

export const DEFAULT_FURNACES: Furnace[] = [
  { id: 1, label: 'Furnace 1', color: '#f97316' },
  { id: 2, label: 'Furnace 2', color: '#06b6d4' },
  { id: 3, label: 'Furnace 3', color: '#a855f7' },
  { id: 4, label: 'Furnace 4', color: '#f43f5e' },
];
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- defaults.test.ts`
Expected: PASS (all tests in the file, including the new one)

- [ ] **Step 6: Commit**

```bash
git add src/domain/types.ts src/domain/defaults.ts src/domain/defaults.test.ts
git commit -m "feat: add Furnace domain model with 4 default furnace identities"
```

---

### Task 2: `deriveTappingGroups` — grouping + furnace assignment

**Files:**
- Create: `src/lib/tapping.ts`
- Create: `src/lib/tapping.test.ts`

**Interfaces:**
- Consumes: `PlanLot { id, productCode, lotNo, startMin, endMin, shifted }`, `ProductCode = '2TR' | '1TR' | 'KAI' | 'CRANK'`, and `FurnaceId` (from Task 1) from `src/domain/types.ts` (existing).
- Produces: `TappingGroup { id: string; sequenceNo: number; furnaceId: FurnaceId; lots: PlanLot[]; startMin: number; complete: boolean }`, `deriveTappingGroups(planLots: PlanLot[]): TappingGroup[]` — consumed by Task 3 and Task 4.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/tapping.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { deriveTappingGroups } from './tapping';
import type { PlanLot } from '../domain/types';

let idCounter = 0;
function makeLot(productCode: PlanLot['productCode'], lotNo: number, startMin: number): PlanLot {
  idCounter += 1;
  return {
    id: `lot-${idCounter}`, productCode, lotNo, startMin, endMin: startMin + 1, shifted: false,
  };
}

describe('deriveTappingGroups', () => {
  it('returns nothing for an empty plan', () => {
    expect(deriveTappingGroups([])).toEqual([]);
  });

  it('groups KAI/CRANK lots into furnace 3, 3 lots per tap', () => {
    const lots = [
      makeLot('CRANK', 1, 400), makeLot('CRANK', 2, 404), makeLot('CRANK', 3, 408),
      makeLot('KAI', 1, 412), makeLot('KAI', 2, 416), makeLot('KAI', 3, 420),
    ];
    const groups = deriveTappingGroups(lots);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.furnaceId === 3)).toBe(true);
    expect(groups[0].lots.map((l) => l.productCode)).toEqual(['CRANK', 'CRANK', 'CRANK']);
    expect(groups[1].lots.map((l) => l.productCode)).toEqual(['KAI', 'KAI', 'KAI']);
  });

  it('rotates 2TR/1TR groups through F1,F1,F4,F2,F2 and repeats', () => {
    const lots: PlanLot[] = [];
    let t = 400;
    for (let i = 0; i < 15; i += 1) {
      lots.push(makeLot('2TR', i + 1, t));
      t += 4;
    }
    const groups = deriveTappingGroups(lots);
    expect(groups).toHaveLength(5);
    expect(groups.map((g) => g.furnaceId)).toEqual([1, 1, 4, 2, 2]);
  });

  it('allows 2TR and 1TR to mix within one tapping group', () => {
    const lots = [
      makeLot('2TR', 1, 400), makeLot('1TR', 1, 404), makeLot('2TR', 2, 408),
    ];
    const groups = deriveTappingGroups(lots);
    expect(groups).toHaveLength(1);
    expect(groups[0].furnaceId).toBe(1);
    expect(groups[0].lots.map((l) => l.productCode)).toEqual(['2TR', '1TR', '2TR']);
  });

  it('never mixes KAI/CRANK lots with 2TR/1TR lots in the same group', () => {
    const lots = [
      makeLot('2TR', 1, 400), makeLot('2TR', 2, 404), makeLot('CRANK', 1, 408),
    ];
    const groups = deriveTappingGroups(lots);
    expect(groups.some((g) => {
      const codes = new Set(g.lots.map((l) => l.productCode));
      return codes.has('CRANK') && (codes.has('2TR') || codes.has('1TR'));
    })).toBe(false);
  });

  it('flags a trailing remainder group (not a multiple of 3) as incomplete', () => {
    const lots = [makeLot('2TR', 1, 400), makeLot('2TR', 2, 404)];
    const groups = deriveTappingGroups(lots);
    expect(groups).toHaveLength(1);
    expect(groups[0].complete).toBe(false);
    expect(groups[0].lots).toHaveLength(2);
  });

  it('numbers sequenceNo chronologically across both furnace-3 and rotation groups combined', () => {
    const lots = [
      makeLot('2TR', 1, 400), makeLot('2TR', 2, 404), makeLot('2TR', 3, 408), // F1 tap, starts 400
      makeLot('CRANK', 1, 412), makeLot('CRANK', 2, 416), makeLot('CRANK', 3, 420), // F3 tap, starts 412
    ];
    const groups = deriveTappingGroups(lots);
    expect(groups.map((g) => g.sequenceNo)).toEqual([1, 2]);
    expect(groups.map((g) => g.furnaceId)).toEqual([1, 3]);
    expect(groups.map((g) => g.startMin)).toEqual([400, 412]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tapping.test.ts`
Expected: FAIL — cannot find module `./tapping` (file doesn't exist yet).

- [ ] **Step 3: Implement `deriveTappingGroups`**

Create `src/lib/tapping.ts`:

```ts
import type { PlanLot, ProductCode, FurnaceId } from '../domain/types';

export interface TappingGroup {
  id: string;
  sequenceNo: number;
  furnaceId: FurnaceId;
  lots: PlanLot[];
  startMin: number;
  complete: boolean;
}

const FURNACE3_CODES: ProductCode[] = ['KAI', 'CRANK'];
const ROTATION_CODES: ProductCode[] = ['2TR', '1TR'];
const ROTATION_CYCLE: FurnaceId[] = [1, 1, 4, 2, 2];

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

type UnnumberedGroup = Omit<TappingGroup, 'id' | 'sequenceNo'>;

function groupsFor(lots: PlanLot[], furnaceIdFor: (groupIndex: number) => FurnaceId): UnnumberedGroup[] {
  return chunk(lots, 3).map((group, i) => ({
    furnaceId: furnaceIdFor(i),
    lots: group,
    startMin: group[0].startMin,
    complete: group.length === 3,
  }));
}

/**
 * Derives tapping groups from the plan's existing lot order (chronological):
 * KAI/CRANK lots always chunk to furnace 3; 2TR/1TR lots chunk and rotate
 * through the fixed F1,F1,F4,F2,F2 cycle. The two tracks are independent —
 * furnace-3 assignment never depends on rotation position, and vice versa —
 * then merged back into one chronological, globally-numbered sequence.
 */
export function deriveTappingGroups(planLots: PlanLot[]): TappingGroup[] {
  const furnace3Lots = planLots.filter((l) => FURNACE3_CODES.includes(l.productCode));
  const rotationLots = planLots.filter((l) => ROTATION_CODES.includes(l.productCode));

  const furnace3Groups = groupsFor(furnace3Lots, () => 3);
  const rotationGroups = groupsFor(
    rotationLots,
    (i) => ROTATION_CYCLE[i % ROTATION_CYCLE.length],
  );

  return [...furnace3Groups, ...rotationGroups]
    .sort((a, b) => a.startMin - b.startMin)
    .map((g, i) => ({ ...g, id: `tap-${i + 1}`, sequenceNo: i + 1 }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tapping.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/tapping.ts src/lib/tapping.test.ts
git commit -m "feat: derive tapping furnace groups from plan lots"
```

---

### Task 3: `withTappingStatus` — PLAN/ACTION transition

**Files:**
- Modify: `src/lib/tapping.ts`
- Modify: `src/lib/tapping.test.ts`

**Interfaces:**
- Consumes: `TappingGroup` from Task 2 (same file).
- Produces: `TappingStatus = 'PLAN' | 'ACTION'`, `withTappingStatus(groups: TappingGroup[], nowMin: number): (TappingGroup & { status: TappingStatus })[]` — consumed by Task 4.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/tapping.test.ts` (update the existing import to include `withTappingStatus`, and add a new `describe` block at the end of the file):

```ts
import { deriveTappingGroups, withTappingStatus } from './tapping';
```

```ts
describe('withTappingStatus', () => {
  it('marks a group ACTION once its last lot\'s startMin has passed', () => {
    const lots = [
      makeLot('2TR', 1, 400), makeLot('2TR', 2, 404), makeLot('2TR', 3, 408),
    ];
    const groups = deriveTappingGroups(lots);
    expect(withTappingStatus(groups, 407)[0].status).toBe('PLAN');
    expect(withTappingStatus(groups, 408)[0].status).toBe('ACTION');
    expect(withTappingStatus(groups, 500)[0].status).toBe('ACTION');
  });

  it('evaluates an incomplete trailing group from its last available lot', () => {
    const lots = [makeLot('2TR', 1, 400), makeLot('2TR', 2, 404)];
    const groups = deriveTappingGroups(lots);
    expect(withTappingStatus(groups, 403)[0].status).toBe('PLAN');
    expect(withTappingStatus(groups, 404)[0].status).toBe('ACTION');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tapping.test.ts`
Expected: FAIL — `withTappingStatus` is not exported from `./tapping`.

- [ ] **Step 3: Implement `withTappingStatus`**

Append to `src/lib/tapping.ts` (end of file):

```ts

export type TappingStatus = 'PLAN' | 'ACTION';

/**
 * Mirrors deriveActual's clock-driven rule: a group moves to ACTION once its
 * last lot has "started" per the running clock, no manual confirmation.
 */
export function withTappingStatus(
  groups: TappingGroup[],
  nowMin: number,
): (TappingGroup & { status: TappingStatus })[] {
  return groups.map((g) => ({
    ...g,
    status: g.lots[g.lots.length - 1].startMin <= nowMin ? 'ACTION' : 'PLAN',
  }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tapping.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/tapping.ts src/lib/tapping.test.ts
git commit -m "feat: add PLAN/ACTION status derivation for tapping groups"
```

---

### Task 4: `TappingPanel` component + wire into App

**Files:**
- Create: `src/components/TappingPanel.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useBoardStore` (`planLots`, `shiftConfig`) from `src/store/boardStore.ts` (existing), `useNowMin(shift)` from `src/hooks/useNowMin.ts` (existing), `deriveTappingGroups`, `withTappingStatus`, `TappingGroup`, `TappingStatus` from `src/lib/tapping.ts` (Task 2/3), `DEFAULT_FURNACES` from `src/domain/defaults.ts` (Task 1), `PlanLot` from `src/domain/types.ts` (existing).
- Produces: default-exported `TappingPanel` component, consumed by `App.tsx`.

- [ ] **Step 1: Create the component**

Create `src/components/TappingPanel.tsx`:

```tsx
import { useMemo } from 'react';
import { useBoardStore } from '../store/boardStore';
import { useNowMin } from '../hooks/useNowMin';
import { deriveTappingGroups, withTappingStatus } from '../lib/tapping';
import type { TappingGroup, TappingStatus } from '../lib/tapping';
import { DEFAULT_FURNACES } from '../domain/defaults';
import type { PlanLot } from '../domain/types';

function furnaceColor(furnaceId: number): string {
  return DEFAULT_FURNACES.find((f) => f.id === furnaceId)?.color ?? '#888';
}

function furnaceLabel(furnaceId: number): string {
  return DEFAULT_FURNACES.find((f) => f.id === furnaceId)?.label ?? `Furnace ${furnaceId}`;
}

// e.g. "2TR Lot 5-6, 1TR Lot 1" — one clause per product code present in the group.
function summarizeLots(lots: PlanLot[]): string {
  const byProduct = new Map<string, number[]>();
  for (const l of lots) {
    const arr = byProduct.get(l.productCode) ?? [];
    arr.push(l.lotNo);
    byProduct.set(l.productCode, arr);
  }
  return [...byProduct.entries()]
    .map(([code, nos]) => {
      const min = Math.min(...nos);
      const max = Math.max(...nos);
      return min === max ? `${code} Lot ${min}` : `${code} Lot ${min}-${max}`;
    })
    .join(', ');
}

function TappingCard({ group }: { group: TappingGroup & { status: TappingStatus } }) {
  return (
    <div
      className="border-l-4 bg-white/5 px-2 py-1"
      style={{ borderLeftColor: furnaceColor(group.furnaceId) }}
    >
      <div className="flex items-center justify-between font-bold">
        <span>Tap #{group.sequenceNo}</span>
        <span style={{ color: furnaceColor(group.furnaceId) }}>{furnaceLabel(group.furnaceId)}</span>
      </div>
      <div className="text-gray-300">{summarizeLots(group.lots)}</div>
      {!group.complete && <div className="text-yellow-400">belum lengkap</div>}
    </div>
  );
}

export default function TappingPanel() {
  const planLots = useBoardStore((s) => s.planLots);
  const shiftConfig = useBoardStore((s) => s.shiftConfig);
  const nowMin = useNowMin(shiftConfig);

  const groups = useMemo(
    () => withTappingStatus(deriveTappingGroups(planLots), nowMin),
    [planLots, nowMin],
  );
  const plan = groups.filter((g) => g.status === 'PLAN');
  const action = groups.filter((g) => g.status === 'ACTION');

  return (
    <div className="text-white text-xs">
      <div className="bg-cyan-900/40 px-2 py-1 font-bold text-green-400">URUTAN TAPPING FURNACE</div>
      <div className="grid grid-cols-2 gap-2 p-2">
        <div>
          <div className="font-bold text-green-400 mb-1">PLAN</div>
          <div className="space-y-1">
            {plan.length === 0 && <div className="text-gray-500">Belum ada tapping.</div>}
            {plan.map((g) => <TappingCard key={g.id} group={g} />)}
          </div>
        </div>
        <div>
          <div className="font-bold text-green-400 mb-1">ACTION</div>
          <div className="space-y-1">
            {action.length === 0 && <div className="text-gray-500">Belum ada tapping berjalan.</div>}
            {action.map((g) => <TappingCard key={g.id} group={g} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the new tab into `App.tsx`**

In `src/App.tsx`, add the import (after the existing `BreakPanel` import on line 7):

```tsx
import BreakPanel from './components/BreakPanel';
import TappingPanel from './components/TappingPanel';
```

Add a new tab entry to the `TABS` array (after the `'model'` entry, before the closing `] as const;`):

```ts
const TABS = [
  { key: 'linestop', label: 'INFORMASI LINE STOP' },
  { key: 'break', label: 'DANDORI/WAKOM/ISTIRAHAT' },
  { key: 'model', label: 'MODEL' },
  { key: 'tapping', label: 'URUTAN TAPPING FURNACE' },
] as const;
```

Add the conditional render (after the existing `{tab === 'model' && (...)}` block, before the closing `</div>` of the tab container):

```tsx
        {tab === 'tapping' && <TappingPanel />}
```

- [ ] **Step 3: Type-check and build**

Run: `npm run build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: all existing tests plus the 9 new `tapping.test.ts` tests and the new `defaults.test.ts` test PASS.

- [ ] **Step 5: Manually verify in the browser**

Run: `npm run dev` (or use the `shikake-dev` launch config, port 5173).
In the browser:
1. Open the "MODEL" tab and add some lots, e.g. `2TR` x6, `CRANK` x3, `1TR` x3, `KAI` x3.
2. Switch to the new "URUTAN TAPPING FURNACE" tab.
3. Confirm: CRANK and KAI lots each appear as their own card labeled "Furnace 3" (violet), never mixed with 2TR/1TR in the same card; 2TR/1TR lots appear as cards rotating Furnace 1 (orange) → Furnace 1 → Furnace 4 (pink) → Furnace 2 (cyan) → Furnace 2; card numbering (`Tap #N`) is sequential.
4. Confirm cards sit in the PLAN column, and move to the ACTION column automatically as the shift's production clock reaches each card's lots (or temporarily adjust the system clock / `productionStartMin` to something already in the past to see a card land directly in ACTION on load).
5. Add a Line Stop overlapping some lots (LINE STOP tab) and confirm the tapping panel's groupings/timing update accordingly without any extra action.

- [ ] **Step 6: Commit**

```bash
git add src/components/TappingPanel.tsx src/App.tsx
git commit -m "feat: add Tapping Furnace panel with PLAN/ACTION kanban"
```
