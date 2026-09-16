import { create } from 'zustand';

// Separate from boardStore (and never persisted) — this is connectivity
// info about the sync itself, not board data. Surfaced in the UI so a
// failing sync is visible on the shop floor instead of failing silently
// (see useBoardSync's pull/push catch blocks): a device stuck showing old
// or empty data because /api/board is erroring should say so, not look
// like a normal, quiet board.
export type SyncStatus = 'idle' | 'ok' | 'error';

interface SyncStatusState {
  status: SyncStatus;
  lastError: string | null;
  lastSyncedAt: string | null;
  reportOk: (at: string) => void;
  reportError: (message: string) => void;
}

export const useSyncStatusStore = create<SyncStatusState>((set) => ({
  status: 'idle',
  lastError: null,
  lastSyncedAt: null,
  reportOk: (at) => set({ status: 'ok', lastError: null, lastSyncedAt: at }),
  reportError: (message) => set({ status: 'error', lastError: message }),
}));
