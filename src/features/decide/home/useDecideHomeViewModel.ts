// 05-21: gathers the Decide root's inputs from the 05-12 hooks. The reconcile of saved reminders lives here
// (D-10, D-35): both lists leave out any decided check that a live check names in `reopened_from`, so a
// reminder cancelled on reopen is never scheduled again (T-05-21-04).
import { useEffect, useMemo } from 'react';
import { useDecideChecks, useDecideSettings, useDecideSnapshot, useOpenChecks } from '@/data/queries/decide';
import type { DecideCheckRow } from '@/db/decideChecks';
import type { DecideSettingsRow } from '@/db/decideSettings';
import { currencyCode } from '@/engine/money';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { moneyA11yFn, moneyFn, type Money } from '../check/steps/stepUi';
import { reconcileWaitReminders } from '../notifications/waitReminder';
import type { SnapshotResult } from '../snapshot/types';

export interface DecideHomeViewModel {
  status: 'loading' | 'error' | 'ready';
  source: SnapshotResult | null;
  retry: () => void;
  openChecks: DecideCheckRow[];
  decidedCount: number;
  waiting: { id: string; readyBy: string | null }[];
  settings: DecideSettingsRow | null;
  today: string;
  currency: string;
  whole: Money;
  /** The same whole amounts as a screen reader speaks them (R18.1 Month details rows). */
  wholeA11y: Money;
  exact: Money;
}

const NO_OPEN: DecideCheckRow[] = [];

export function useDecideHomeViewModel(): DecideHomeViewModel {
  const rc = useRecordContext();
  const snapshot = useDecideSnapshot();
  const checks = useDecideChecks(rc.userId ?? undefined, rc.householdId ?? undefined).data;
  // D-88: the open list is selected with stable equality, so a draft save in one check leaves the other rows' identity.
  const openRows = useOpenChecks(rc.userId ?? undefined, rc.householdId ?? undefined).data;
  const settings = useDecideSettings(rc.userId ?? undefined).data ?? null;
  const wholeFmt = useMoneyFormatter(false);
  const exactFmt = useMoneyFormatter(true);

  const currency = snapshot.result?.currency ?? rc.homeCurrency;
  const lists = useMemo(() => {
    const live = (checks ?? []).filter((c) => c.deleted_at == null);
    const reopened = new Set(live.filter((c) => c.reopened_from != null).map((c) => c.reopened_from));
    const decided = live.filter((c) => c.status !== 'open');
    const waiting = decided
      .filter((c) => c.status === 'waiting' && !reopened.has(c.id))
      .map((c) => ({ id: c.id, readyBy: c.ready_by }));
    const coolingOff = decided
      .filter((c) => !reopened.has(c.id))
      .map((c) => ({ id: c.id, coolingOffAt: c.cooling_off_at }));
    return { decidedCount: decided.length, waiting, coolingOff };
  }, [checks]);

  // D-10 / D-35: reconcile once the checks and the snapshot have loaded, and again only when the lists change.
  const ready = snapshot.status === 'ready' && checks !== undefined;
  const signature = JSON.stringify([lists.waiting, lists.coolingOff, rc.today]);
  useEffect(() => {
    if (!ready) return;
    reconcileWaitReminders(lists.waiting, rc.today, lists.coolingOff).catch(() => {});
    // The lists are rebuilt from `checks`; the signature says whether their content changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, signature]);

  const whole = useMemo(() => moneyFn(wholeFmt, currencyCode(currency)), [wholeFmt, currency]);
  const wholeA11y = useMemo(() => moneyA11yFn(wholeFmt, currencyCode(currency)), [wholeFmt, currency]);
  const exact = useMemo(() => moneyFn(exactFmt, currencyCode(currency)), [exactFmt, currency]);

  return {
    status: snapshot.status,
    source: snapshot.result,
    retry: snapshot.retry,
    openChecks: openRows ?? NO_OPEN,
    decidedCount: lists.decidedCount,
    waiting: lists.waiting,
    settings,
    today: rc.today,
    currency,
    whole,
    wholeA11y,
    exact,
  };
}
