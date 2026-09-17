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
  shiftData: {},
  activeDay: 'DAY',
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
    expect(fetch).toHaveBeenCalledWith('/api/board', {
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    });
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

  it('fetchBoard passes an AbortSignal so a hung request eventually rejects instead of hanging forever', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })));
    const promise = fetchBoard();
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal as AbortSignal;
    signal.dispatchEvent(new Event('abort'));
    await expect(promise).rejects.toThrow();
  });
});
