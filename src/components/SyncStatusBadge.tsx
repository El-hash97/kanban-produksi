import { useSyncStatusStore } from '../store/syncStatusStore';

// Makes a broken /api/board sync visible on the shop floor instead of
// failing silently — before this, a device stuck on stale or empty data
// gave no clue why, since useBoardSync only logs nothing and swallows
// the error so localStorage keeps the board usable offline.
export default function SyncStatusBadge() {
  const status = useSyncStatusStore((s) => s.status);
  const lastError = useSyncStatusStore((s) => s.lastError);

  if (status === 'idle') return null;

  if (status === 'error') {
    return (
      <span
        className="px-2 py-0.5 rounded bg-red-900/60 border border-red-500 text-red-300"
        title={lastError ?? undefined}
      >
        ● SYNC ERROR
      </span>
    );
  }

  return (
    <span className="px-2 py-0.5 rounded bg-green-900/40 border border-green-600 text-green-400">
      ● LIVE
    </span>
  );
}
