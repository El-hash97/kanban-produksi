import type { PersistedBoardState } from '../store/boardStore';

export interface BoardSnapshot {
  data: PersistedBoardState;
  updatedAt: string;
}

// Without this, a request that never reaches Vercel at all (a flaky
// shop-floor Wi-Fi, a captive portal, a dropped connection) leaves the
// fetch promise pending forever — it neither resolves nor rejects, so
// useBoardSync's try/catch never runs and the sync status badge just stays
// blank instead of showing an error. The server's own 8s query timeout
// (api/board.ts) only helps once a request actually gets there.
const FETCH_TIMEOUT_MS = 10000;

export async function fetchBoard(): Promise<BoardSnapshot> {
  const res = await fetch('/api/board', { cache: 'no-store', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`fetchBoard failed: ${res.status}`);
  return res.json() as Promise<BoardSnapshot>;
}

export async function pushBoard(data: PersistedBoardState): Promise<BoardSnapshot> {
  const res = await fetch('/api/board', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data }),
    cache: 'no-store',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`pushBoard failed: ${res.status}`);
  return res.json() as Promise<BoardSnapshot>;
}
