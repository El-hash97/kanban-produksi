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
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchBoard).toHaveBeenCalledTimes(1);
  });

  it('polls on an interval', async () => {
    renderHook(() => useBoardSync());
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(4000);
    expect(fetchBoard).toHaveBeenCalledTimes(2);
  });

  it('ignores an empty server snapshot (nothing pushed yet)', async () => {
    renderHook(() => useBoardSync());
    await vi.advanceTimersByTimeAsync(0);
    expect(useBoardStore.getState().sandPerMixing).toBe(2700);
  });

  it('applies a newer non-empty snapshot from the server', async () => {
    vi.mocked(fetchBoard).mockResolvedValue({
      data: { ...basePersisted, sandPerMixing: 3000 },
      updatedAt: '2026-09-14T01:00:00.000Z',
    });
    renderHook(() => useBoardSync());
    await vi.advanceTimersByTimeAsync(0);
    expect(useBoardStore.getState().sandPerMixing).toBe(3000);
  });

  it('does not push right after applying a pulled snapshot (no feedback loop)', async () => {
    vi.mocked(fetchBoard).mockResolvedValue({
      data: { ...basePersisted, sandPerMixing: 3000 },
      updatedAt: '2026-09-14T01:00:00.000Z',
    });
    renderHook(() => useBoardSync());
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(pushBoard).not.toHaveBeenCalled();
  });

  it('pushes a local edit after the debounce window', async () => {
    renderHook(() => useBoardSync());
    await vi.advanceTimersByTimeAsync(0);
    useBoardStore.setState({ sandPerMixing: 3100 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(pushBoard).toHaveBeenCalledWith(expect.objectContaining({ sandPerMixing: 3100 }));
  });

  it('carries forward a newer shift schedule from another device instead of pushing a stale one', async () => {
    renderHook(() => useBoardSync());
    await vi.advanceTimersByTimeAsync(0); // initial pull; lastKnownUpdatedAt = epoch

    const otherDeviceShift = { ...DEFAULT_SHIFT, tTimeSec: 55 };
    vi.mocked(fetchBoard).mockResolvedValue({
      data: {
        ...basePersisted,
        shiftConfig: otherDeviceShift,
        shiftPresets: { [DEFAULT_SHIFT.shiftNo]: otherDeviceShift },
      },
      updatedAt: '2026-09-14T02:00:00.000Z',
    });

    // Edit something unrelated to the schedule (e.g. moving a lot).
    useBoardStore.setState({ sandPerMixing: 3100 });
    await vi.advanceTimersByTimeAsync(1000);

    expect(useBoardStore.getState().shiftConfig.tTimeSec).toBe(55);
    expect(pushBoard).toHaveBeenCalledWith(expect.objectContaining({
      shiftConfig: otherDeviceShift,
      sandPerMixing: 3100,
    }));
  });
});
