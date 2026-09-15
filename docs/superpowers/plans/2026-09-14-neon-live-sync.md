# Neon Live Board Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let every device on the shop floor see the same live production board by backing it with a shared Neon Postgres database instead of only per-browser `localStorage`.

**Architecture:** A Vercel serverless function (`api/board.ts`) sits between the browser and Neon, upserting/reading a single JSONB row that mirrors the board's existing plain-data shape. A new `useBoardSync` hook pushes local changes to it (debounced) and polls it for changes from other devices, merging by last-write-wins. The existing `localStorage` persistence is untouched — it stays as the instant-load/offline fallback.

**Tech Stack:** `@neondatabase/serverless` (Neon's serverless Postgres driver), Vercel serverless functions using the Fetch API handler signature (`Request` → `Response`, no extra `@vercel/node` dependency needed), Zustand (existing store), Vitest (existing test runner).

**Spec:** [docs/superpowers/specs/2026-09-14-neon-live-sync-design.md](../specs/2026-09-14-neon-live-sync-design.md)

## Global Constraints

- One global board, one row (`id = 'main'`) in one table (`board_state`). No multi-board support.
- No auth on the API — internal testing phase only.
- Sync via polling every ~4s; local pushes debounced ~1s. No WebSocket/SSE.
- Conflict resolution is last-write-wins over the whole persisted-state blob — no per-field merge, no CRDT.
- Hosting is Vercel; the API lives under `api/`.
- No new dependency beyond `@neondatabase/serverless` (pinned `^1.1.0`, the current latest).

---

### Task 1: Provision the Neon database

**Files:**
- Create: `db/schema.sql`

**Interfaces:**
- Produces: a live Neon Postgres database reachable via a `DATABASE_URL` connection string, containing a `board_state` table with columns `id text primary key`, `data jsonb not null`, `updated_at timestamptz not null default now()`, seeded with one row `('main', '{}'::jsonb)`. Later tasks (API, local dev, Vercel env) depend on this connection string.

This task is infrastructure, not application code — no unit test. It's done by you (the agent driving this plan), not delegated to a fresh subagent, because it uses the Neon MCP tools already connected in this session and needs the user's explicit go-ahead before creating a billable cloud resource.

- [ ] **Step 1: Write the schema file**

```sql
-- db/schema.sql
-- Run once against the Neon database backing the shared production board.
-- See docs/superpowers/specs/2026-09-14-neon-live-sync-design.md.

create table if not exists board_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

insert into board_state (id, data)
values ('main', '{}'::jsonb)
on conflict (id) do nothing;
```

- [ ] **Step 2: Ask the user to confirm before creating the Neon project**

Ask explicitly: "I'll create a new Neon project (e.g. `kanban-produksi`) using the connected Neon MCP tools — OK to proceed?" Wait for a clear yes before Step 3.

- [ ] **Step 3: Create the project**

Call `mcp__neon__create_project` with a name like `kanban-produksi`. Note the returned `project_id` and default `branch_id`.

- [ ] **Step 4: Apply the schema**

Call `mcp__neon__run_sql` against that project/branch with the contents of `db/schema.sql`.

- [ ] **Step 5: Get the connection string**

Call `mcp__neon__get_connection_string` for that project/branch/database. Keep it — Task 6 needs it for `.env.local` and the Vercel dashboard.

- [ ] **Step 6: Commit the schema file**

```bash
git add db/schema.sql
git commit -m "chore: add Neon board_state schema

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Export the persisted-state slice from the board store

**Files:**
- Modify: `src/store/boardStore.ts:16-65` (split `BoardState` into a data-only `PersistedBoardState` plus the action methods), and add a `pickPersistedState` helper after the `nextId` helper (currently `src/store/boardStore.ts:73-77`)
- Test: `src/store/boardStore.test.ts`

**Interfaces:**
- Produces: `export interface PersistedBoardState { shiftConfig, shiftPresets, products, planLots, lineStops, furnaceOverrides, activeDay, planningHistory, informasiLog, sandPerMixing }` (exact field types unchanged from today's `BoardState`), and `export function pickPersistedState(state: BoardState): PersistedBoardState`. Tasks 4 and 5 import both from `../store/boardStore`.

- [ ] **Step 1: Write the failing test**

Add to `src/store/boardStore.test.ts` (near the top-level `describe('boardStore', ...)` block, as a sibling `describe`):

```typescript
import { pickPersistedState } from './boardStore';

describe('pickPersistedState', () => {
  it('returns only the persisted data fields, no actions', () => {
    const persisted = pickPersistedState(useBoardStore.getState());
    expect(Object.keys(persisted).sort()).toEqual([
      'activeDay', 'furnaceOverrides', 'informasiLog', 'lineStops',
      'planLots', 'planningHistory', 'products', 'sandPerMixing',
      'shiftConfig', 'shiftPresets',
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- boardStore`
Expected: FAIL — `pickPersistedState` is not exported from `./boardStore`.

- [ ] **Step 3: Split `BoardState` and add `pickPersistedState`**

In `src/store/boardStore.ts`, replace lines 16–35 (the data fields at the top of `interface BoardState`, up to and including `sandPerMixing: number;`) with:

```typescript
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
  planLots: PlanLot[];
  lineStops: LineStop[];
  // Manual furnace reassignments for the Tapping Furnace panel, keyed by
  // TappingGroup.id (stable per-tap id derived from its first lot).
  furnaceOverrides: Record<string, FurnaceId>;
  // Which break schedule (DAY vs FRIDAY) is currently driving the board.
  // Auto-set from the real date on load (persist merge); overridable for
  // the running session via setActiveDay.
  activeDay: DayType;
  planningHistory: PlanningSnapshot[];
  informasiLog: InformasiNote[];
  sandPerMixing: number;
}

interface BoardState extends PersistedBoardState {
```

(The rest of the original `interface BoardState` body — `addLots` through `resetBoard: () => void;`, and the closing `}` — stays exactly as it is; it's now the action methods appended after the `extends`.)

Then, immediately after the `nextId` helper (currently ending at `src/store/boardStore.ts:77`, right before `export const useBoardStore = create<BoardState>()(`), add:

```typescript
// Strips the action functions off the live store, leaving just the data
// useBoardSync needs to push to (or compare against) the server.
export function pickPersistedState(state: BoardState): PersistedBoardState {
  const {
    shiftConfig, shiftPresets, products, planLots, lineStops,
    furnaceOverrides, activeDay, planningHistory, informasiLog, sandPerMixing,
  } = state;
  return {
    shiftConfig, shiftPresets, products, planLots, lineStops,
    furnaceOverrides, activeDay, planningHistory, informasiLog, sandPerMixing,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- boardStore`
Expected: PASS (all existing `boardStore.test.ts` tests too — the field set and behavior haven't changed, only how the type is composed).

- [ ] **Step 5: Commit**

```bash
git add src/store/boardStore.ts src/store/boardStore.test.ts
git commit -m "refactor: export PersistedBoardState and pickPersistedState

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `api/board.ts` Vercel function

**Files:**
- Create: `api/board.ts`
- Test: `api/board.test.ts`
- Modify: `tsconfig.json` (add `"api"` to `include`, so `npm run build`'s `tsc --noEmit` type-checks it)
- Modify: `package.json` (add `@neondatabase/serverless` to `dependencies`)

**Interfaces:**
- Consumes: `process.env.DATABASE_URL` at request time.
- Produces: `export type SqlClient = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>`, `export function createHandler(sql: SqlClient)` returning a `(request: Request) => Promise<Response>` handler, and `export default` the handler wired to a real Neon client. `GET` → `200 { data, updatedAt }`. `PUT` with body `{ data }` → `200 { data, updatedAt }` (upserted). Anything else → `405`.

- [ ] **Step 1: Add the dependency**

In `package.json`, add to `"dependencies"` (keep alphabetical, matching the existing list):

```json
    "@neondatabase/serverless": "^1.1.0",
    "dayjs": "^1.11.13",
```

Run: `npm install`

- [ ] **Step 2: Add `api` to the TypeScript build's include list**

In `tsconfig.json`, change:

```json
  "include": ["src"]
```

to:

```json
  "include": ["src", "api"]
```

- [ ] **Step 3: Write the failing test**

Create `api/board.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createHandler, type SqlClient } from './board';

function makeSql(rows: Record<string, unknown>[]): SqlClient {
  return vi.fn(async () => rows) as unknown as SqlClient;
}

describe('api/board handler', () => {
  it('GET returns empty data when no row exists yet', async () => {
    const handler = createHandler(makeSql([]));
    const res = await handler(new Request('http://test/api/board', { method: 'GET' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({});
  });

  it('GET returns the stored row', async () => {
    const sql = makeSql([{ data: { foo: 'bar' }, updated_at: '2026-09-14T00:00:00.000Z' }]);
    const handler = createHandler(sql);
    const res = await handler(new Request('http://test/api/board', { method: 'GET' }));
    const body = await res.json();
    expect(body).toEqual({ data: { foo: 'bar' }, updatedAt: '2026-09-14T00:00:00.000Z' });
  });

  it('PUT upserts and returns the new row', async () => {
    const sql = makeSql([{ data: { foo: 'baz' }, updated_at: '2026-09-14T01:00:00.000Z' }]);
    const handler = createHandler(sql);
    const res = await handler(new Request('http://test/api/board', {
      method: 'PUT',
      body: JSON.stringify({ data: { foo: 'baz' } }),
    }));
    const body = await res.json();
    expect(body).toEqual({ data: { foo: 'baz' }, updatedAt: '2026-09-14T01:00:00.000Z' });
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it('rejects unsupported methods with 405', async () => {
    const handler = createHandler(makeSql([]));
    const res = await handler(new Request('http://test/api/board', { method: 'DELETE' }));
    expect(res.status).toBe(405);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test -- api/board`
Expected: FAIL — `./board` (i.e. `api/board.ts`) doesn't exist yet.

- [ ] **Step 5: Implement the handler**

Create `api/board.ts`:

```typescript
import { neon } from '@neondatabase/serverless';

// A minimal structural type for Neon's tagged-template SQL client — just
// what this handler calls it with. Keeping it local (instead of importing
// Neon's own, much wider type) is what makes createHandler easy to test
// with a plain vi.fn() in place of a real database connection.
export type SqlClient = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<Record<string, unknown>[]>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function createHandler(sql: SqlClient) {
  return async function handler(request: Request): Promise<Response> {
    if (request.method === 'GET') {
      const rows = await sql`select data, updated_at from board_state where id = 'main'`;
      const row = rows[0];
      if (!row) {
        return json({ data: {}, updatedAt: new Date(0).toISOString() });
      }
      return json({ data: row.data, updatedAt: row.updated_at });
    }

    if (request.method === 'PUT') {
      const body = (await request.json()) as { data: unknown };
      const rows = await sql`
        insert into board_state (id, data, updated_at)
        values ('main', ${JSON.stringify(body.data)}::jsonb, now())
        on conflict (id) do update set data = excluded.data, updated_at = now()
        returning data, updated_at
      `;
      const row = rows[0];
      return json({ data: row.data, updatedAt: row.updated_at });
    }

    return new Response('Method Not Allowed', { status: 405 });
  };
}

// neon()'s return value is callable as a tagged template exactly like
// SqlClient describes, plus extra methods (.query(), etc.) this handler
// never uses — the cast just narrows to the slice we actually call.
export default createHandler(neon(process.env.DATABASE_URL!) as unknown as SqlClient);
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- api/board`
Expected: PASS (4 tests)

- [ ] **Step 7: Run the full build to confirm `api/` type-checks**

Run: `npm run build`
Expected: succeeds (no TypeScript errors in `api/board.ts`)

- [ ] **Step 8: Commit**

```bash
git add api/board.ts api/board.test.ts tsconfig.json package.json package-lock.json
git commit -m "feat: add /api/board Vercel function backed by Neon

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Client fetch wrapper (`src/lib/boardSyncApi.ts`)

**Files:**
- Create: `src/lib/boardSyncApi.ts`
- Test: `src/lib/boardSyncApi.test.ts`

**Interfaces:**
- Consumes: `PersistedBoardState` from `../store/boardStore` (Task 2); the global `fetch`.
- Produces: `export interface BoardSnapshot { data: PersistedBoardState; updatedAt: string }`, `export function fetchBoard(): Promise<BoardSnapshot>`, `export function pushBoard(data: PersistedBoardState): Promise<BoardSnapshot>`. Task 5 imports both.

- [ ] **Step 1: Write the failing test**

Create `src/lib/boardSyncApi.test.ts`:

```typescript
import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';
import { fetchBoard, pushBoard } from './boardSyncApi';
import { DEFAULT_PRODUCTS, DEFAULT_SHIFT } from '../domain/defaults';
import type { PersistedBoardState } from '../store/boardStore';

const persisted: PersistedBoardState = {
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
};
const snapshot = { data: persisted, updatedAt: '2026-09-14T00:00:00.000Z' };

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(snapshot), { status: 200 })));
});

describe('boardSyncApi', () => {
  it('fetchBoard GETs /api/board', async () => {
    const result = await fetchBoard();
    expect(result).toEqual(snapshot);
    expect(fetch).toHaveBeenCalledWith('/api/board');
  });

  it('pushBoard PUTs the data payload to /api/board', async () => {
    await pushBoard(persisted);
    expect(fetch).toHaveBeenCalledWith('/api/board', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ data: persisted }),
    }));
  });

  it('fetchBoard throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('err', { status: 500 })));
    await expect(fetchBoard()).rejects.toThrow('fetchBoard failed: 500');
  });

  it('pushBoard throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('err', { status: 500 })));
    await expect(pushBoard(persisted)).rejects.toThrow('pushBoard failed: 500');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- boardSyncApi`
Expected: FAIL — `./boardSyncApi` doesn't exist yet.

- [ ] **Step 3: Implement**

Create `src/lib/boardSyncApi.ts`:

```typescript
import type { PersistedBoardState } from '../store/boardStore';

export interface BoardSnapshot {
  data: PersistedBoardState;
  updatedAt: string;
}

export async function fetchBoard(): Promise<BoardSnapshot> {
  const res = await fetch('/api/board');
  if (!res.ok) throw new Error(`fetchBoard failed: ${res.status}`);
  return res.json() as Promise<BoardSnapshot>;
}

export async function pushBoard(data: PersistedBoardState): Promise<BoardSnapshot> {
  const res = await fetch('/api/board', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) throw new Error(`pushBoard failed: ${res.status}`);
  return res.json() as Promise<BoardSnapshot>;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- boardSyncApi`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/boardSyncApi.ts src/lib/boardSyncApi.test.ts
git commit -m "feat: add fetchBoard/pushBoard client for /api/board

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: `useBoardSync` hook

**Files:**
- Create: `src/hooks/useBoardSync.ts`
- Test: `src/hooks/useBoardSync.test.ts`

**Interfaces:**
- Consumes: `useBoardStore`, `pickPersistedState`, `type PersistedBoardState` from `../store/boardStore` (Task 2); `fetchBoard`, `pushBoard` from `../lib/boardSyncApi` (Task 4).
- Produces: `export function useBoardSync(): void`. Task 6 calls it once from `App.tsx`.

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useBoardSync.test.ts`:

```typescript
import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBoardSync } from './useBoardSync';
import { useBoardStore } from '../store/boardStore';
import { fetchBoard, pushBoard } from '../lib/boardSyncApi';
import { DEFAULT_PRODUCTS, DEFAULT_SHIFT } from '../domain/defaults';

vi.mock('../lib/boardSyncApi', () => ({
  fetchBoard: vi.fn(),
  pushBoard: vi.fn(),
}));

const basePersisted = {
  shiftConfig: DEFAULT_SHIFT,
  shiftPresets: { [DEFAULT_SHIFT.shiftNo]: DEFAULT_SHIFT },
  products: DEFAULT_PRODUCTS,
  planLots: [],
  lineStops: [],
  furnaceOverrides: {},
  activeDay: 'DAY' as const,
  planningHistory: [],
  informasiLog: [],
  sandPerMixing: 2700,
};

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  useBoardStore.setState(basePersisted);
  vi.mocked(fetchBoard).mockResolvedValue({ data: {} as never, updatedAt: new Date(0).toISOString() });
  vi.mocked(pushBoard).mockResolvedValue({ data: basePersisted, updatedAt: '2026-09-14T00:00:01.000Z' });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useBoardSync', () => {
  it('pulls once on mount', async () => {
    renderHook(() => useBoardSync());
    await vi.runOnlyPendingTimersAsync();
    expect(fetchBoard).toHaveBeenCalledTimes(1);
  });

  it('polls on an interval', async () => {
    renderHook(() => useBoardSync());
    await vi.runOnlyPendingTimersAsync();
    await vi.advanceTimersByTimeAsync(4000);
    expect(fetchBoard).toHaveBeenCalledTimes(2);
  });

  it('ignores an empty server snapshot (nothing pushed yet)', async () => {
    renderHook(() => useBoardSync());
    await vi.runOnlyPendingTimersAsync();
    expect(useBoardStore.getState().sandPerMixing).toBe(2700);
  });

  it('applies a newer non-empty snapshot from the server', async () => {
    vi.mocked(fetchBoard).mockResolvedValue({
      data: { ...basePersisted, sandPerMixing: 3000 },
      updatedAt: '2026-09-14T01:00:00.000Z',
    });
    renderHook(() => useBoardSync());
    await vi.runOnlyPendingTimersAsync();
    expect(useBoardStore.getState().sandPerMixing).toBe(3000);
  });

  it('does not push right after applying a pulled snapshot (no feedback loop)', async () => {
    vi.mocked(fetchBoard).mockResolvedValue({
      data: { ...basePersisted, sandPerMixing: 3000 },
      updatedAt: '2026-09-14T01:00:00.000Z',
    });
    renderHook(() => useBoardSync());
    await vi.runOnlyPendingTimersAsync();
    await vi.advanceTimersByTimeAsync(1000);
    expect(pushBoard).not.toHaveBeenCalled();
  });

  it('pushes a local edit after the debounce window', async () => {
    renderHook(() => useBoardSync());
    await vi.runOnlyPendingTimersAsync();
    useBoardStore.setState({ sandPerMixing: 3100 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(pushBoard).toHaveBeenCalledWith(expect.objectContaining({ sandPerMixing: 3100 }));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- useBoardSync`
Expected: FAIL — `./useBoardSync` doesn't exist yet.

- [ ] **Step 3: Implement**

Create `src/hooks/useBoardSync.ts`:

```typescript
import { useEffect, useRef } from 'react';
import {
  pickPersistedState, useBoardStore, type PersistedBoardState,
} from '../store/boardStore';
import { fetchBoard, pushBoard } from '../lib/boardSyncApi';

const PUSH_DEBOUNCE_MS = 1000;
const POLL_INTERVAL_MS = 4000;

function statesEqual(a: PersistedBoardState, b: PersistedBoardState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Keeps this browser's board in sync with the shared Neon-backed board:
// local edits are pushed (debounced) to /api/board, and a poll pulls in
// whatever's newer from other devices. Whole-state, last-write-wins — see
// docs/superpowers/specs/2026-09-14-neon-live-sync-design.md.
export function useBoardSync(): void {
  const lastKnownUpdatedAt = useRef<string | null>(null);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against the pull-triggered setState below immediately
  // re-triggering a push of the very data we just received.
  const applyingRemote = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function pull() {
      try {
        const snapshot = await fetchBoard();
        if (cancelled) return;
        const isNewer = lastKnownUpdatedAt.current === null
          || snapshot.updatedAt > lastKnownUpdatedAt.current;
        if (!isNewer) return;
        lastKnownUpdatedAt.current = snapshot.updatedAt;
        // An empty object means no one has pushed yet (fresh row) — never
        // let that overwrite whatever's already on this device.
        if (Object.keys(snapshot.data).length === 0) return;
        if (statesEqual(snapshot.data, pickPersistedState(useBoardStore.getState()))) return;
        applyingRemote.current = true;
        useBoardStore.setState(snapshot.data);
        applyingRemote.current = false;
      } catch {
        // Offline or the API isn't reachable yet — localStorage keeps the
        // board usable; the next poll tries again.
      }
    }

    pull();
    const pollId = setInterval(pull, POLL_INTERVAL_MS);

    const unsubscribe = useBoardStore.subscribe((state) => {
      if (applyingRemote.current) return;
      if (pushTimer.current) clearTimeout(pushTimer.current);
      pushTimer.current = setTimeout(async () => {
        try {
          const snapshot = await pushBoard(pickPersistedState(state));
          lastKnownUpdatedAt.current = snapshot.updatedAt;
        } catch {
          // Next edit (or the next poll) will retry.
        }
      }, PUSH_DEBOUNCE_MS);
    });

    return () => {
      cancelled = true;
      clearInterval(pollId);
      unsubscribe();
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
  }, []);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- useBoardSync`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useBoardSync.ts src/hooks/useBoardSync.test.ts
git commit -m "feat: add useBoardSync hook for push/poll sync with /api/board

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Wire it into the app, configure env, verify end-to-end

**Files:**
- Modify: `src/App.tsx:1-27` (import and call the hook)
- Create: `.env.local.example`
- Modify: `.gitignore` (ignore real `.env.local`)

**Interfaces:**
- Consumes: `useBoardSync` from `../hooks/useBoardSync` (Task 5); the `DATABASE_URL` connection string from Task 1.

- [ ] **Step 1: Wire the hook into `App.tsx`**

In `src/App.tsx`, add the import after the existing `useBoardStore` import (line 10):

```typescript
import { useBoardSync } from './hooks/useBoardSync';
```

Then, as the first line inside `export default function App() {` (before the existing `useState` calls at lines 21-24):

```typescript
  useBoardSync();
```

- [ ] **Step 2: Add local-dev env files**

Create `.env.local.example`:

```
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
```

Add to `.gitignore`:

```
.env*.local
```

Create the real `.env.local` (not committed — `.gitignore` covers it) with the actual connection string from Task 1, Step 5.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS, all tests including the new ones from Tasks 2–5.

- [ ] **Step 4: Run the build**

Run: `npm run build`
Expected: succeeds (type-checks `src` and `api`, then builds).

- [ ] **Step 5: Verify locally with `vercel dev`**

`npm run dev` won't serve `/api/*` — this app is plain Vite, not Next.js. Use the Vercel CLI instead, which proxies the Vite dev server and runs the API functions together:

```bash
npx vercel dev
```

On first run it asks to link a project — accept the defaults. Open the printed local URL in two separate browser tabs. In one tab, add some lots or change a setting; within ~5 seconds the other tab should show the same change (confirms push + poll + merge all work against the real Neon database from Task 1).

- [ ] **Step 6: Deploy and set the Vercel env var**

Either via the Vercel dashboard (Project Settings → Environment Variables → add `DATABASE_URL` with the Task 1 connection string, for Production and Preview) or:

```bash
npx vercel env add DATABASE_URL
```

Then deploy:

```bash
npx vercel --prod
```

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx .env.local.example .gitignore
git commit -m "feat: wire useBoardSync into App

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
