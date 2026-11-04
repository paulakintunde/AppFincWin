/**
 * Card and loan minimums (05.4 FIN-04 / ENG-01, FIN-10 / ENG-09, FIN-14; D-08, D-39b, D-43). Pure, integer minor units, no clock.
 *
 * - Counted once (DB-03, DB-07): a debt is linked to the series that pays it: its own seriesId when that series is a live bill or
 *   debt-payment series, else a live debt-payment series with the debt's id, else one whose monthly amount equals the minimum
 *   (each series pays one debt; debts are read in id order). A debt linked to a bill series is in the usual month's bills already,
 *   so the month does not set its minimum aside again; a linked debt of either kind is on the cash path through its series.
 * - On the cash path (FIN-04): every other minimum lands on its due day each month inside the 90 days (cut to the month's last day).
 *   This month: only the part not yet paid (minimum - paidThisMonth, never below 0, DB-10); a due day already past this month is
 *   taken as paid (the month figure sets it aside and the balance shows it). With no paidThisMonth stated, an unlinked paid
 *   debt-payment line of exactly the minimum this month pays it. With no due day, the earliest likely day is used: tomorrow, then
 *   the same day each month, and the assumption is stated (DB-02).
 * - Fact lines (D-08) are facts only, on by default; costlyDebt (D-39b) is a caution rule and the only part that can change the
 *   variant. Every value a fact carries is a key in FACT_VALUE_KEYS (copy/verdictTable.ts).
 */
import { divideHalfUp } from '../../money/rounding';
import { minorUnits, type MinorUnits } from '../../money/types';
import { minorFromBigInt, PERCENT_SCALE } from '../../payoff/types';
import { percentText } from './adapters/inputsV2';
import { DEBT_FACT_LINES, EXPENSIVE_APR_BP } from './constants';
import { addDays, addYearMonths, daysInYearMonth, dayOfMonth, yearMonthOf } from './dates';
import { liveSeriesOf } from './month/series';
import { monthlyEquivalentOf } from './plan/cadence';
import type { Fact, V3Debt, V3Inputs, V3Line, V3Series } from './types';

const FN = 'debts';

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const byId = (a: { readonly id: string }, b: { readonly id: string }): number => cmp(a.id, b.id);

/** The live series each debt is paid through (see the header). A debt with no entry is not linked. */
export function debtLinks(debts: readonly V3Debt[], series: readonly V3Series[], asOf: string): ReadonlyMap<string, V3Series> {
  const bills = liveSeriesOf(series, asOf, 'bill');
  const payments = [...liveSeriesOf(series, asOf, 'debt_payment')].sort(byId);
  const live = new Map<string, V3Series>([...bills, ...payments].map((s) => [s.id, s]));
  const claimed = new Set<string>();
  const out = new Map<string, V3Series>();
  const sorted = [...debts].sort(byId);
  const take = (d: V3Debt, s: V3Series | undefined): void => {
    if (s === undefined || claimed.has(s.id) || out.has(d.id)) return;
    claimed.add(s.id);
    out.set(d.id, s);
  };
  for (const d of sorted) if (d.seriesId != null) take(d, live.get(d.seriesId));
  for (const d of sorted) {
    if (d.seriesId != null) continue;
    take(d, payments.find((s) => s.id === d.id && !claimed.has(s.id)));
    take(d, payments.find((s) => !claimed.has(s.id) && monthlyEquivalentOf(s.amount, s.cadence) === d.minimum));
  }
  return out;
}

/** The debts whose minimum the usual month sets aside by itself: all but those paid through a bill series (DB-07: counted once). */
export function debtsInMonth(debts: readonly V3Debt[], series: readonly V3Series[], asOf: string): readonly V3Debt[] {
  const links = debtLinks(debts, series, asOf);
  return debts.filter((d) => links.get(d.id)?.role !== 'bill');
}

/** A due day the engine can use: an integer 1..31; anything else is not set. */
function dueDayOf(d: V3Debt): number | null {
  const day = d.dueDay ?? null;
  return day !== null && Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
}

const onDay = (ym: string, day: number): string => `${ym}-${String(Math.min(day, daysInYearMonth(ym))).padStart(2, '0')}`;

