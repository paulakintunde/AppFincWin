// D-17: pull-to-refresh refetches the screen's queries and retries the write queue, then a toast says whether anything changed. 'Nothing new' = every refetched key kept its data reference (TanStack structural sharing; the fetch timestamp changes on every fetch, so it is never used). Offline or paused counts as failed: no toast (D-17); the sync line carries persistent problems (D-15).
import { useCallback, useEffect, useRef, useState } from 'react';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { showToast } from '@/state/undoToast';

export type RefreshOutcome = 'updated' | 'nothingNew' | 'failed';

export async function runShellRefresh(
  qc: QueryClient,
  keys: readonly QueryKey[],
): Promise<RefreshOutcome> {
  try {
    if (!onlineManager.isOnline()) return 'failed';
    const startedAt = Date.now();
    const before = keys.map((k) => qc.getQueryData(k));
    try {
      await qc.resumePausedMutations();
    } catch {
      // failed writes stay with the sync line
    }
    await Promise.all(keys.map((k) => qc.refetchQueries({ queryKey: k, type: 'active' })));
    if (keys.some((k) => qc.getQueryState(k)?.fetchStatus === 'paused')) return 'failed';
    const failed = keys.some((k) => {
      const s = qc.getQueryState(k);
      return s !== undefined && s.status === 'error' && s.errorUpdatedAt >= startedAt;
    });
    if (failed) return 'failed';
    const changed = keys.some((k, i) => qc.getQueryData(k) !== before[i]);
    showToast({ kind: 'info', text: { key: changed ? 'refresh.updated' : 'refresh.nothingNew' } });
    return changed ? 'updated' : 'nothingNew';
  } catch {
    return 'failed';
  }
}

export function useShellRefresh(keys: readonly QueryKey[]): {
  refreshing: boolean;
  refresh(): Promise<RefreshOutcome>;
} {
  const qc = useQueryClient();
  const keysRef = useRef(keys);
  useEffect(() => {
    keysRef.current = keys;
  });
  const inFlight = useRef<Promise<RefreshOutcome> | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback((): Promise<RefreshOutcome> => {
    if (inFlight.current) return inFlight.current;
    setRefreshing(true);
    const p = runShellRefresh(qc, keysRef.current).finally(() => {
      inFlight.current = null;
      setRefreshing(false);
    });
    inFlight.current = p;
    return p;
  }, [qc]);

  return { refreshing, refresh };
}
