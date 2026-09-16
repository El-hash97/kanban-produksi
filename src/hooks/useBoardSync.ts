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
          // Re-check the server right before pushing, and if it already has
          // a newer shiftConfig/shiftPresets (someone else just changed a
          // Wakom/Istirahat time on another device), carry that forward
          // instead of the copy this device had when it started editing.
          // Otherwise an unrelated local edit here (moving a lot, say) would
          // push this device's stale schedule and silently revert the other
          // device's change — the one shared schedule every device must
          // agree on for live production use.
          let outgoing = pickPersistedState(state);
          const fresh = await fetchBoard();
          const isNewer = lastKnownUpdatedAt.current === null
            || fresh.updatedAt > lastKnownUpdatedAt.current;
          if (isNewer && Object.keys(fresh.data).length > 0) {
            applyingRemote.current = true;
            useBoardStore.setState({
              shiftConfig: fresh.data.shiftConfig,
              shiftPresets: fresh.data.shiftPresets,
            });
            applyingRemote.current = false;
            outgoing = pickPersistedState(useBoardStore.getState());
          }
          const snapshot = await pushBoard(outgoing);
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
