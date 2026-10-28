// 05.2 D-18/D-19: first production caller of computeV3; 05.3 reuses it for home and the check.
// The inputs are composed from the reads that already exist (snapshot, settings, answers, dismissals, checks and their
// plan links), never copied (05.1 D-53). Built in memory with useMemo; the bigint-carrying Evaluation is never cached.
import { useCallback, useMemo } from 'react';
import type { DecideLinkRow } from '@/db/decideLinks';
import type { SnapshotSource } from '@/features/decide/snapshot/buildSnapshot';
import { computeV3 } from '@/features/decide/snapshot/v3/computeV3';
import { buildV3Inputs } from '@/features/decide/snapshot/v3/buildV3Inputs';
import { settingsSourceOf } from '@/features/decide/snapshot/v3/settingsSource';
import { useRecordContext } from '@/features/record/useRecordContext';
import type { Evaluation, V3Inputs } from '@/engine/decide/v3';
import { useDecideChecks, useDecideLinks, useDecideSettings, useDecideSnapshot } from './decide';
import { useDecideAnswers } from './decideAnswers';
import { useRecurringDismissals } from './recurringDismissals';

export interface DecideV3State {
  status: 'loading' | 'error' | 'ready';
  inputs: V3Inputs | null;
  evaluation: Evaluation | null;
  refetch(): void;
}

/**
 * Pitfall 9: a check's plan is live while a linked series has not ended before today or a linked debt still has a balance.
 * A check with no plan link at all cannot be shown to have ended, so its bridge stays held (the safe side: unspent is
 * never overstated).
 */
export function planLiveOf(links: readonly DecideLinkRow[], source: SnapshotSource): (checkId: string) => boolean {
  const series = new Map(source.series.map((s) => [s.id, s]));
  const debts = new Map(source.debts.map((d) => [d.id, d]));
  return (checkId) => {
    let planned = false;
    for (const l of links) {
      if (l.check_id !== checkId || l.deleted_at !== null) continue;
      if (l.entity === 'recurring_series') {
        planned = true;
        const s = series.get(l.target_id);
        if (s !== undefined && s.deleted_at === null && (s.end_date === null || s.end_date >= source.today)) return true;
      } else if (l.entity === 'debts') {
        planned = true;
        const d = debts.get(l.target_id);
        if (d !== undefined && d.deleted_at === null && d.balance > 0) return true;
      }
    }
    return !planned;
  };
}

const NO_CHECKS: readonly { id: string }[] = [];

export function useDecideV3(): DecideV3State {
  const rc = useRecordContext();
  const userId = rc.userId ?? undefined;
  const householdId = rc.householdId ?? undefined;
  const snapshot = useDecideSnapshot();
  const settings = useDecideSettings(userId);
  const answers = useDecideAnswers(userId, householdId);
  const dismissals = useRecurringDismissals(householdId);
  const checks = useDecideChecks(userId, householdId);
  const checkIds = useMemo(() => (checks.data ?? NO_CHECKS).map((c) => c.id).sort(), [checks.data]);
  const links = useDecideLinks(userId, householdId, checkIds);

  const reads = [settings, answers, dismissals, checks, links];
  // 'error' only when a required read failed with nothing cached; a cached copy (offline) is 'ready'.
  const failed = snapshot.status === 'error' || reads.some((q) => q.data === undefined && q.isError);
  const missing = reads.some((q) => q.data === undefined);

  const source = snapshot.source;
  const settingsRow = settings.data;
  const answerRows = answers.data;
  const dismissalRows = dismissals.data;
  const checkRows = checks.data;
  const linkRows = links.data;
  const computed = useMemo(() => {
    if (source === null || missing || settingsRow === undefined || answerRows === undefined || dismissalRows === undefined || checkRows === undefined || linkRows === undefined) return null;
    const v3 = settingsSourceOf({ settings: settingsRow, answers: answerRows, dismissals: dismissalRows, checks: checkRows, planLive: planLiveOf(linkRows, source) });
    return { inputs: buildV3Inputs(source, v3), evaluation: computeV3(source, v3, {}) };
  }, [source, missing, settingsRow, answerRows, dismissalRows, checkRows, linkRows]);

  const retrySnapshot = snapshot.retry;
  const refetchers = reads.map((q) => q.refetch);
  const refetch = useCallback(() => {
    retrySnapshot();
    refetchers.forEach((r) => void r());
    // the query refetch functions are stable per query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retrySnapshot]);

  const status: DecideV3State['status'] = failed ? 'error' : computed === null ? 'loading' : 'ready';
  return { status, inputs: computed?.inputs ?? null, evaluation: computed?.evaluation ?? null, refetch };
}
