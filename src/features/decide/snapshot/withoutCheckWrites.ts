// 05-52 (iteration-3 checker, D-35): a bought check is recalculated against the position before it was bought — the source
// with the check's own written rows, series and debt removed — so the purchase never counts twice.
// PURE: no React, no I/O, no @/db import except types.
import type { SnapshotSource } from './buildSnapshot';

export interface CheckWriteLink {
  check_id: string;
  entity: 'transactions' | 'recurring_series' | 'debts';
  target_id: string;
  source: 'written' | 'attached';
  deleted_at: string | null;
  role?: 'day_one' | 'payment' | 'running_cost' | null;
}

/**
 * inputs.replaces[].seriesId (non-null) and the date Go ahead ended them: inputs.needBy ?? local date of decided_at.
 * WR-C02: with no need-by date, Go ahead ended them on the day it was tapped, which an offline replay can leave before the
 * server's decided_at; `endedFrom` (the day the check was created) opens the window, so an end date from endedFrom to
 * endedOn counts as this check's.
 */
export interface ReplacedEnd {
  seriesIds: readonly string[];
  endedOn: string;
  endedFrom?: string;
}

type Row = SnapshotSource['rows'][number];

function endedByCheck(endDate: string | null, replaced: ReplacedEnd): boolean {
  return endDate !== null && endDate <= replaced.endedOn && endDate >= (replaced.endedFrom ?? replaced.endedOn);
}

/**
 * The source without one check's Go-ahead writes. Live 'written' links of this check count. WR-B05: so do live
 * attached day-one and payment lines dated on or after `attachedFrom` (the local decided date): those are the purchase
 * itself, for example the bank's paid row attached in place of the pending one Go ahead wrote. Other attached lines
 * and other checks' writes stay. A paid row dropped from the source is added back to its account's balance (same
 * currency only: Go ahead writes in the account's currency). A replaced series that Go ahead ended on `endedOn` is
 * open again. Every other field is passed through by reference; nothing is mutated.
 */
export function withoutCheckWrites(
  source: SnapshotSource,
  checkId: string,
  links: readonly CheckWriteLink[],
  replaced: ReplacedEnd | null,
  attachedFrom: string | null = null
): SnapshotSource {
  const live = links.filter((l) => l.check_id === checkId && l.deleted_at === null);
  const written = live.filter((l) => l.source === 'written');
  const rowIds = new Set(written.filter((l) => l.entity === 'transactions').map((l) => l.target_id));
  const seriesIds = new Set(written.filter((l) => l.entity === 'recurring_series').map((l) => l.target_id));
  const debtIds = new Set(written.filter((l) => l.entity === 'debts').map((l) => l.target_id));
  for (const d of source.debts) if (d.check_id === checkId) debtIds.add(d.id);
  const purchaseIds = new Set(
    attachedFrom === null
      ? []
      : live
          .filter((l) => l.source === 'attached' && l.entity === 'transactions' && (l.role === 'day_one' || l.role === 'payment'))
          .map((l) => l.target_id)
  );
  const from = attachedFrom ?? '';

  const isOwn = (r: Row): boolean =>
    rowIds.has(r.id) ||
    (purchaseIds.has(r.id) && r.local_date >= from) ||
    (r.recurring_series_id !== null && seriesIds.has(r.recurring_series_id));
  const currencyOf = new Map(source.accounts.map((a) => [a.id, a.currency]));
  const balances: Record<string, number> = { ...source.balances };
  const dropped = [...source.rows, ...source.upcomingRows].filter(isOwn);
  for (const r of dropped) {
    if (r.status === 'paid' && currencyOf.get(r.account_id) === r.original_currency) {
      balances[r.account_id] = (balances[r.account_id] ?? 0) - r.original_amount;
    }
  }

  const endedAgain = new Set(replaced === null ? [] : replaced.seriesIds);
  return {
    ...source,
    rows: source.rows.filter((r) => !isOwn(r)),
    upcomingRows: source.upcomingRows.filter((r) => !isOwn(r)),
    balances: dropped.some((r) => r.status === 'paid') ? balances : source.balances,
    series: source.series
      .filter((s) => !seriesIds.has(s.id))
      .map((s) => (replaced !== null && endedAgain.has(s.id) && endedByCheck(s.end_date, replaced) ? { ...s, end_date: null } : s)),
    debts: source.debts.filter((d) => !debtIds.has(d.id)),
    paymentLinks: source.paymentLinks.filter((l) => l.check_id !== checkId),
    writtenRowLinks: source.writtenRowLinks.filter((l) => l.check_id !== checkId),
  };
}
