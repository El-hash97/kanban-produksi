# Neon-backed live sync for the production board

**Date:** 2026-09-14
**Status:** Approved

## Purpose

The board currently lives only in one browser's `localStorage` (Zustand
`persist` middleware, see [boardStore.ts](../../../src/store/boardStore.ts)).
The user wants to test the app in real production use across multiple
devices on the shop floor, where every device should see the same live
board. This requires a shared datastore (Neon Postgres) and a thin API
between the browser and the database.

## Decisions (from brainstorming)

- **Scope:** one global board, shared by all devices. No multi-board /
  multi-line concept.
- **Sync feel:** lightweight polling (a few seconds), not real-time
  WebSocket/SSE — the board changes on the order of minutes, not
  sub-second.
- **Access:** no auth on the API for this testing phase. Internal use only.
  Revisit if/when this goes to real, unrestricted production.
- **Hosting:** Vercel. API lives as Vercel serverless functions under `api/`.
- **Conflict resolution:** last-write-wins over the whole state blob. Not a
  CRDT; acceptable because this is a single shared board being tested, not
  a high-concurrency multi-writer system.

## Data model

One table, one row. The current `BoardState` is already a single JSON-
serializable object (that's what `persist` writes to `localStorage` today),
so the schema mirrors that instead of normalizing into many tables:

```sql
create table board_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

insert into board_state (id, data) values ('main', '{}'::jsonb);
```

## API

Vercel serverless function, `api/board.ts`, using `@neondatabase/serverless`
(Neon's purpose-built low-latency driver for serverless/edge — the standard
choice here since nothing in the repo talks to Postgres yet). No auth.

- `GET /api/board` → `{ data: BoardState, updatedAt: string }`
- `PUT /api/board` with body `{ data: BoardState }` → upserts row `'main'`,
  sets `updated_at = now()`, returns the new `{ data, updatedAt }`.

## Client sync

New `src/hooks/useBoardSync.ts`, wired once in `App.tsx`, alongside (not
replacing) the existing `persist` localStorage middleware — localStorage
stays as the instant-load / offline fallback.

- Subscribes to the store; on change, debounces ~1s, then `PUT`s the whole
  state to `/api/board`. Remembers the timestamp of its own last push.
- Polls `GET /api/board` every ~4s. If the server's `updatedAt` is newer
  than what this client already knows about (and isn't just an echo of its
  own last push), replaces local state via `useBoardStore.setState(data,
  true)`.
- Whole-state overwrite, last-write-wins, as decided above.

## Environment / deployment

- `DATABASE_URL` (Neon connection string) as a Vercel env var for
  production, and in a gitignored `.env.local` for local dev.
- The app is plain Vite (not Next.js), so `npm run dev` won't serve
  `/api/*`. For local end-to-end testing of the sync, use `vercel dev`
  instead of standing up a separate dev server — the app is deploying to
  Vercel anyway, so this avoids a second, divergent local backend.
- The Neon project/database itself is provisioned via the Neon MCP tools
  already connected in this session, with the user's explicit go-ahead
  before creation.

## Out of scope (YAGNI for this phase)

- Auth / API keys
- Multi-board support
- Real-time push (WebSocket/SSE)
- Per-field conflict resolution / CRDTs
- Formal schema migration tooling (one table, applied once)
