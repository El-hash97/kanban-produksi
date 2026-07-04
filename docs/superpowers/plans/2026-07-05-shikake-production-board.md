# Shikake Production Board (MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-only digital "Shikake" production control board that shows Plan vs Actual on a minute-precise time grid, auto-fills Actual from the clock, and auto-shifts production lots when a Line Stop is recorded.

**Architecture:** React SPA (Vite + TypeScript). All scheduling logic lives in two pure, React-free modules (`lib/time.ts`, `lib/scheduling.ts`) that are unit-tested in isolation. A single Zustand store (persisted to localStorage) holds plan lots, line stops, shift config, and products; presentational components read the store and render the board. Actual lots are derived at runtime, never stored.

**Tech Stack:** React 18, Vite 6, TypeScript, Tailwind CSS v4 (`@tailwindcss/vite`), Zustand (persist middleware), Day.js, Vitest + Testing Library.

## Global Constraints

- Time is represented internally as **minute-of-day integers** (07:00 = 420, 19:00 = 1140).
- **1 small lot = exactly 5 minutes** (`LOT_MIN = 5`); `endMin = startMin + LOT_MIN`.
- Grid precision is **1 minute internally**, displayed grouped per **5-minute** columns.
- Products are fixed: `2TR`, `1TR`, `KAI`, `CRANK`. Lot numbering **restarts at 1 per product**.
- `actualLots` are **derived** from `planLots` + current clock — never persisted separately.
- Palette: black background, high-contrast bright text/gridlines, **red** for line stops, **blue** translucent for breaks (PRD §4).
- Scheduling functions (`lib/scheduling.ts`) must be **pure** (no React, no `Date.now()` inside — clock passed as argument).
- localStorage key: `shikake-board-v1`. JSON-serialized.
- Deferred (do NOT build): Tapping Furnace integration (PRD §3.5), cross-device sync.

---

### Task 1: Project scaffold + tooling

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`
- Create: `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/vite-env.d.ts`
- Create: `src/test/setup.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a runnable dev server (`npm run dev`), a passing test runner (`npm test`), and Tailwind classes available in components.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "kanban-produksi",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "dayjs": "^1.11.13",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zustand": "^5.0.2"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@types/react": "^18.3.18",
    "@types/react-dom": "^18.3.5",
    "@vitejs/plugin-react": "^4.3.4",
    "jsdom": "^25.0.1",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.2",
    "vite": "^6.0.7",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create config files**

`vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 3: Create HTML + entry files**

`index.html`:
```html
<!doctype html>
<html lang="id">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Shikake Production Board</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/index.css`:
```css
@import "tailwindcss";

html, body, #root { height: 100%; margin: 0; background: #000; }
body { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; }
```

`src/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />
```

`src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/App.tsx`:
```tsx
export default function App() {
  return <div className="text-white p-4">Shikake board — scaffold OK</div>;
}
```

`src/test/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: Install and verify**

Run: `npm install`
Then run: `npm run build`
Expected: build succeeds, `dist/` produced, no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TS + Tailwind + Vitest"
```

---

### Task 2: Domain types + defaults

**Files:**
- Create: `src/domain/types.ts`
- Create: `src/domain/defaults.ts`
- Test: `src/domain/defaults.test.ts`

**Interfaces:**
- Produces:
  - `type ProductCode = '2TR' | '1TR' | 'KAI' | 'CRANK'`
  - `interface Range { startMin: number; endMin: number }`
  - `interface Break extends Range { type: BreakType; label: string }`
  - `interface ShiftConfig { startMin, endMin, pic, shiftNo, tTimeSec, breaks: Break[] }`
  - `interface Product { code: ProductCode; label: string; color: string }`
  - `interface PlanLot { id, productCode, lotNo, startMin, endMin, shifted }`
  - `interface LineStop { id, startMin, endMin, durationMin, keterangan }`
  - `interface LotRequest { productCode: ProductCode; count: number }`
  - `LOT_MIN = 5`, `DEFAULT_SHIFT: ShiftConfig`, `DEFAULT_PRODUCTS: Product[]`

- [ ] **Step 1: Write the failing test**

`src/domain/defaults.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { LOT_MIN, DEFAULT_SHIFT, DEFAULT_PRODUCTS } from './defaults';

