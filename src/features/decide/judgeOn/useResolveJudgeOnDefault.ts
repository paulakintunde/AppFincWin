// D-107 (walkthrough round 2): the one-time default switch. A user who had no stored Judge-on choice (an update from before
// D-107) is moved to This month. That is not a data change, so checks last seen on the settings basis (basis_override, or the
// engine default) must not read "changed since you looked". While the switch is pending the snapshot is built on the settings
// basis; this hook re-baselines the open checks to their This month state with the same rebaselineSeen / markSeen path as a
// user's own switch, patches the checks cache, and only then resolves the default (same notify batch, so no render shows
// "N changed"). The result is remembered per user on this device, so it runs once.
import { useEffect } from 'react';
import { notifyManager, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/data/keys';
import { useMarkCheckSeen } from '@/data/mutations/decideChecks';
import { useDecideSnapshot, useOpenChecks } from '@/data/queries/decide';
import type { DecideCheckRow } from '@/db/decideChecks';
import { useRecordContext } from '@/features/record/useRecordContext';
import { rebaselineSeen, withJudgeOn } from '../home/homeRowsModel';
import { useJudgeOn } from './judgeOnStore';

export function useResolveJudgeOnDefault(userId: string | null): void {
  const qc = useQueryClient();
  const rc = useRecordContext();
  const householdId = rc.householdId;
  const { pendingDefault, applyingDefault, beginDefault, resolveDefault } = useJudgeOn(userId);
  const snapshot = useDecideSnapshot();
  const openChecks = useOpenChecks(userId ?? undefined, householdId ?? undefined);
  const { markSeen } = useMarkCheckSeen();

  const before = snapshot.result;
  const checks = openChecks.data;
  const snapshotFailed = snapshot.status === 'error';
  const checksFailed = openChecks.isError;
  const today = rc.today;

  useEffect(() => {
    if (!pendingDefault || applyingDefault || userId === null) return;
    // Wait for both reads; a read that failed has nothing to re-baseline, so the default still resolves.
    const snapshotReady = before !== null || snapshotFailed;
    const checksReady = checks !== undefined || checksFailed || householdId === null;
    if (!snapshotReady || !checksReady) return;

    const after = before === null ? null : withJudgeOn(before, 'month');
    const moves = checks === undefined ? [] : rebaselineSeen(before, after, checks, today);
    const byId = new Map(moves.map((m) => [m.id, m.state] as const));
    for (const row of checks ?? []) {
      const state = byId.get(row.id);
      if (state !== undefined) markSeen(row, state, row.last_seen_basis ?? 'logged_months');
    }
    // Hold the snapshot back first (a synchronous store update, so it renders before the cache patch below arrives).
    if (byId.size > 0) beginDefault();
    notifyManager.batch(() => {
      if (householdId !== null && byId.size > 0) {
        qc.setQueryData<DecideCheckRow[]>(queryKeys.decideChecks(userId, householdId), (rows) =>
          rows?.map((r) => {
            const state = byId.get(r.id);
            return state === undefined ? r : { ...r, last_seen_state: state, last_seen_basis: r.last_seen_basis ?? 'logged_months' };
          })
        );
      }
      // Scheduled after the cache notifications above, so React sees both changes in one render.
      notifyManager.schedule(() => resolveDefault());
    });
  }, [pendingDefault, applyingDefault, beginDefault, userId, before, checks, snapshotFailed, checksFailed, today, householdId, markSeen, qc, resolveDefault]);
}
