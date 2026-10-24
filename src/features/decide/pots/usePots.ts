// 05-127 (D-101, R18.2): reads for the Pots screen. One cache (savings_goals) gives pots, Wait pots and done rows; tagged
// transfer lines give saved-so-far. A pot in a currency other than home converts at the latest stored rate; with none the
// row reads "Waiting for a {{currency}} rate". Integer minor units throughout.
import { useCallback, useMemo } from 'react';
import { useGoalLines, usePots } from '@/data/queries/decide';
import { convertLatest } from '@/data/queries/fxConvert';
import { homeAmountFor } from '@/data/queries/homeAmount';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import type { TransactionRow } from '@/db/rows';
import { usePastContext, type PastContext } from '../past/usePastDecisions';
import { buildPotsModel, type PotAmounts, type PotsScreenModel } from './potsModel';

export type PotsStatus = 'loading' | 'error' | 'ready';

export interface PotsRead {
  status: PotsStatus;
  model: PotsScreenModel;
  refetch: () => void;
  userId: string | null;
  householdId: string | null;
  today: string;
}

const EMPTY: PotsScreenModel = { live: [], done: [], summary: { total: 0, count: 0 }, plainCount: 0, addDisabled: false };

/** Saved and target in the home currency for one row, or nulls where a stored rate is missing. Pure. */
export function resolvePotAmounts(row: SavingsGoalRow, lines: readonly TransactionRow[], ctx: PastContext): PotAmounts {
  const convert = (amount: number): number | null =>
    row.currency === ctx.home ? amount : (convertLatest(amount, row.currency, ctx.home, ctx.rates, ctx.customs, ctx.today)?.amount ?? null);
  const opening = convert(row.opening_saved);
  const target = row.target === null ? null : convert(row.target);
  if (opening === null) return { saved: null, target };
  let saved = opening;
  for (const line of lines) {
    if (line.goal_id !== row.id || line.status !== 'paid' || line.deleted_at !== null) continue;
    const amount = homeAmountFor(line, ctx.home, ctx.rates);
    if (amount === null) return { saved: null, target };
    saved += Math.abs(amount);
  }
  return { saved, target };
}

export function usePotsRead(): PotsRead {
  const { userId, householdId, today, ctx } = usePastContext();
  const query = usePots(userId ?? undefined, householdId ?? undefined);
  const view = query.data;
  const ids = useMemo(() => (view === undefined ? [] : [...view.live, ...view.done].map((r) => r.id)), [view]);
  const lines = useGoalLines(householdId, ids).data;

  const model = useMemo(
    () =>
      view === undefined
        ? EMPTY
        : buildPotsModel(view.live, view.done, (row) => resolvePotAmounts(row, lines ?? [], ctx), today),
    [view, lines, ctx, today]
  );
  const refetch = useCallback(() => {
    void query.refetch();
  }, [query]);

  const status: PotsStatus = view !== undefined ? 'ready' : query.isError ? 'error' : 'loading';
  return { status, model, refetch, userId, householdId, today };
}
