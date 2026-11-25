// 08-25 (HH-09, ARC-17): rows into the two figure scopes, through the engine's one adapter (engine/household/countsForMeInput).
// Mine: the viewer's records plus their stored share of shared lines (Home's two figures and Decide). Household: shared lines
// only, at their household amounts, in the household currency (Home only). Pure, no supabase import, so it is unit-tested.
// The viewer's own plain lines come back as the same objects, and a list with nothing to change comes back as the same array,
// so a household of one keeps every figure, and every memo, it had before Phase 8 (06.1-46).
import type { TransactionRow } from '@/db/rows';
import type { SplitRow } from '@/db/transactionSplits';
import { monthTotals, type MonthTotals } from '@/engine/activity';
import { asStored, householdAmountOf, mineAmountOf, type ScopeLine } from '@/engine/household/countsForMeInput';
import type { StoredShare } from '@/engine/household/myShare';
import { isSettlement } from '@/engine/household/settlement';
import { monthPicture } from '@/engine/month';
import { minorUnits, type MinorUnits } from '@/engine/money/types';
import type { SnapshotRow, SnapshotSource } from '@/features/decide/snapshot/sourceTypes';
import { preparedV3 } from '@/features/decide/snapshot/v3/computeV3';
import { homeAmountFor } from './homeAmount';

export type FigureScope = 'mine' | 'household';

/** A shared line's stored splits by line id; the viewer's own key is matched by the engine. */
export type SplitsByLine = ReadonlyMap<string, readonly StoredShare[]>;

export function splitsByLineOf(splits: readonly SplitRow[]): SplitsByLine {
  const out = new Map<string, StoredShare[]>();
  for (const s of splits) {
    const entry: StoredShare = { memberKey: s.member_id ?? s.former_member_key, share: minorUnits(s.share) };
    const list = out.get(s.transaction_id);
    if (list) list.push(entry);
    else out.set(s.transaction_id, [entry]);
  }
  return out;
}

type ScopeFields = Pick<TransactionRow, 'id' | 'original_amount'> &
  Partial<Pick<TransactionRow, 'created_by' | 'is_shared' | 'is_settlement' | 'household_amount' | 'household_currency' | 'copy_share'>>;

export function scopeLineOf(r: ScopeFields, amountHome: number | null): ScopeLine {
  return {
    id: r.id,
    createdBy: r.created_by ?? null,
    isShared: r.is_shared === true,
    isSettlement: isSettlement({ isSettlement: r.is_settlement === true }),
    amount: minorUnits(r.original_amount),
    amountHome: amountHome === null ? null : minorUnits(amountHome),
    householdAmount: r.household_amount === null || r.household_amount === undefined ? null : minorUnits(r.household_amount),
    householdCurrency: r.household_currency ?? null,
    copyShare: r.copy_share === null || r.copy_share === undefined ? null : minorUnits(r.copy_share),
  };
}

/** True when any row is not the viewer's own plain line, so the Mine figure needs the stored splits. */
export function rowsNeedSplits(rows: readonly ScopeFields[], viewerId: string | null): boolean {
  if (viewerId === null) return false;
  return rows.some((r) => !asStored(scopeLineOf(r, null), viewerId));
}

const NO_SPLITS: readonly StoredShare[] = [];

/** Mine scope for rows that carry their home figure (Activity's month rows, Home's big figure). */
export function mineMonthRows<R extends ScopeFields & { amountHome: number | null }>(
  rows: readonly R[],
  splits: SplitsByLine,
  viewerId: string,
  homeCurrency: string
): readonly R[] {
  if (!rowsNeedSplits(rows, viewerId)) return rows;
  const out: R[] = [];
  for (const r of rows) {
    const line = scopeLineOf(r, r.amountHome);
    if (asStored(line, viewerId)) {
      out.push(r);
      continue;
    }
    const mine = mineAmountOf(line, splits.get(r.id) ?? NO_SPLITS, viewerId, homeCurrency);
    if (mine !== null) out.push({ ...r, amountHome: mine.amountHome });
  }
  return out;
}

/** Household scope for the same rows: shared lines only, their amount in the household currency. */
export function householdMonthRows<R extends ScopeFields & { amountHome: number | null }>(rows: readonly R[]): R[] {
  const out: R[] = [];
  for (const r of rows) {
    const h = householdAmountOf(scopeLineOf(r, r.amountHome));
    if (h !== null) out.push({ ...r, amountHome: h.amount });
  }
  return out;
}

type TotalsRow = Pick<TransactionRow, 'status' | 'transfer_id' | 'is_refund' | 'rate_pending'> & { amountHome: number | null; is_settlement?: boolean };

/** The month totals over (scoped) rows: the same mapping the Activity month view uses. */
export function figureTotalsOf(rows: readonly TotalsRow[], projections: readonly { amountHome: number | null }[]): MonthTotals {
  return monthTotals(
    rows.map((r) => ({
      amountHome: r.amountHome,
      status: r.status,
      isTransfer: r.transfer_id !== null,
      isRefund: r.is_refund,
      ratePending: r.rate_pending,
      isSettlement: isSettlement({ isSettlement: r.is_settlement === true }),
    })),
    projections
  );
}

/**
 * Mine scope for Decide's source rows, before the builder. A changed row carries the viewer's figure as its home stamp, so the
 * builder reads it as it reads any stamped line. A shared line no rate converts is left out (its full amount must never stand in
 * for a share). Same array back when nothing changes.
 */
