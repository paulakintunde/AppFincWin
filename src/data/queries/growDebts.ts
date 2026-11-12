// 06-36 (D-32, CRUD #4): the payments of one debt for its detail screen. A line belongs to the debt when it is a line of the
// debt's payment series (series_id), of its extra series (extra_series_id), or is tagged to it (debt_id: a one-off or a
// sale's final payment). One read through the RLS-scoped active view; the split into "next expected" and "last paid" is pure
// (debtPaymentsOf) so it can be tested alone. Keyed under the household's transactions so any transaction write refreshes it.
import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toDbError } from '@/db/errors';
import type { DebtRow } from '@/db/debts';
import type { DbClient, TransactionRow } from '@/db/rows';
import { ACTIVE_VIEW, TRANSACTION_COLUMNS } from '@/db/transactions';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';

/** Paid lines shown on the detail; "See all in Activity" covers the rest. */
export const DEBT_PAID_SHOWN = 6;
/** A safety cap on one read: two monthly series over the materialised horizon plus years of paid lines fit well inside it. */
export const DEBT_PAYMENTS_READ_MAX = 240;

const UUID_RE = /^[0-9a-f-]{36}$/i;

type DebtLinks = Pick<DebtRow, 'id' | 'household_id' | 'series_id' | 'extra_series_id'>;

export interface DebtPayments {
  /** The earliest pending line dated today or later; null when none. */
  next: TransactionRow | null;
  /** Paid lines, newest first, at most DEBT_PAID_SHOWN. */
  paid: TransactionRow[];
}

/** The PostgREST `or` filter over the debt's three links. Every id is checked as a uuid before it is put in the string. */
export function debtLinkFilter(debt: DebtLinks): string {
  const ids = [debt.id, debt.series_id, debt.extra_series_id];
  for (const id of ids) {
    if (typeof id === 'string' && !UUID_RE.test(id)) throw new RangeError('debtLinkFilter: invalid id');
  }
  const series = [debt.series_id, debt.extra_series_id].filter((x): x is string => typeof x === 'string');
  const clauses = [`debt_id.eq.${debt.id}`];
  if (series.length > 0) clauses.push(`recurring_series_id.in.(${series.join(',')})`);
  return clauses.join(',');
}

export async function fetchDebtPayments(client: DbClient, debt: DebtLinks): Promise<TransactionRow[]> {
  if (!UUID_RE.test(debt.household_id)) throw new RangeError('fetchDebtPayments: invalid household id');
  const { data, error, status } = await client
    .from(ACTIVE_VIEW)
    .select(TRANSACTION_COLUMNS)
    .eq('household_id', debt.household_id)
    .in('status', ['paid', 'pending'])
    .or(debtLinkFilter(debt))
    .order('local_date', { ascending: false })
    .limit(DEBT_PAYMENTS_READ_MAX);
  if (error) throw toDbError(error, status);
  return (data as unknown as TransactionRow[] | null) ?? [];
}

/** Pure: the next expected line (earliest pending on or after today) and the last paid lines, newest first. */
export function debtPaymentsOf(rows: readonly TransactionRow[], today: string): DebtPayments {
  let next: TransactionRow | null = null;
  const paid: TransactionRow[] = [];
  for (const r of rows) {
    if (r.deleted_at !== null) continue;
    if (r.status === 'pending') {
      if (r.local_date >= today && (next === null || r.local_date < next.local_date)) next = r;
    } else if (r.status === 'paid') {
      paid.push(r);
    }
  }
  paid.sort((a, b) => (a.local_date < b.local_date ? 1 : a.local_date > b.local_date ? -1 : b.created_at.localeCompare(a.created_at)));
  return { next, paid: paid.slice(0, DEBT_PAID_SHOWN) };
}

/** D-32: the debt's next expected payment and its last paid lines. Makes no request without a debt. */
export function useDebtPayments(debt: DebtLinks | undefined, today: string) {
  const select = useCallback((rows: TransactionRow[]) => debtPaymentsOf(rows, today), [today]);
  return useQuery({
    queryKey: queryKeys.debtPayments(debt?.household_id ?? '', debt?.id ?? '', debt?.series_id ?? '', debt?.extra_series_id ?? ''),
    queryFn: () => fetchDebtPayments(supabase, debt as DebtLinks),
    enabled: debt !== undefined,
    select,
  });
}