describe('defaults', () => {
  it('lot is 5 minutes', () => {
    expect(LOT_MIN).toBe(5);
  });

  it('shift runs 07:00 to 19:00', () => {
    expect(DEFAULT_SHIFT.startMin).toBe(420);
    expect(DEFAULT_SHIFT.endMin).toBe(1140);
  });

  it('all default breaks fall inside the shift window', () => {
    for (const b of DEFAULT_SHIFT.breaks) {
      expect(b.startMin).toBeGreaterThanOrEqual(DEFAULT_SHIFT.startMin);
      expect(b.endMin).toBeLessThanOrEqual(DEFAULT_SHIFT.endMin);
      expect(b.endMin).toBeGreaterThan(b.startMin);
    }
  });

  it('has exactly the four products with unique codes', () => {
    const codes = DEFAULT_PRODUCTS.map((p) => p.code);
    expect(new Set(codes)).toEqual(new Set(['2TR', '1TR', 'KAI', 'CRANK']));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/domain/defaults.test.ts`
Expected: FAIL — cannot resolve `./defaults`.

- [ ] **Step 3: Write `src/domain/types.ts`**

```ts
export type ProductCode = '2TR' | '1TR' | 'KAI' | 'CRANK';

export type BreakType =
  | 'DANDORI' | 'WAKOM1' | 'WAKOM2'
  | 'ISTIRAHAT1' | 'ISTIRAHAT' | 'MAGHRIB';

export interface Range {
  startMin: number;
  endMin: number;
}

export interface Break extends Range {
  type: BreakType;
  label: string;
}

export interface ShiftConfig {
  startMin: number;
  endMin: number;
  pic: string;
  shiftNo: number;
  tTimeSec: number;
  breaks: Break[];
}

export interface Product {
  code: ProductCode;
  label: string;
  color: string;
}

export interface PlanLot {
  id: string;
  productCode: ProductCode;
  lotNo: number;
  startMin: number;
  endMin: number;
  shifted: boolean;
}

export interface LineStop {
  id: string;
  startMin: number;
  endMin: number;
  durationMin: number;
  keterangan: string;
}

export interface LotRequest {
  productCode: ProductCode;
  count: number;
}
```

- [ ] **Step 4: Write `src/domain/defaults.ts`**

```ts
import type { Break, Product, ShiftConfig } from './types';

export const LOT_MIN = 5;

const h = (hh: number, mm = 0) => hh * 60 + mm;

const DEFAULT_BREAKS: Break[] = [
  { type: 'DANDORI', label: 'Dandori', startMin: h(7), endMin: h(7, 10) },
  { type: 'WAKOM1', label: 'Wakom-1', startMin: h(10), endMin: h(10, 5) },
  { type: 'ISTIRAHAT1', label: 'Istirahat-1', startMin: h(11), endMin: h(11, 15) },
  { type: 'ISTIRAHAT', label: 'Istirahat', startMin: h(12), endMin: h(12, 45) },
  { type: 'WAKOM2', label: 'Wakom-2', startMin: h(14), endMin: h(14, 5) },
  { type: 'MAGHRIB', label: 'Istirahat Maghrib', startMin: h(18), endMin: h(18, 15) },
];

export const DEFAULT_SHIFT: ShiftConfig = {
  startMin: h(7),
  endMin: h(19),
  pic: 'Bernad',
  shiftNo: 1,
  tTimeSec: 48,
  breaks: DEFAULT_BREAKS,
};

export const DEFAULT_PRODUCTS: Product[] = [
  { code: '2TR', label: 'B/C 2TR', color: '#3b82f6' },
  { code: '1TR', label: 'B/C 1TR', color: '#d946ef' },
  { code: 'KAI', label: 'TR-KAI', color: '#f59e0b' },
  { code: 'CRANK', label: 'CRANK', color: '#22c55e' },
];
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/domain/defaults.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/domain
git commit -m "feat: domain types and default shift/products"
```

---

### Task 3: Time helpers (`lib/time.ts`)

**Files:**
- Create: `src/lib/time.ts`
- Test: `src/lib/time.test.ts`

**Interfaces:**
- Consumes: nothing (uses Day.js internally).
- Produces:
  - `toMinOfDay(hhmm: string): number`
  - `toHHmm(min: number): string`
  - `hourStart(min: number): number` — floor to the hour
  - `rangesOverlap(a: Range, b: Range): boolean`
  - `nowMinOfDay(d?: Date): number`

- [ ] **Step 1: Write the failing test**

`src/lib/time.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { toMinOfDay, toHHmm, hourStart, rangesOverlap, nowMinOfDay } from './time';

describe('time', () => {
  it('converts HH:mm to minute-of-day', () => {
    expect(toMinOfDay('07:00')).toBe(420);
    expect(toMinOfDay('19:00')).toBe(1140);
    expect(toMinOfDay('08:45')).toBe(525);
  });

  it('converts minute-of-day back to zero-padded HH:mm', () => {
    expect(toHHmm(420)).toBe('07:00');
    expect(toHHmm(525)).toBe('08:45');
    expect(toHHmm(605)).toBe('10:05');
  });

  it('floors a minute to the start of its hour', () => {
    expect(hourStart(525)).toBe(480);
    expect(hourStart(420)).toBe(420);
  });

  it('detects overlapping ranges (touching does not count)', () => {
    expect(rangesOverlap({ startMin: 10, endMin: 20 }, { startMin: 15, endMin: 25 })).toBe(true);
    expect(rangesOverlap({ startMin: 10, endMin: 20 }, { startMin: 20, endMin: 30 })).toBe(false);
    expect(rangesOverlap({ startMin: 10, endMin: 20 }, { startMin: 25, endMin: 30 })).toBe(false);
  });

  it('reads minute-of-day from a Date', () => {
    expect(nowMinOfDay(new Date(2026, 6, 5, 10, 24))).toBe(624);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/time.test.ts`
Expected: FAIL — cannot resolve `./time`.

- [ ] **Step 3: Write `src/lib/time.ts`**

```ts
import dayjs from 'dayjs';
import type { Range } from '../domain/types';

export function toMinOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function toHHmm(min: number): string {
  const clamped = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function hourStart(min: number): number {
  return Math.floor(min / 60) * 60;
}

export function rangesOverlap(a: Range, b: Range): boolean {
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

export function nowMinOfDay(d: Date = new Date()): number {
  const dj = dayjs(d);
  return dj.hour() * 60 + dj.minute();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/time.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/time.ts src/lib/time.test.ts
git commit -m "feat: pure time helpers"
```

---

### Task 4: Lot placement core + auto-place (`lib/scheduling.ts` part 1)

**Files:**
- Create: `src/lib/scheduling.ts`
- Test: `src/lib/scheduling.autoplace.test.ts`

**Interfaces:**
- Consumes: `LOT_MIN` (defaults), `rangesOverlap` (time), domain types.
- Produces:
  - `placeSequence(order: { productCode: ProductCode; lotNo: number }[], shift: ShiftConfig, blocks: Range[]): PlanLot[]`
  - `autoPlaceLots(requests: LotRequest[], shift: ShiftConfig): PlanLot[]`
  - (both used by Task 6 and Task 7)

- [ ] **Step 1: Write the failing test**

`src/lib/scheduling.autoplace.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { autoPlaceLots } from './scheduling';
import type { ShiftConfig } from '../domain/types';

const shift = (breaks: ShiftConfig['breaks'] = []): ShiftConfig => ({
  startMin: 420, endMin: 1140, pic: 'X', shiftNo: 1, tTimeSec: 48, breaks,
});

describe('autoPlaceLots', () => {
  it('places lots back-to-back in 5-minute slots from shift start', () => {
    const lots = autoPlaceLots([{ productCode: '2TR', count: 3 }], shift());
    expect(lots.map((l) => [l.startMin, l.endMin])).toEqual([
      [420, 425], [425, 430], [430, 435],
    ]);
  });

  it('numbers lots per product starting at 1', () => {
    const lots = autoPlaceLots(
      [{ productCode: '2TR', count: 2 }, { productCode: '1TR', count: 2 }],
      shift(),
    );
    expect(lots.map((l) => `${l.productCode}#${l.lotNo}`)).toEqual([
      '2TR#1', '2TR#2', '1TR#1', '1TR#2',
    ]);
  });

  it('skips over a break block instead of overlapping it', () => {
    const brk = [{ type: 'WAKOM1' as const, label: 'W', startMin: 425, endMin: 435 }];
    const lots = autoPlaceLots([{ productCode: '2TR', count: 3 }], shift(brk));
    // first at 420-425, break 425-435 skipped, then 435-440, 440-445
    expect(lots.map((l) => l.startMin)).toEqual([420, 435, 440]);
  });

  it('marks nothing as shifted on initial placement', () => {
    const lots = autoPlaceLots([{ productCode: 'KAI', count: 2 }], shift());
    expect(lots.every((l) => l.shifted === false)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/scheduling.autoplace.test.ts`
Expected: FAIL — cannot resolve `./scheduling`.

- [ ] **Step 3: Write `src/lib/scheduling.ts`**

```ts
import type {
  LineStop, LotRequest, PlanLot, ProductCode, Range, ShiftConfig,
} from '../domain/types';
import { LOT_MIN } from '../domain/defaults';
import { rangesOverlap } from './time';

let idCounter = 0;
function makeId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

/**
 * Advance `cursor` forward until a LOT_MIN slot starting there overlaps no block.
 * Blocks may overlap each other; we loop until the position is stable.
 */
function nextFreeStart(cursor: number, blocks: Range[]): number {
  let pos = cursor;
  let moved = true;
  while (moved) {
    moved = false;
    for (const b of blocks) {
      if (rangesOverlap({ startMin: pos, endMin: pos + LOT_MIN }, b)) {
        pos = b.endMin;
        moved = true;
      }
    }
  }
  return pos;
}

/**
 * Place an ordered list of lots into 5-minute slots from shift start,
 * stepping over `blocks` (breaks + line stops). Order is preserved; lots
 * that spill past shift end are still returned (never dropped).
 */
export function placeSequence(
  order: { productCode: ProductCode; lotNo: number }[],
  shift: ShiftConfig,
  blocks: Range[],
): PlanLot[] {
  const result: PlanLot[] = [];
  let cursor = shift.startMin;
  for (const item of order) {
    cursor = nextFreeStart(cursor, blocks);
    result.push({
      id: makeId('lot'),
      productCode: item.productCode,
      lotNo: item.lotNo,
      startMin: cursor,
      endMin: cursor + LOT_MIN,
      shifted: false,
    });
    cursor += LOT_MIN;
  }
  return result;
}

export function autoPlaceLots(requests: LotRequest[], shift: ShiftConfig): PlanLot[] {
  const order: { productCode: ProductCode; lotNo: number }[] = [];
  const counters: Record<string, number> = {};
  for (const req of requests) {
    for (let i = 0; i < req.count; i += 1) {
      counters[req.productCode] = (counters[req.productCode] ?? 0) + 1;
      order.push({ productCode: req.productCode, lotNo: counters[req.productCode] });
    }
  }
  return placeSequence(order, shift, shift.breaks);
}

// applyLineStops, deriveActual, makeLineStop are added in later tasks.
export type { LineStop };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/scheduling.autoplace.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/scheduling.ts src/lib/scheduling.autoplace.test.ts
git commit -m "feat: lot placement core and autoPlaceLots"
```

---

### Task 5: Derive Actual from clock (`lib/scheduling.ts` part 2)

**Files:**
- Modify: `src/lib/scheduling.ts`
- Test: `src/lib/scheduling.actual.test.ts`

**Interfaces:**
- Consumes: `PlanLot` from Task 4.
- Produces: `deriveActual(planLots: PlanLot[], nowMin: number): PlanLot[]` — returns the subset of plan lots that have started (`startMin <= nowMin`). Used by the store/UI to render the ACT row.

- [ ] **Step 1: Write the failing test**

`src/lib/scheduling.actual.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { autoPlaceLots, deriveActual } from './scheduling';

const shift = { startMin: 420, endMin: 1140, pic: 'X', shiftNo: 1, tTimeSec: 48, breaks: [] };

describe('deriveActual', () => {
  it('returns only lots that have started by nowMin', () => {
    const plan = autoPlaceLots([{ productCode: '2TR', count: 4 }], shift);
    // slots: 420,425,430,435. now=431 -> 420,425,430 started
    const act = deriveActual(plan, 431);
    expect(act.map((l) => l.startMin)).toEqual([420, 425, 430]);
  });

  it('returns empty before the shift begins', () => {
    const plan = autoPlaceLots([{ productCode: '2TR', count: 2 }], shift);
    expect(deriveActual(plan, 400)).toEqual([]);
  });

  it('mirrors every plan lot once now is past all of them', () => {
    const plan = autoPlaceLots([{ productCode: '2TR', count: 2 }], shift);
    expect(deriveActual(plan, 1000)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/scheduling.actual.test.ts`
Expected: FAIL — `deriveActual` is not exported.

- [ ] **Step 3: Add `deriveActual` to `src/lib/scheduling.ts`**

Insert before the final `export type { LineStop };` line:
```ts
/**
 * Actual mirrors Plan up to the current clock (PRD §3.3): every plan lot
 * whose slot has started is considered produced. No manual confirmation.
 */
export function deriveActual(planLots: PlanLot[], nowMin: number): PlanLot[] {
  return planLots.filter((l) => l.startMin <= nowMin);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/scheduling.actual.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/scheduling.ts src/lib/scheduling.actual.test.ts
git commit -m "feat: derive actual lots from clock"
```

---

### Task 6: Line-stop auto-shift (`lib/scheduling.ts` part 3)

**Files:**
- Modify: `src/lib/scheduling.ts`
- Test: `src/lib/scheduling.linestop.test.ts`

**Interfaces:**
- Consumes: `placeSequence` (Task 4), `PlanLot`, `LineStop`, `ShiftConfig`, `Range`.
- Produces:
  - `makeLineStop(startMin, endMin, keterangan): LineStop`
  - `applyLineStops(planLots: PlanLot[], shift: ShiftConfig, lineStops: LineStop[]): PlanLot[]` — re-places the existing lots (preserving their product/lotNo order) around breaks + all line stops, flagging `shifted` where a lot's start moved.

- [ ] **Step 1: Write the failing test**

`src/lib/scheduling.linestop.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { autoPlaceLots, applyLineStops, makeLineStop } from './scheduling';

const shift = { startMin: 420, endMin: 1140, pic: 'X', shiftNo: 1, tTimeSec: 48, breaks: [] };

describe('applyLineStops', () => {
  it('shifts lots that start at/after the line stop to after it ends', () => {
    const plan = autoPlaceLots([{ productCode: '2TR', count: 4 }], shift);
    // slots 420,425,430,435; stop 425-435 (10 min)
    const stop = makeLineStop(425, 435, 'F.Releasing LS Fault');
    const shifted = applyLineStops(plan, shift, [stop]);
    expect(shifted.map((l) => l.startMin)).toEqual([420, 435, 440, 445]);
  });

  it('flags moved lots as shifted and leaves earlier lots untouched', () => {
    const plan = autoPlaceLots([{ productCode: '2TR', count: 3 }], shift);
    const shifted = applyLineStops(plan, shift, [makeLineStop(425, 430, 'x')]);
    expect(shifted[0].shifted).toBe(false);
    expect(shifted[1].shifted).toBe(true);
  });

  it('applies multiple line stops cumulatively', () => {
    const plan = autoPlaceLots([{ productCode: '2TR', count: 3 }], shift);
    const stops = [makeLineStop(425, 430, 'a'), makeLineStop(435, 445, 'b')];
    const shifted = applyLineStops(plan, shift, stops);
    // lot1 420-425; lot2 pushed past 425-430 -> 430; lot3 would be 435 but
    // 435-445 blocked -> 445
    expect(shifted.map((l) => l.startMin)).toEqual([420, 430, 445]);
  });

  it('is a no-op when the stop sits after all lots', () => {
    const plan = autoPlaceLots([{ productCode: '2TR', count: 2 }], shift);
    const shifted = applyLineStops(plan, shift, [makeLineStop(600, 610, 'late')]);
    expect(shifted.map((l) => l.startMin)).toEqual([420, 425]);
    expect(shifted.every((l) => l.shifted === false)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/scheduling.linestop.test.ts`
Expected: FAIL — `applyLineStops` / `makeLineStop` not exported.

- [ ] **Step 3: Add to `src/lib/scheduling.ts`**

Insert before the final `export type { LineStop };` line:
```ts
export function makeLineStop(startMin: number, endMin: number, keterangan: string): LineStop {
  return {
    id: makeId('ls'),
    startMin,
    endMin,
    durationMin: Math.max(0, endMin - startMin),
    keterangan,
  };
}

/**
 * Re-place existing lots (in their current order) around breaks + every line
 * stop. A lot whose start minute changes is flagged `shifted` (PRD §3.4).
 */
export function applyLineStops(
  planLots: PlanLot[],
  shift: ShiftConfig,
  lineStops: LineStop[],
): PlanLot[] {
  const order = planLots.map((l) => ({ productCode: l.productCode, lotNo: l.lotNo }));
  const blocks: Range[] = [
    ...shift.breaks.map((b) => ({ startMin: b.startMin, endMin: b.endMin })),
    ...lineStops.map((s) => ({ startMin: s.startMin, endMin: s.endMin })),
  ];
  const replaced = placeSequence(order, shift, blocks);
  return replaced.map((lot, i) => ({
    ...lot,
    id: planLots[i].id,
    shifted: lot.startMin !== planLots[i].startMin,
  }));
}
```

Note: `Range` is already imported in Task 4's import block; this task is the consumer that makes that import used.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/scheduling.linestop.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: all scheduling + time + defaults tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/scheduling.ts src/lib/scheduling.linestop.test.ts
git commit -m "feat: line-stop cumulative auto-shift"
```

---

### Task 7: Zustand board store (persisted)

**Files:**
- Create: `src/store/boardStore.ts`
- Test: `src/store/boardStore.test.ts`

**Interfaces:**
- Consumes: `autoPlaceLots`, `applyLineStops`, `makeLineStop` (scheduling), `DEFAULT_SHIFT`, `DEFAULT_PRODUCTS`.
- Produces a Zustand hook `useBoardStore` with state `{ shiftConfig, products, planLots, lineStops }` and actions:
  - `addLots(requests: LotRequest[]): void` — auto-places the merged (existing + new) requests then re-applies line stops.
  - `addLineStop(startMin, endMin, keterangan): void`
  - `removeLineStop(id: string): void`
  - `resetBoard(): void`

- [ ] **Step 1: Write the failing test**

`src/store/boardStore.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useBoardStore } from './boardStore';

beforeEach(() => {
  localStorage.clear();
  useBoardStore.getState().resetBoard();
});

describe('boardStore', () => {
  it('adds lots and places them from shift start', () => {
    useBoardStore.getState().addLots([{ productCode: '2TR', count: 3 }]);
    const lots = useBoardStore.getState().planLots;
    expect(lots).toHaveLength(3);
    expect(lots[0].startMin).toBe(420);
  });

  it('records a line stop and shifts affected lots', () => {
    useBoardStore.getState().addLots([{ productCode: '2TR', count: 3 }]);
    useBoardStore.getState().addLineStop(425, 435, 'F.Releasing LS Fault');
    const { planLots, lineStops } = useBoardStore.getState();
    expect(lineStops).toHaveLength(1);
    expect(planLots.map((l) => l.startMin)).toEqual([420, 435, 440]);
  });

  it('removing a line stop restores the original schedule', () => {
    useBoardStore.getState().addLots([{ productCode: '2TR', count: 3 }]);
    useBoardStore.getState().addLineStop(425, 435, 'x');
    const id = useBoardStore.getState().lineStops[0].id;
    useBoardStore.getState().removeLineStop(id);
    expect(useBoardStore.getState().planLots.map((l) => l.startMin)).toEqual([420, 425, 430]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/store/boardStore.test.ts`
Expected: FAIL — cannot resolve `./boardStore`.

- [ ] **Step 3: Write `src/store/boardStore.ts`**

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  LineStop, LotRequest, PlanLot, Product, ProductCode, ShiftConfig,
} from '../domain/types';
import { DEFAULT_PRODUCTS, DEFAULT_SHIFT } from '../domain/defaults';
import { applyLineStops, autoPlaceLots, makeLineStop } from '../lib/scheduling';

interface BoardState {
  shiftConfig: ShiftConfig;
  products: Product[];
  planLots: PlanLot[];
  lineStops: LineStop[];
  addLots: (requests: LotRequest[]) => void;
  addLineStop: (startMin: number, endMin: number, keterangan: string) => void;
  removeLineStop: (id: string) => void;
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

      resetBoard: () =>
        set({
          shiftConfig: DEFAULT_SHIFT,
          products: DEFAULT_PRODUCTS,
          planLots: [],
          lineStops: [],
        }),
    }),
    { name: 'shikake-board-v1' },
  ),
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/store/boardStore.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/store/boardStore.ts src/store/boardStore.test.ts
git commit -m "feat: persisted Zustand board store"
```

---

### Task 8: Live clock hook + BoardHeader

**Files:**
- Create: `src/hooks/useNowMin.ts`
- Create: `src/components/BoardHeader.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `nowMinOfDay` (time), `useBoardStore`.
- Produces:
  - `useNowMin(): number` — current minute-of-day, updates every 15s.
  - `<BoardHeader />` — renders title bar, PIC/shift/T.Time, live clock + date.

- [ ] **Step 1: Write `src/hooks/useNowMin.ts`**

```ts
import { useEffect, useState } from 'react';
import { nowMinOfDay } from '../lib/time';

export function useNowMin(): number {
  const [min, setMin] = useState(() => nowMinOfDay());
  useEffect(() => {
    const id = setInterval(() => setMin(nowMinOfDay()), 15_000);
    return () => clearInterval(id);
  }, []);
  return min;
}
```

- [ ] **Step 2: Write `src/components/BoardHeader.tsx`**

```tsx
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useBoardStore } from '../store/boardStore';

export default function BoardHeader() {
  const shift = useBoardStore((s) => s.shiftConfig);
  const [now, setNow] = useState(() => dayjs());
  useEffect(() => {
    const id = setInterval(() => setNow(dayjs()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="flex items-stretch justify-between border-2 border-cyan-500/60 bg-black text-white">
      <div className="px-3 py-1">
        <div className="text-red-500 font-bold tracking-wide">PT TMMIN</div>
        <div className="text-[10px] text-cyan-300 leading-tight">
          CASTING DIVISION-SUNTER II<br />DEPARTEMENT PRODUCTION
        </div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center">
        <h1 className="text-lg font-bold tracking-wider">
          PRODUCTION CONTROL BOARD MOULDING LINE
        </h1>
        <div className="flex gap-8 text-xs">
          <span className="text-green-400">URUTAN KANBAN</span>
          <span className="text-green-400">INFORMASI LINE STOP</span>
        </div>
      </div>
      <div className="px-3 py-1 text-xs border-l border-cyan-500/40">
        <div>PIC : <span className="text-cyan-300">{shift.pic}</span></div>
        <div>SHIFT : {shift.shiftNo}</div>
        <div>T.TIME : {shift.tTimeSec}</div>
      </div>
      <div className="px-3 py-1 text-right border-l border-cyan-500/40">
        <div className="text-green-400 text-xl font-bold tabular-nums">
          {now.format('HH:mm:ss')}
        </div>
        <div className="text-cyan-300 text-xs">{now.format('ddd, DD-MM-YYYY')}</div>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Wire into `src/App.tsx`**

```tsx
import BoardHeader from './components/BoardHeader';

export default function App() {
  return (
    <div className="min-h-full bg-black p-2 text-white">
      <BoardHeader />
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks src/components/BoardHeader.tsx src/App.tsx
git commit -m "feat: live clock hook and board header"
```

---

### Task 9: Time grid (hours, PLN/ACT rows, lots, break & line-stop overlays)

**Files:**
- Create: `src/lib/grid.ts`
- Create: `src/components/TimeGrid.tsx`
- Test: `src/lib/grid.test.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useBoardStore`, `deriveActual`, `useNowMin`, domain types.
- Produces:
  - `hourRange(shift): number[]` — array of hour-start minutes for each grid row.
  - `colSpan(startMin, endMin, hourStartMin): { col: number; span: number } | null` — 1-based CSS grid column (1..60) + span for a segment within an hour row, clipped to the hour, or `null` if outside.
  - `<TimeGrid />` — the full matrix.

- [ ] **Step 1: Write the failing test**

`src/lib/grid.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { hourRange, colSpan } from './grid';

const shift = { startMin: 420, endMin: 1140, pic: '', shiftNo: 1, tTimeSec: 48, breaks: [] };

describe('grid', () => {
  it('lists one hour-start per row from 07:00 to 18:00', () => {
    const hours = hourRange(shift);
    expect(hours[0]).toBe(420);
    expect(hours[hours.length - 1]).toBe(1080); // 18:00
    expect(hours).toHaveLength(12);
  });

  it('maps a lot to a 1-based column and span within its hour', () => {
    expect(colSpan(425, 430, 420)).toEqual({ col: 6, span: 5 });
    expect(colSpan(420, 425, 420)).toEqual({ col: 1, span: 5 });
  });

  it('clips a segment to the hour it belongs to', () => {
    // segment 475-490 vs hour 420: starts at minute 55, ends past the hour -> col 56 span 5
    expect(colSpan(475, 490, 420)).toEqual({ col: 56, span: 5 });
    // segment 470-485 vs hour 420 (ends 480): col 51 span 10
    expect(colSpan(470, 485, 420)).toEqual({ col: 51, span: 10 });
    // segment entirely in the next hour -> null
    expect(colSpan(485, 490, 420)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/grid.test.ts`
Expected: FAIL — cannot resolve `./grid`.

- [ ] **Step 3: Write `src/lib/grid.ts`**

```ts
import type { ShiftConfig } from '../domain/types';

export function hourRange(shift: ShiftConfig): number[] {
  const hours: number[] = [];
  for (let h = shift.startMin; h < shift.endMin; h += 60) hours.push(h);
  return hours;
}

/**
 * Map [startMin,endMin) onto a 60-column (1-minute) grid for the hour that
 * begins at hourStartMin. Returns 1-based CSS grid column + span, clipped to
 * the hour, or null if the segment does not intersect this hour.
 */
export function colSpan(
  startMin: number,
  endMin: number,
  hourStartMin: number,
): { col: number; span: number } | null {
  const hourEnd = hourStartMin + 60;
  const s = Math.max(startMin, hourStartMin);
  const e = Math.min(endMin, hourEnd);
  if (e <= s) return null;
  return { col: s - hourStartMin + 1, span: e - s };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/grid.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write `src/components/TimeGrid.tsx`**

```tsx
import { useMemo } from 'react';
import { useBoardStore } from '../store/boardStore';
import { deriveActual } from '../lib/scheduling';
import { useNowMin } from '../hooks/useNowMin';
import { colSpan, hourRange } from '../lib/grid';
import { toHHmm } from '../lib/time';
import type { Break, LineStop, PlanLot, Product } from '../domain/types';

const MINUTE_HEADERS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

function colorFor(products: Product[], code: string): string {
  return products.find((p) => p.code === code)?.color ?? '#64748b';
}

function LotBoxes({
  lots, hour, products, row,
}: { lots: PlanLot[]; hour: number; products: Product[]; row: number }) {
  return (
    <>
      {lots.map((lot) => {
        const cs = colSpan(lot.startMin, lot.endMin, hour);
        if (!cs) return null;
        return (
          <div
            key={lot.id}
            className="flex items-center justify-center text-[9px] font-bold text-black rounded-sm m-px"
            style={{
              gridColumn: `${cs.col} / span ${cs.span}`,
              gridRow: row,
              backgroundColor: colorFor(products, lot.productCode),
              outline: lot.shifted ? '1px solid #f87171' : 'none',
            }}
            title={`${lot.productCode} Lot ${lot.lotNo} @ ${toHHmm(lot.startMin)}`}
          >
            {lot.lotNo}
          </div>
        );
      })}
    </>
  );
}

function Overlays({
  breaks, lineStops, hour,
}: { breaks: Break[]; lineStops: LineStop[]; hour: number }) {
  return (
    <>
      {breaks.map((b, i) => {
        const cs = colSpan(b.startMin, b.endMin, hour);
        if (!cs) return null;
        return (
          <div
            key={`b${i}`}
            className="flex items-center justify-center text-[9px] text-cyan-100 bg-blue-600/40 border border-blue-400/50 overflow-hidden"
            style={{ gridColumn: `${cs.col} / span ${cs.span}`, gridRow: '1 / span 2' }}
          >
            {b.label}
          </div>
        );
      })}
      {lineStops.map((s) => {
        const cs = colSpan(s.startMin, s.endMin, hour);
        if (!cs) return null;
        return (
          <div
            key={s.id}
            className="flex items-center justify-center text-[9px] text-white bg-red-600/70 border border-red-300 overflow-hidden"
            style={{ gridColumn: `${cs.col} / span ${cs.span}`, gridRow: '1 / span 2' }}
            title={s.keterangan}
          >
            LINE STOP
          </div>
        );
      })}
    </>
  );
}

export default function TimeGrid() {
  const { shiftConfig, planLots, lineStops, products } = useBoardStore();
  const nowMin = useNowMin();
  const actualLots = useMemo(() => deriveActual(planLots, nowMin), [planLots, nowMin]);
  const hours = hourRange(shiftConfig);

  return (
    <div className="border-2 border-red-600/70 text-white">
      {/* minute header */}
      <div className="flex border-b border-red-600/50 text-[10px] text-yellow-300">
        <div className="w-24 shrink-0 px-1 py-0.5 font-bold">WAKTU</div>
        <div className="grid flex-1" style={{ gridTemplateColumns: 'repeat(60, 1fr)' }}>
          {MINUTE_HEADERS.map((m) => (
            <div key={m} style={{ gridColumn: `${m} / span 5` }} className="text-center">
              {String(m).padStart(2, '0')}
            </div>
          ))}
        </div>
      </div>

      {hours.map((hour) => (
        <div key={hour} className="flex border-b border-red-600/40">
          <div className="w-24 shrink-0 flex flex-col text-[10px]">
            <div className="px-1 font-bold text-cyan-200">{toHHmm(hour)}</div>
            <div className="px-1 text-yellow-400 border-t border-red-600/30">PLN</div>
            <div className="px-1 text-yellow-400 border-t border-red-600/30">ACT</div>
          </div>
          <div
            className="grid flex-1"
            style={{
              gridTemplateColumns: 'repeat(60, 1fr)',
              gridTemplateRows: '18px 18px',
              backgroundImage:
                'repeating-linear-gradient(to right, transparent, transparent calc(100%/12 - 1px), rgba(220,38,38,0.35) calc(100%/12))',
            }}
          >
            <LotBoxes lots={planLots} hour={hour} products={products} row={1} />
            <LotBoxes lots={actualLots} hour={hour} products={products} row={2} />
            <Overlays breaks={shiftConfig.breaks} lineStops={lineStops} hour={hour} />
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Wire into `src/App.tsx`**

```tsx
import BoardHeader from './components/BoardHeader';
import TimeGrid from './components/TimeGrid';

export default function App() {
  return (
    <div className="min-h-full bg-black p-2 text-white space-y-1">
      <BoardHeader />
      <TimeGrid />
    </div>
  );
}
```

- [ ] **Step 7: Verify build + tests**

Run: `npm run build && npm test`
Expected: build PASS, all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/grid.ts src/lib/grid.test.ts src/components/TimeGrid.tsx src/App.tsx
git commit -m "feat: time grid with PLN/ACT rows, lots and overlays"
```

---

### Task 10: Line Stop panel (log + form) and Add-Lots form

**Files:**
- Create: `src/components/LineStopPanel.tsx`
- Create: `src/components/AddLotsForm.tsx`
- Create: `src/components/TimeSelect.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useBoardStore`, `toHHmm`, domain types.
- Produces:
  - `<TimeSelect value onChange />` — hour + minute dropdowns returning minute-of-day (PRD §3.5 usability).
  - `<AddLotsForm />` — pick product + count, calls `addLots`.
  - `<LineStopPanel />` — line-stop log table + "+ Line Stop" form calling `addLineStop`.

- [ ] **Step 1: Write `src/components/TimeSelect.tsx`**

```tsx
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
```

- [ ] **Step 2: Write `src/components/AddLotsForm.tsx`**

```tsx
import { useState } from 'react';
import { useBoardStore } from '../store/boardStore';
import type { ProductCode } from '../domain/types';

export default function AddLotsForm() {
  const products = useBoardStore((s) => s.products);
  const addLots = useBoardStore((s) => s.addLots);
  const resetBoard = useBoardStore((s) => s.resetBoard);
  const [code, setCode] = useState<ProductCode>('2TR');
  const [count, setCount] = useState(1);

  return (
    <div className="flex items-center gap-2 text-xs p-2 border border-cyan-500/50">
      <span className="text-green-400 font-bold">+ LOT</span>
      <select
        className="bg-black border border-cyan-500 text-white px-1"
        value={code}
        onChange={(e) => setCode(e.target.value as ProductCode)}
      >
        {products.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
      </select>
      <input
        type="number"
        min={1}
        className="bg-black border border-cyan-500 text-white w-14 px-1"
        value={count}
        onChange={(e) => setCount(Math.max(1, Number(e.target.value)))}
      />
      <button
        className="bg-cyan-700 hover:bg-cyan-600 px-2 py-0.5 rounded"
        onClick={() => addLots([{ productCode: code, count }])}
      >
        Tambah
      </button>
      <button
        className="ml-auto bg-gray-700 hover:bg-gray-600 px-2 py-0.5 rounded"
        onClick={resetBoard}
      >
        Reset
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Write `src/components/LineStopPanel.tsx`**

```tsx
import { useState } from 'react';
import { useBoardStore } from '../store/boardStore';
import { toHHmm } from '../lib/time';
import TimeSelect from './TimeSelect';

export default function LineStopPanel() {
  const lineStops = useBoardStore((s) => s.lineStops);
  const addLineStop = useBoardStore((s) => s.addLineStop);
  const removeLineStop = useBoardStore((s) => s.removeLineStop);
  const [start, setStart] = useState(8 * 60 + 45);
  const [end, setEnd] = useState(8 * 60 + 50);
  const [ket, setKet] = useState('');

  const submit = () => {
    if (end <= start || !ket.trim()) return;
    addLineStop(start, end, ket.trim());
    setKet('');
  };

  return (
    <div className="border-2 border-red-600/70 text-white text-xs">
      <div className="bg-red-900/40 px-2 py-1 font-bold text-green-400">INFORMASI LINE STOP</div>

      <div className="flex flex-wrap items-center gap-2 p-2 border-b border-red-600/40">
        <span>Mulai</span><TimeSelect value={start} onChange={setStart} />
        <span>Selesai</span><TimeSelect value={end} onChange={setEnd} />
        <input
          className="bg-black border border-cyan-500 px-1 flex-1 min-w-[8rem]"
          placeholder="Keterangan (mis. F.Releasing LS Fault)"
          value={ket}
          onChange={(e) => setKet(e.target.value)}
        />
        <button className="bg-red-700 hover:bg-red-600 px-2 py-0.5 rounded" onClick={submit}>
          + Line Stop
        </button>
      </div>

      <table className="w-full text-[11px]">
        <thead className="text-green-400">
          <tr className="border-b border-red-600/40">
            <th className="text-left px-2 py-1">TIME</th>
            <th className="text-left px-2 py-1">DUR</th>
            <th className="text-left px-2 py-1">PROBLEM</th>
            <th className="px-2 py-1"></th>
          </tr>
        </thead>
        <tbody>
          {lineStops.length === 0 && (
            <tr><td colSpan={4} className="px-2 py-2 text-gray-500">Belum ada line stop.</td></tr>
          )}
          {lineStops.map((s) => (
            <tr key={s.id} className="border-b border-red-600/20">
              <td className="px-2 py-1 tabular-nums">{toHHmm(s.startMin)}–{toHHmm(s.endMin)}</td>
              <td className="px-2 py-1">{s.durationMin}'</td>
              <td className="px-2 py-1">{s.keterangan}</td>
              <td className="px-2 py-1 text-right">
                <button className="text-red-400 hover:text-red-200" onClick={() => removeLineStop(s.id)}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Wire into `src/App.tsx`**

```tsx
import BoardHeader from './components/BoardHeader';
import TimeGrid from './components/TimeGrid';
import AddLotsForm from './components/AddLotsForm';
import LineStopPanel from './components/LineStopPanel';

export default function App() {
  return (
    <div className="min-h-full bg-black p-2 text-white space-y-1">
      <BoardHeader />
      <div className="flex gap-1">
        <div className="flex-1 space-y-1">
          <AddLotsForm />
          <TimeGrid />
        </div>
        <div className="w-80 shrink-0 space-y-1">
          <LineStopPanel />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/TimeSelect.tsx src/components/AddLotsForm.tsx src/components/LineStopPanel.tsx src/App.tsx
git commit -m "feat: add-lots form and line-stop panel"
```

---

### Task 11: Model summary (PLAN / ACTUAL)

**Files:**
- Create: `src/lib/summary.ts`
- Create: `src/components/ModelSummary.tsx`
- Test: `src/lib/summary.test.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `PlanLot`, `Product`, `deriveActual`.
- Produces:
  - `summarize(products, planLots, actualLots): SummaryRow[]` with a TOTAL row appended, where `interface SummaryRow { code: string; label: string; plan: number; actual: number }`.
  - `<ModelSummary />`.

- [ ] **Step 1: Write the failing test**

`src/lib/summary.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { summarize } from './summary';
import { DEFAULT_PRODUCTS } from '../domain/defaults';
import type { PlanLot } from '../domain/types';

const lot = (code: PlanLot['productCode'], no: number, start: number): PlanLot => ({
  id: `${code}-${no}`, productCode: code, lotNo: no, startMin: start, endMin: start + 5, shifted: false,
});

describe('summarize', () => {
  it('counts plan and actual per product with a TOTAL row', () => {
    const plan = [lot('2TR', 1, 420), lot('2TR', 2, 425), lot('1TR', 1, 430)];
    const actual = [lot('2TR', 1, 420)];
    const rows = summarize(DEFAULT_PRODUCTS, plan, actual);
    const twoTr = rows.find((r) => r.code === '2TR')!;
    expect([twoTr.plan, twoTr.actual]).toEqual([2, 1]);
    const total = rows.find((r) => r.code === 'TOTAL')!;
    expect([total.plan, total.actual]).toEqual([3, 1]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/summary.test.ts`
Expected: FAIL — cannot resolve `./summary`.

- [ ] **Step 3: Write `src/lib/summary.ts`**

```ts
import type { PlanLot, Product } from '../domain/types';

export interface SummaryRow { code: string; label: string; plan: number; actual: number; }

export function summarize(
  products: Product[], planLots: PlanLot[], actualLots: PlanLot[],
): SummaryRow[] {
  const rows: SummaryRow[] = products.map((p) => ({
    code: p.code,
    label: p.label,
    plan: planLots.filter((l) => l.productCode === p.code).length,
    actual: actualLots.filter((l) => l.productCode === p.code).length,
  }));
  rows.push({
    code: 'TOTAL',
    label: 'TOTAL',
    plan: planLots.length,
    actual: actualLots.length,
  });
  return rows;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/summary.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Write `src/components/ModelSummary.tsx`**

```tsx
import { useMemo } from 'react';
import { useBoardStore } from '../store/boardStore';
import { deriveActual } from '../lib/scheduling';
import { summarize } from '../lib/summary';
import { useNowMin } from '../hooks/useNowMin';

export default function ModelSummary() {
  const { products, planLots } = useBoardStore();
  const nowMin = useNowMin();
  const actual = useMemo(() => deriveActual(planLots, nowMin), [planLots, nowMin]);
  const rows = summarize(products, planLots, actual);

  return (
    <table className="w-full text-[11px] border-2 border-cyan-500/60 text-white">
      <thead className="text-green-400">
        <tr className="border-b border-cyan-500/40">
          <th className="text-left px-2 py-1">MODEL</th>
          <th className="px-2 py-1">PLAN</th>
          <th className="px-2 py-1">ACTUAL</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.code} className={r.code === 'TOTAL' ? 'font-bold border-t border-cyan-500/40' : ''}>
            <td className="px-2 py-0.5">{r.label}</td>
            <td className="px-2 py-0.5 text-center tabular-nums">{r.plan}</td>
            <td className="px-2 py-0.5 text-center tabular-nums">{r.actual}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 6: Wire into `src/App.tsx`** (add `ModelSummary` under `LineStopPanel` in the right column)

```tsx
import BoardHeader from './components/BoardHeader';
import TimeGrid from './components/TimeGrid';
import AddLotsForm from './components/AddLotsForm';
import LineStopPanel from './components/LineStopPanel';
import ModelSummary from './components/ModelSummary';

export default function App() {
  return (
    <div className="min-h-full bg-black p-2 text-white space-y-1">
      <BoardHeader />
      <div className="flex gap-1">
        <div className="flex-1 space-y-1">
          <AddLotsForm />
          <TimeGrid />
        </div>
        <div className="w-80 shrink-0 space-y-1">
          <LineStopPanel />
          <ModelSummary />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Verify build + full test suite**

Run: `npm run build && npm test`
Expected: build PASS, all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/summary.ts src/lib/summary.test.ts src/components/ModelSummary.tsx src/App.tsx
git commit -m "feat: model plan/actual summary"
```

---

### Task 12: Visual verification + polish

**Files:**
- Create: `.claude/launch.json`
- Modify: component styles as needed (PLN/ACT row placement, colors, spacing)

**Interfaces:**
- Consumes: everything above. No new exports.

- [ ] **Step 1: Create `.claude/launch.json`**

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "shikake-dev", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 5173 }
  ]
}
```

- [ ] **Step 2: Start the dev server and load a demo dataset**

Start server `shikake-dev` (preview tool). In the browser, use the Add-Lots form to add ~90 lots of 2TR, 24 of KAI, 6 of CRANK; then add a line stop 08:45–08:50 "F.Releasing LS Fault".

- [ ] **Step 3: Screenshot and compare to the reference board**

Verify against the `prd.md` reference photo:
- PLN row sits directly above ACT row in every hour band; lot boxes land in the correct 5-minute columns.
- Break blocks (Dandori, Wakom-1/2, Istirahat…) render as blue translucent overlays at their times.
- The line stop renders as a red block at 08:45–08:50 and lots after it are visibly shifted (red outline).
- ACT row only fills up to the current clock minute.
- Model summary totals match the number of lots added.

Fix any row-placement / color / spacing issues found (tune colors and grid-row heights in `TimeGrid.tsx` to match the reference).

- [ ] **Step 4: Final build + test**

Run: `npm run build && npm test`
Expected: build PASS, all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: launch config and visual polish to match reference board"
```

---

## Self-Review

**Spec coverage:**
- §3.1 Grid matrix (PLN/ACT, minute columns, break blocks) → Tasks 9, 2.
- §3.2 Products + per-product lot numbering + small-lot input → Tasks 2, 4, 10.
- §3.3 ACT auto-fill from clock → Tasks 5, 8, 9.
- §3.4 Line Stop form + auto-shift → Tasks 6, 10.
- §4 Non-functional (dark palette, time-picker dropdowns, reliability) → Tasks 8–10; pure sync engine Task 6.
- §5 Tech stack (React/Vite/Tailwind/Zustand/Day.js/localStorage) → Tasks 1, 7.
- Deferred §3.5 Tapping Furnace → explicitly out of scope (Global Constraints).

**Placeholder scan:** No TBD/TODO; every code step contains complete code. The only judgment step is Task 12 visual polish, which is inherent to UI matching and bounded by an explicit checklist.

**Type consistency:** `PlanLot`, `ShiftConfig`, `LineStop`, `LotRequest`, `ProductCode`, `Range`, `SummaryRow` used identically across tasks. Function names consistent: `autoPlaceLots`, `placeSequence`, `deriveActual`, `applyLineStops`, `makeLineStop`, `colSpan`, `hourRange`, `summarize`. Store actions `addLots`/`addLineStop`/`removeLineStop`/`resetBoard` match between definition (Task 7) and consumers (Tasks 8–11). `LotBoxes` takes a `row` prop so PLN renders on grid row 1 and ACT on row 2.