export interface DebtFlow {
  readonly debtId: string;
  readonly date: string;
  readonly amount: MinorUnits;
}
export interface DebtOutflows {
  /** Every minimum on its date inside the window, in date then debt order. */
  readonly flows: readonly DebtFlow[];
  /** DB-02: the debts with no due day, each with the first minimum counted tomorrow. */
  readonly assumed: readonly { readonly debtId: string; readonly amount: MinorUnits }[];
}

/**
 * The minimums on the cash path from asOf for `days` days (see the header). `lines` are this month's lines; only paid debt-payment
 * lines with no series are read, each paying one minimum of exactly its amount.
 */
export function debtOutflows(inputs: Pick<V3Inputs, 'asOf' | 'debts' | 'series'>, lines: readonly V3Line[], days: number): DebtOutflows {
  const { asOf } = inputs;
  const ym = yearMonthOf(asOf);
  const end = addDays(asOf, days);
  const links = debtLinks(inputs.debts, inputs.series, asOf);
  const paidLines = lines.filter((l) => l.status === 'paid' && l.role === 'debt_payment' && l.seriesId === null && yearMonthOf(l.date) === ym);
  const usedLines = new Set<string>();
  const flows: DebtFlow[] = [];
  const assumed: { debtId: string; amount: MinorUnits }[] = [];
  for (const d of [...inputs.debts].sort(byId)) {
    if (links.has(d.id) || d.minimum <= 0) continue;
    const given = dueDayOf(d);
    const first = given === null ? addDays(asOf, 1) : onDay(ym, given);
    const day = given ?? dayOfMonth(first);
    // This month's part: less what is paid already, or nothing when an unlinked payment line of the minimum is there.
    const paid = d.paidThisMonth ?? null;
    const line = paid === null ? paidLines.find((l) => !usedLines.has(l.id) && Math.abs(l.amount) === d.minimum) : undefined;
    if (line !== undefined) usedLines.add(line.id);
    const owed = paid === null ? (line === undefined ? d.minimum : 0) : d.minimum - paid > 0 ? d.minimum - paid : 0;
    const firstAmount = yearMonthOf(first) === ym ? owed : d.minimum;
    if (given === null) assumed.push({ debtId: d.id, amount: minorUnits(firstAmount) });
    for (let i = 0, m = yearMonthOf(first); ; i++, m = addYearMonths(yearMonthOf(first), i)) {
      const date = i === 0 ? first : onDay(m, day);
      if (date >= end) break;
      const amount = i === 0 ? firstAmount : d.minimum;
      if (date >= asOf && amount > 0) flows.push({ debtId: d.id, date, amount: minorUnits(amount) });
    }
  }
  flows.sort((a, b) => cmp(a.date, b.date) || cmp(a.debtId, b.debtId));
  return { flows, assumed };
}

/** Balance x APR / 12, rounded half up once: the monthly interest of a debt (0 with no rate). */
export function monthlyInterest(d: V3Debt): MinorUnits {
  if (d.apr === null || d.apr <= 0n || d.balance <= 0) return minorUnits(0);
  return minorFromBigInt(divideHalfUp(BigInt(d.balance) * d.apr, 100n * PERCENT_SCALE * 12n), FN);
}

/** D-07: an APR of EXPENSIVE_APR_BP basis points or more is costly. */
export function isCostly(d: V3Debt): boolean {
  return d.apr !== null && d.apr * 100n >= BigInt(EXPENSIVE_APR_BP) * PERCENT_SCALE;
}

const interestFact = (d: V3Debt): Fact => ({
  code: 'debt_interest_cost',
  values: { balance: d.balance, apr: percentText(d.apr as NonNullable<V3Debt['apr']>), monthlyInterest: monthlyInterest(d) },
});

/** The largest monthly interest first (ties by id). */
const largestFirst = (a: V3Debt, b: V3Debt): number => monthlyInterest(b) - monthlyInterest(a) || byId(a, b);

/** Debts with interest, the largest monthly interest first. */
function byInterest(debts: readonly V3Debt[]): V3Debt[] {
  return debts.filter((d) => monthlyInterest(d) > 0).sort(largestFirst);
}