export function mineSnapshotRows<R extends SnapshotRow & ScopeFields>(
  rows: readonly R[],
  splits: SplitsByLine,
  viewerId: string | null,
  source: Pick<SnapshotSource, 'homeCurrency' | 'rates' | 'customCurrencies'>
): readonly R[] {
  if (viewerId === null || !rowsNeedSplits(rows, viewerId)) return rows;
  const out: R[] = [];
  for (const r of rows) {
    const line = scopeLineOf(r, homeAmountFor(r, source.homeCurrency, source.rates, source.customCurrencies));
    if (asStored(line, viewerId)) {
      out.push(r);
      continue;
    }
    const mine = mineAmountOf(line, splits.get(r.id) ?? NO_SPLITS, viewerId, source.homeCurrency);
    if (mine === null || mine.amountHome === null) continue;
    out.push({ ...r, home_currency: source.homeCurrency, home_amount: mine.amountHome });
  }
  return out;
}

type SeriesTags = Pick<SnapshotSource['series'][number], 'counts_as' | 'income_kind'>;

/**
 * 07 D-31 (WR-04): the Household scope carries no series and no settings, so an untagged shared money-in line would count for
 * nothing in "In" (the engine counts an untagged line only through a series or an income profile). Such a line is stamped
 * "money to spend" here; a line a member tagged keeps its tag, so one marked "not money to spend" stays out. Only money in is
 * stamped: buildInputs reads counts_as for role income only, so transfers, refunds and settlements are unaffected either way.
 * NR-02: an occurrence does not carry its series' tag (buildInputs falls back to the series), and the Household source drops
 * the series, so a tag on the line's series is copied onto the line instead of the stamp. The series is read only where the
 * data layer has it (the viewer's own or a shared series); a partner's private series the viewer cannot read counts as
 * untagged, as far as the viewer can see (D-31).
 */
function householdCountsAs<R extends SnapshotRow>(
  r: R,
  amount: number,
  seriesById: ReadonlyMap<string, SeriesTags>
): Partial<Pick<SnapshotRow, 'counts_as' | 'income_kind'>> | null {
  if (amount <= 0) return null;
  if ((r.counts_as ?? null) !== null || (r.income_kind ?? null) !== null) return null;
  const s = r.recurring_series_id ? seriesById.get(r.recurring_series_id) : undefined;
  const sCounts = s?.counts_as ?? null;
  const sKind = s?.income_kind ?? null;
  if (sCounts !== null || sKind !== null) return { counts_as: sCounts, income_kind: sKind };
  return { counts_as: 'available' };
}

function householdSnapshotRows<R extends SnapshotRow & ScopeFields>(
  rows: readonly R[],
  currency: string,
  seriesById: ReadonlyMap<string, SeriesTags>
): R[] {
  const out: R[] = [];
  for (const r of rows) {
    const h = householdAmountOf(scopeLineOf(r, null));
    if (h === null || h.amount === null) continue;
    out.push({
      ...r,
      original_amount: h.amount,
      original_currency: currency,
      home_currency: currency,
      home_amount: h.amount,
      orig_per_eur: null,
      ...householdCountsAs(r, h.amount, seriesById),
    });
  }
  return out;
}

const householdSources = new WeakMap<SnapshotSource, Map<string, SnapshotSource>>();

/**
 * Household scope for the builder: the same source with shared lines only (at their household amounts), the joint accounts
 * only, and none of the viewer's personal plans, debts, goals, series or money settings. Held per source and currency, so the
 * prepared build is cached like Decide's own (preparedV3 keys on the source).
 */
export function householdSnapshotSource(source: SnapshotSource, currency: string): SnapshotSource {
  const byCurrency = householdSources.get(source) ?? new Map<string, SnapshotSource>();
  const hit = byCurrency.get(currency);
  if (hit !== undefined) return hit;
  const joint = source.accounts.filter((a) => (a as { is_shared?: boolean }).is_shared === true);
  const jointIds = new Set(joint.map((a) => a.id));
  const balances: Record<string, number> = {};
  for (const id of jointIds) if (source.balances[id] !== undefined) balances[id] = source.balances[id] as number;
  const seriesById = new Map<string, SeriesTags>(source.series.filter((s) => !s.deleted_at).map((s) => [s.id, s]));
  const out: SnapshotSource = {
    ...source,
    homeCurrency: currency,
    rows: householdSnapshotRows(source.rows as readonly (SnapshotRow & ScopeFields)[], currency, seriesById),
    upcomingRows: householdSnapshotRows(source.upcomingRows as readonly (SnapshotRow & ScopeFields)[], currency, seriesById),
    series: [],
    accounts: joint,
    balances,
    settings: null,
    debts: [],
    goals: [],
    statementPeriods: source.statementPeriods.filter((p) => jointIds.has(p.account_id)),
    changes: [],
    paymentLinks: [],
    writtenRowLinks: [],
    categoryCaps: {},
  };
  byCurrency.set(currency, out);
  householdSources.set(source, byCurrency);
  return out;
}

/** The Household scope's "left after the month's plans": 05.5's builder and month picture over the shared-lines-only source. */
export function householdLeftAfterPlans(source: SnapshotSource, currency: string): MinorUnits {
  return monthPicture(preparedV3(householdSnapshotSource(source, currency), null).prepared).leftAfterPlans;
}
