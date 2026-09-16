import type { PersistedBoardState } from '../store/boardStore';

export interface BoardSnapshot {
  data: PersistedBoardState;
  updatedAt: string;
}

export async function fetchBoard(): Promise<BoardSnapshot> {
  const res = await fetch('/api/board', { cache: 'no-store' });
  if (!res.ok) throw new Error(`fetchBoard failed: ${res.status}`);
  return res.json() as Promise<BoardSnapshot>;
}

export async function pushBoard(data: PersistedBoardState): Promise<BoardSnapshot> {
  const res = await fetch('/api/board', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`pushBoard failed: ${res.status}`);
  return res.json() as Promise<BoardSnapshot>;
}