/**
 * D-39b: the costly debt a fit carries when part of the price is paid from money saved in earlier months (fromEarlier > 0): the one
 * with the largest monthly interest among debts at 20% APR or more. null otherwise (DB-11: this month's spare money alone).
 */
export function costlyDebt(debts: readonly V3Debt[], fromEarlier: number): V3Debt | null {
  if (fromEarlier <= 0) return null;
  // Any balance left counts, however small its interest rounds (a debt at 20% or more "remains", D-39b).
  return debts.filter((d) => d.balance > 0 && isCostly(d)).sort(largestFirst)[0] ?? null;
}

/** D-39b, DB-04: for a card, how much putting the price toward it would cut its monthly interest. null for any other debt. */
export function cardInstead(card: V3Debt, price: MinorUnits): Fact | null {
  if (card.kind !== 'card') return null;
  const amount = Math.min(price, card.balance);
  const saved = monthlyInterest({ ...card, balance: minorUnits(amount) });
  return saved > 0 ? { code: 'card_instead', values: { price: minorUnits(amount), saved } } : null;
}

/** The costly-debt caution's own facts (D-39b). The fact-lines switch never hides them (I-DB05). */
export function costlyFacts(debt: V3Debt, price: MinorUnits): Fact[] {
  const instead = cardInstead(debt, price);
  return instead === null ? [interestFact(debt)] : [interestFact(debt), instead];
}

/**
 * D-08 (FIN-10, ENG-09, FIN-14): the debt and housing fact lines, none when they are switched off. Up to DEBT_FACT_LINES interest
 * lines (the largest monthly interest first) and "and N more"; a debt the costly-debt caution already states is not stated again.
 * housing_cost: the housing debts' minimums as a share of a usual month's pay (whole percent, half up). joint_loan_risk: once, for
 * a debt in two names.
 */
export function debtFacts(debts: readonly V3Debt[], pay: MinorUnits, factLines: boolean, stated: string | null): Fact[] {
  if (!factLines) return [];
  const out: Fact[] = [];
  const withInterest = byInterest(debts);
  for (const d of withInterest.slice(0, DEBT_FACT_LINES)) if (d.id !== stated) out.push(interestFact(d));
  if (withInterest.length > DEBT_FACT_LINES) out.push({ code: 'debt_more', values: { count: withInterest.length - DEBT_FACT_LINES } });
  const housing = debts.filter((d) => d.isHousing).reduce((t, d) => t + BigInt(d.minimum > 0 ? d.minimum : 0), 0n);
  if (housing > 0n && pay > 0) {
    out.push({ code: 'housing_cost', values: { amount: minorFromBigInt(housing, FN), pay, share: Number(divideHalfUp(housing * 100n, BigInt(pay))) } });
  }
  if (debts.some((d) => d.joint === true)) out.push({ code: 'joint_loan_risk', values: {} });
  return out;
}

/** DB-02: each minimum counted as due tomorrow because its due day is not set. */
export function dueDayFacts(assumed: DebtOutflows['assumed']): Fact[] {
  return assumed.map((a) => ({ code: 'debt_due_day_assumed', values: { debtId: a.debtId, amount: a.amount } }));
}

/**
 * D-43 (QE-01, QE-13): what is not recorded among loans (and other debts), cards and an overdraft limit on a checking or current
 * account, as the copy variant: 'all', or the missing ones in that order joined by '_' (e.g. 'loan_overdraft'). null when all are.
 * Without an account list, or with no checking or current account, there is no overdraft to ask about.
 */
export function debtsNotRecorded(inputs: Pick<V3Inputs, 'debts' | 'accounts'>): string | null {
  const loan = !inputs.debts.some((d) => d.kind === 'loan' || d.kind === 'other');
  const card = !inputs.debts.some((d) => d.kind === 'card');
  const current = (inputs.accounts ?? []).filter((a) => a.kind === 'checking' || a.kind === 'current');
  const overdraft = current.length > 0 && current.every((a) => a.overdraftLimit == null);
  const missing = [loan ? 'loan' : '', card ? 'card' : '', overdraft ? 'overdraft' : ''].filter((x) => x !== '');
  if (missing.length === 0) return null;
  return missing.length === 3 ? 'all' : missing.join('_');
}
