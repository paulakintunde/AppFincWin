/**
 * Plan 05.2-23: the facts the setup flow model branches on, composed from the reads that already exist (settings,
 * accounts, series, the v3 inputs months). Reads only. Returns null while any of them is still loading, so the shell
 * never branches on a half-known picture.
 */
import { useMemo } from 'react';
import { useAccounts } from '@/data/queries/accounts';
import { useDecideSettings } from '@/data/queries/decide';
import { useDecideV3 } from '@/data/queries/decideV3';
import { useRecurringSeries } from '@/data/queries/recurringSeries';
import { seriesOfKind } from '@/features/income/seriesHelpers';
import { useRecordContext } from '@/features/record/useRecordContext';
import type { SetupFacts } from './setupFlow';

/** A rough_* figure typed with fewer than this many full months of records behind it is "rough". */
const ROUGH_BELOW_MONTHS = 3;

export function useSetupFacts(): SetupFacts | null {
  const rc = useRecordContext();
  const userId = rc.userId ?? undefined;
  const householdId = rc.householdId ?? undefined;
  const settingsQuery = useDecideSettings(userId);
  const accountsQuery = useAccounts(householdId);
  const seriesQuery = useRecurringSeries(householdId);
  const v3 = useDecideV3();

  const settings = settingsQuery.data;
  const accounts = accountsQuery.data;
  const series = seriesQuery.data;
  const months = v3.inputs?.months;
  const v3Loading = v3.status === 'loading';

  return useMemo((): SetupFacts | null => {
    if (settings === undefined || accounts === undefined || series === undefined || v3Loading) return null;
    const s = settings;
    const live = accounts.filter((a) => a.deleted_at === null && a.archived_at === null);
    const money = live.filter((a) => a.kind !== 'credit' && a.kind !== 'loan');
    const fullMonthsOfRecords = (months ?? []).filter((m) => m.full).length;
    const roughTyped =
      fullMonthsOfRecords < ROUGH_BELOW_MONTHS &&
      s !== null &&
      [s.rough_income, s.rough_spending, s.rough_saving, s.rough_debt, s.rough_invest].some((v) => v !== null && v !== undefined);
    return {
      incomeTypes: s?.income_types ?? null,
      hasRegularPaySeries: seriesOfKind(series, 'salary').length > 0,
      method: s?.variable_method ?? null,
      spreadMonths: s?.spread_months ?? null,
      steadyAmount: s?.steady_amount ?? null,
      holdMonths: s?.hold_months ?? null,
      fullMonthsOfRecords,
      moneyAccountIds: money.map((a) => a.id),
      accountIdsWithUse: live.filter((a) => a.use !== null && a.use !== undefined).map((a) => a.id),
      everydayOverride: s?.everyday_override ?? null,
      unspentAnchorSet: s !== null && s.unspent_anchor !== null && s.unspent_anchor_at !== null,
      roughTyped,
      setupDoneAt: s?.setup_done_at ?? null,
    };
  }, [settings, accounts, series, months, v3Loading]);
}
