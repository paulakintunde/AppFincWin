// 05.2-33 (DSU-16, D-10): refund links regardless of month. Activity loads one month at a time, so a refund in June whose
// purchase is in May, or a purchase in May refunded in June, would otherwise show no tag. Two small reads fix that:
// every live linked refund in the household (user-linked rows only, so a short list), and the purchases that refunds
// in view point at when they are not already loaded. Both sit under the transactions key root (household-scoped,
// refreshed by any transaction write) and exclude soft-deleted rows (the active view). Rows on screen win over the
// fetched copy, so an optimistic link or unlink shows at once.
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { TransactionRow } from '@/db/rows';
import { fetchLinkedRefunds, fetchTransactionsByIds } from '@/db/transactions';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';
import { refundTotals } from '../mutations/refundLinkModel';

export interface RefundLinkView {
  /** Rows on screen plus the purchases fetched by id, by id. */
  rowsById: ReadonlyMap<string, TransactionRow>;
  /** purchase id -> sum of every live refund linked to it, in any month. */
  totals: ReadonlyMap<string, number>;
  /** Every live linked refund (any month), newest first. */
  refunds: readonly TransactionRow[];
}

const EMPTY_ROWS: readonly TransactionRow[] = [];

/** Fetched linked refunds overlaid by the rows on screen (the screen copy is newer). Live rows only. */
export function mergeRefunds(
  fetched: readonly TransactionRow[],
  onScreen: readonly TransactionRow[]
): TransactionRow[] {
  const byId = new Map<string, TransactionRow>();
  for (const r of fetched) byId.set(r.id, r);
  for (const r of onScreen) byId.set(r.id, r);
  return [...byId.values()].filter((r) => r.deleted_at === null);
}

/** Purchase ids that on-screen refunds name and that are not on screen themselves, sorted for a stable key. */
export function missingPurchaseIds(onScreen: readonly TransactionRow[]): string[] {
  const loaded = new Set(onScreen.map((r) => r.id));
  const missing = new Set<string>();
  for (const r of onScreen) {
    const target = r.refund_of ?? null;
    if (target !== null && r.deleted_at === null && !loaded.has(target)) missing.add(target);
  }
  return [...missing].sort();
}

export function useRefundLinks(
  householdId: string | null | undefined,
  rows: readonly TransactionRow[],
  enabled: boolean
): RefundLinkView {
  const hh = householdId ?? '';
  const on = enabled && hh !== '';
  const linked = useQuery({
    queryKey: queryKeys.refundLinks(hh),
    queryFn: () => fetchLinkedRefunds(supabase, hh),
    enabled: on,
  });
  const missing = useMemo(() => (on ? missingPurchaseIds(rows) : []), [on, rows]);
  const purchases = useQuery({
    queryKey: queryKeys.refundPurchases(hh, missing.join(',')),
    queryFn: () => fetchTransactionsByIds(supabase, hh, missing),
    enabled: on && missing.length > 0,
  });

  const fetchedRefunds = linked.data ?? EMPTY_ROWS;
  const fetchedPurchases = purchases.data ?? EMPTY_ROWS;
  const refunds = useMemo(
    () =>
      on
        ? mergeRefunds(fetchedRefunds, rows)
            .filter((r) => (r.refund_of ?? null) !== null)
            .sort((a, b) => (a.local_date < b.local_date ? 1 : a.local_date > b.local_date ? -1 : a.id < b.id ? -1 : 1))
        : EMPTY_ROWS,
    [on, fetchedRefunds, rows]
  );
  const totals = useMemo(() => refundTotals(refunds), [refunds]);
  const rowsById = useMemo(() => {
    const map = new Map<string, TransactionRow>();
    for (const r of fetchedPurchases) if (r.deleted_at === null) map.set(r.id, r);
    for (const r of rows) map.set(r.id, r);
    return map;
  }, [fetchedPurchases, rows]);

  return { rowsById, totals, refunds };
}
