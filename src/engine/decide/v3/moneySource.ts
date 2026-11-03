/**
 * Where the money comes from (05.4 D-56, D-58, D-62). Pure; integer minor units.
 *
 * - spareInAccount: what the everyday accounts are expected to hold at the end of asOf's month with no purchase (D-55 "expected at
 *   month end"). Spare money (earlier months' money in the everyday account) can be no more than this (D-56).
 * - sourceSplit: the split of a purchase that dips into the safety net, with the protected amount fixed first, so the 'emergency'
 *   segment always equals the net_used fact (gen:68). Money above the net's size is extra savings, never 'emergency'.
 * - moveMoneyBy: when the everyday account alone would go below 0 within the 90 days with the purchase, and money in another account
 *   (extra savings, or an unlocked net) covers it, the amount to move and the first day it is needed (D-58).
 * - savingTransfers: the dated regular saving and investing transfers out of the everyday account. D-67: the open cash path takes
 *   them, so the main path, the month-end figure (spareInAccount) and the account-only move-by path (D-58) all do.
 */
import { minorUnits, type MinorUnits } from '../../money/types';
import { applyPurchaseFlows, type CashPathV3, type DatedFlow, type OpenCashPath } from './cash/path';
import { addDays, daysInYearMonth, dayOfMonth, yearMonthOf } from './dates';
import { liveSeriesOf, seriesOccurrences } from './month/series';
import type { FundingSegment, Funds, LocalDate, V3Series } from './types';

const FN = 'moneySource';

/** The everyday accounts' balance on the last day of asOf's month, with no purchase. Signed. */
export function spareInAccount(open: OpenCashPath, spending: MinorUnits): MinorUnits {
  const path = applyPurchaseFlows(open, spending, []);
  const last = daysInYearMonth(yearMonthOf(open.asOf)) - dayOfMonth(open.asOf);
  const point = path.points[Math.min(last, path.points.length - 1)] as CashPathV3['points'][number];
  return point.balance;
}

/**
 * D-56: the spare money judged against: the confirmed (available) figure, capped at what the everyday accounts hold at month end,
 * never below 0 from the cap (an account below 0 is the cash check's and the overdraft's to judge, D-27, D-28). null stays null.
 */
/** D-38: the confirmed unspent figure judged against (available, else the value); null with no confirmed figure. */
export function confirmedUnspent(funds: Pick<Funds, 'unspent'>): MinorUnits | null {
  return funds.unspent === null ? null : (funds.unspent.available ?? funds.unspent.value);
}

export function cappedSpare(confirmed: MinorUnits | null, inAccount: MinorUnits): MinorUnits | null {
  if (confirmed === null) return null;
  return minorUnits(Math.min(confirmed, inAccount > 0 ? inAccount : 0));
}

export interface SplitArgs {
  /** The price paid on day one (my share). */
  readonly dayOne: MinorUnits;
  /** From the purchase's own envelope. */
  readonly envelope: MinorUnits;
  /** The most this month's money gives (the ladder's month part). */
  readonly month: MinorUnits;
  /** The most spare money from earlier months gives (the ladder's earlier part). */
  readonly earlier: MinorUnits;
  /** The protected net money the purchase uses (what net_used names). */
  readonly protectedUsed: MinorUnits;
  /** Money saved above the net's size. */
  readonly aboveSize: MinorUnits;
}

/**
 * Segments in the order month, envelope, unspent_earlier, extra_savings, emergency; zero segments are dropped. The protected amount
 * and the envelope are fixed first; extra savings take what is left up to aboveSize; then this month's money up to its part; spare
 * money takes the remainder. Throws when the parts cannot sum to dayOne.
 */
export function sourceSplit(a: SplitArgs): FundingSegment[] {
  const rest = a.dayOne - a.envelope - a.protectedUsed;
  if (rest < 0) throw new RangeError(`${FN}: the envelope and the protected part are more than the price`);
  const extra = Math.min(a.aboveSize > 0 ? a.aboveSize : 0, rest);
  const month = Math.min(a.month > 0 ? a.month : 0, rest - extra);
  const earlier = rest - extra - month;
  if (earlier > (a.earlier > 0 ? a.earlier : 0)) throw new RangeError(`${FN}: the parts cannot sum to the price`);
  const parts: FundingSegment[] = [
    { source: 'month', amount: minorUnits(month) },
    { source: 'envelope', amount: a.envelope },
    { source: 'unspent_earlier', amount: minorUnits(earlier) },
    { source: 'extra_savings', amount: minorUnits(extra) },
    { source: 'emergency', amount: a.protectedUsed },
  ];
  return parts.filter((s) => s.amount > 0);
}

/** How much must move into the everyday account, and by when; null when it never goes below 0 or nothing else can cover it. */
export function moveMoneyBy(withPurchaseAccountOnly: CashPathV3, cap: MinorUnits): { readonly amount: MinorUnits; readonly date: LocalDate } | null {
  if (cap <= 0) return null;
  let lowest = 0;
  let first: LocalDate | null = null;
  for (const p of withPurchaseAccountOnly.points) {
    if (p.balance >= 0) continue;
    if (first === null) first = p.date;
    if (p.balance < lowest) lowest = p.balance;
  }
  if (first === null) return null;
  return { amount: minorUnits(Math.min(-lowest, cap)), date: first };
}

/**
 * D-58, D-67: money moved to savings leaves the everyday account on its date, on every path (D-67: "taken out of it everywhere:
 * the month-end figure, spare money (the D-56 cap), and the 90-day cash path"). Every occurrence from asOf for `days` days of a confirmed live 'saving' or
 * 'investing' series that is not flexible, less the occurrences already logged ("seriesId|date" in paidThisMonth).
 */
export function savingTransfers(series: readonly V3Series[], paidThisMonth: ReadonlySet<string>, asOf: LocalDate, days: number): DatedFlow[] {
  const out: DatedFlow[] = [];
  const end = addDays(asOf, days);
  for (const role of ['saving', 'investing'] as const) {
    for (const s of liveSeriesOf(series, asOf, role)) {
      if (s.savingMode === 'flexible') continue;
      for (const d of seriesOccurrences(s, asOf, end, asOf)) if (!paidThisMonth.has(`${s.id}|${d}`)) out.push({ date: d, amount: s.amount });
    }
  }
  return out;
}
