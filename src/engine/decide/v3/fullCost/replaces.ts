/**
 * 05.4 BO-05 (05.4-27, Variant C, VC-02): what a purchase replaces. Pure; integer minor units; no clock (every date is an input).
 *
 * - stoppedCostFlows: the money that no longer leaves the account once a cost stops, as dated amounts (positive = money that stays).
 *   A bill stop names a recorded bill series and uses that series' own amount and due dates (D-104): every due after the stop date
 *   inside the path is given back once; a due on or before the stop date is still paid (SO-05: the old $80 on 1 December, stop on
 *   20 December). A due the path never took (paid already, dropped, D-27 / D-31) is never given back. A stop whose bill is not
 *   recorded gives back nothing. An everyday stop lowers usual spending from the first month that starts after its stop date
 *   (D-103): its monthly share comes back on the last day of each such month inside the path (never earlier than the spread takes
 *   it, so never looser), and this month never changes (SO-06: November's gym fee is already paid).
 * - saleFlows: selling the old one. A sale dated before asOf, not a real date, or not above 0 is not counted (D-105). A sale that
 *   pays a recorded debt pays it first, up to what is still owed on the arrival day; only the rest reaches the account (SO-03: $5,000,
 *   $4,000 to the loan, $1,000 to the account). The debt's payments from the arrival day on stop once what is left is paid (D-73):
 *   a debt paid off has no payment after the sale; a debt paid in part keeps its full payment until the rest is gone (D-102, SO-04).
 * - usualFreed: what the usual month gets back after buying. A bill: only what the usual month was counting for it (its monthly
 *   equivalent; a yearly bill left out of the usual month, or one someone else always pays, gives back nothing). An everyday stop:
 *   its amount / every months, half up, never more than the usual everyday spending (of its category, when it names one). A debt
 *   the sale pays off: the minimum the usual month counted once (through its bill series, else set aside). Each series once.
 * - replacesEffect: all of it for one check (prepare.ts): the path flows, the sale part that lowers the day-one need (it arrives on or
 *   before the purchase date: SO-01; a purchase past the path reads the path's last day, D-137), the later sale the ready date may count (SO-02), the debts after the sale, the yearly-bill
 *   hold-backs that go, and the facts (sale_counted, debt_left_after_sale; D-106).
 */
import { divideHalfUp } from '../../../money/rounding';
import { minorUnits, type MinorUnits } from '../../../money/types';
import { asOutflow, type DatedFlow, type LabelledFlow } from '../cash/path';
import { addDays, addYearMonths, daysInYearMonth, isValidLocalDate, yearMonthOf } from '../dates';
import { debtLinks, type DebtFlow } from '../debts';
import type { DueDrops } from '../month/dueDrops';
import { liveSeriesOf, seriesOccurrences } from '../month/series';
import { monthlyEquivalentOf } from '../plan/cadence';
import { dayOneDate } from './purchaseDate';
import type { Fact, LocalDate, MonthModel, Replaces, Sale, StoppedCost, V3Debt, V3Series, YearMonth } from '../types';

const EVERY: ReadonlySet<number> = new Set([1, 3, 12]);

/** Plain string order (dates, then ids): -1, 0 or 1. */
export function order(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
const byDate = (a: DatedFlow, b: DatedFlow): number => order(a.date, b.date);

export interface ReplacesCtx {
  readonly asOf: LocalDate;
  readonly days: number;
  readonly series: readonly V3Series[];
  /** "seriesId|date" occurrences a paid line already settled (the path never took them). */
  readonly paid: ReadonlySet<string>;
  readonly drops?: DueDrops;
  readonly debts: readonly V3Debt[];
  /** The minimums not paid through a series, on their dates (debts.ts debtOutflows). */
  readonly debtFlows: readonly DebtFlow[];
  readonly month: Pick<MonthModel, 'e' | 'categoryMonthly' | 'alwaysOther'>;
}

/** A stop that can count: a real stop date, a positive safe amount and a known cadence. */
export function stopCounts(s: StoppedCost): boolean {
  return isValidLocalDate(s.stopDate) && Number.isSafeInteger(s.amount) && s.amount > 0 && EVERY.has(s.everyMonths);
}

/** A sale that can count: a positive safe amount arriving on a real date on or after asOf (D-105). */
export function saleCounts(sale: Sale | null | undefined, asOf: LocalDate): sale is Sale {
  return sale != null && Number.isSafeInteger(sale.amount) && sale.amount > 0 && isValidLocalDate(sale.arrives) && sale.arrives >= asOf;
}

function billSeries(ctx: ReplacesCtx, id: string): V3Series | undefined {
  return liveSeriesOf(ctx.series, ctx.asOf, 'bill').find((s) => s.id === id);
}

/** The dues of a series inside [from, path end) that the path takes (not settled, not dropped). */
function takenDues(ctx: ReplacesCtx, s: V3Series, from: LocalDate): LocalDate[] {
  const end = addDays(ctx.asOf, ctx.days);
  const start = from > ctx.asOf ? from : ctx.asOf;
  if (start >= end) return [];
  return seriesOccurrences(s, start, end).filter((d) => !ctx.paid.has(`${s.id}|${d}`) && (ctx.drops?.has(s.id, d) ?? null) === null);
}

function lastDay(ym: YearMonth): LocalDate {
  return `${ym}-${String(daysInYearMonth(ym)).padStart(2, '0')}`;
}

/** An everyday stop's monthly share, before the cap. */
function everydayShare(s: StoppedCost): bigint {
  return divideHalfUp(BigInt(s.amount), BigInt(s.everyMonths));
}

/** The everyday shares, capped at the usual everyday spending (per category when a stop names one). Order: by stop id. */
function cappedEveryday(stops: readonly StoppedCost[], month: ReplacesCtx['month']): { readonly stop: StoppedCost; readonly share: bigint }[] {
  const left = new Map<string, bigint>();
  let all = BigInt(month.e ?? 0);
  const out: { stop: StoppedCost; share: bigint }[] = [];
  for (const s of [...stops].sort((a, b) => order(a.id, b.id))) {
    if (s.source.kind !== 'everyday' || !stopCounts(s)) continue;
    const cat = s.source.categoryId;
    let room = all;
    if (cat !== null) {
      const catLeft = left.get(cat) ?? BigInt(month.categoryMonthly.find((c) => c.categoryId === cat)?.amount ?? 0);
      if (catLeft < room) room = catLeft;
    }
    const want = everydayShare(s);
    const share = want < room ? want : room > 0n ? room : 0n;
    all -= share;
    if (cat !== null) left.set(cat, (left.get(cat) ?? BigInt(month.categoryMonthly.find((c) => c.categoryId === cat)?.amount ?? 0)) - share);
    if (share > 0n) out.push({ stop: s, share });
  }
  return out;
}

/** The money that stays once the costs stop, dated, inside the path (positive amounts). */
export function stoppedCostFlows(stops: readonly StoppedCost[], ctx: ReplacesCtx): DatedFlow[] {
  const out: DatedFlow[] = [];
  const end = addDays(ctx.asOf, ctx.days);
  const seen = new Set<string>();
  for (const s of stops) {
    if (s.source.kind !== 'bill' || !stopCounts(s)) continue;
    const series = billSeries(ctx, s.source.seriesId);
    if (series === undefined || seen.has(series.id)) continue;
    seen.add(series.id);
    for (const d of takenDues(ctx, series, addDays(s.stopDate, 1))) out.push({ date: d, amount: series.amount });
  }
  const thisYm = yearMonthOf(ctx.asOf);
  for (const { stop, share } of cappedEveryday(stops, ctx.month)) {
    const fromYm = addYearMonths(yearMonthOf(stop.stopDate), 1);
    for (let ym = fromYm > thisYm ? fromYm : addYearMonths(thisYm, 1); lastDay(ym) < end; ym = addYearMonths(ym, 1)) {
      out.push({ date: lastDay(ym), amount: minorUnits(Number(share)) });
    }
  }
  out.sort(byDate);
  return out;
}

export interface SaleEffect {
  /** The money that stays or arrives, dated, inside the path (positive): the part of the sale that reaches the account and the debt payments it ends. */
  readonly flows: readonly DatedFlow[];
  /** The account part alone (inside the path), null when none. */
  readonly account: DatedFlow | null;
  /** What reaches the account (the sale less what it pays on the debt). */
  readonly toAccount: MinorUnits;
  readonly toDebt: MinorUnits;
  /** The debt the sale pays, and what is still owed on it after the sale (0 = paid off). */
  readonly debt: { readonly id: string; readonly left: MinorUnits } | null;
  /** "seriesId|date" of the debt's series dues the sale ends (so a bill stop never gives them back twice). */
  readonly endedDues: ReadonlySet<string>;
}

const NO_SALE: SaleEffect = Object.freeze({ flows: [], account: null, toAccount: minorUnits(0), toDebt: minorUnits(0), debt: null, endedDues: new Set<string>() });

/** The sale on the path: the account part on its date, and the debt payments it ends (SO-03, SO-04; D-73, D-102). */
export function saleFlows(sale: Sale | null | undefined, ctx: ReplacesCtx): SaleEffect {
  if (!saleCounts(sale, ctx.asOf)) return NO_SALE;
  const end = addDays(ctx.asOf, ctx.days);
  const debt = sale.paysDebtId === null ? undefined : ctx.debts.find((d) => d.id === sale.paysDebtId);
  const out: DatedFlow[] = [];
  const ended = new Set<string>();
  if (debt === undefined) {
    const account = sale.arrives < end ? { date: sale.arrives, amount: sale.amount } : null;
    return { flows: account === null ? [] : [account], account, toAccount: sale.amount, toDebt: minorUnits(0), debt: null, endedDues: ended };
  }
  const link = debtLinks(ctx.debts, ctx.series, ctx.asOf).get(debt.id);
  // The debt's payments on the path, in date order: through its series, else its own minimums.
  const dues: { readonly date: LocalDate; readonly amount: number; readonly key: string | null }[] =
    link === undefined
      ? ctx.debtFlows.filter((f) => f.debtId === debt.id).map((f) => ({ date: f.date, amount: f.amount, key: null }))
      : takenDues(ctx, link, ctx.asOf).map((d) => ({ date: d, amount: link.amount, key: `${link.id}|${d}` }));
  let owed = debt.balance > 0 ? debt.balance : 0;
  for (const p of dues) if (p.date < sale.arrives) owed -= Math.min(p.amount, Math.max(0, owed));
  const toDebt = Math.min(sale.amount, owed);
  let left = owed - toDebt;
  for (const p of dues) {
    if (p.date < sale.arrives) continue;
    const kept = Math.min(p.amount, left);
    left -= kept;
    if (p.amount - kept > 0) {
      out.push({ date: p.date, amount: minorUnits(p.amount - kept) });
      if (p.key !== null) ended.add(p.key);
    }
  }
  const toAccount = sale.amount - toDebt;
  const account = toAccount > 0 && sale.arrives < end ? { date: sale.arrives, amount: minorUnits(toAccount) } : null;
  if (account !== null) out.push(account);
  out.sort(byDate);
  return { flows: out, account, toAccount: minorUnits(toAccount), toDebt: minorUnits(toDebt), debt: { id: debt.id, left: minorUnits(owed - toDebt) }, endedDues: ended };
}

/** What the usual month gets back after buying (see the header). */
export function usualFreed(replaces: Replaces, ctx: ReplacesCtx, sale: SaleEffect): MinorUnits {
  let sum = 0n;
  const counted = new Set<string>();
  const always = new Set((ctx.month.alwaysOther ?? []).map((a) => a.seriesId));
  const billShare = (s: V3Series): bigint => {
    if (counted.has(s.id) || always.has(s.id) || ctx.drops?.alwaysOther.has(s.id) === true) return 0n;
    counted.add(s.id);
    const longer = s.cadence.unit === 'month' && s.cadence.every > 1;
    if (longer && s.typicalChoice === 'excluded') return 0n;
    return BigInt(monthlyEquivalentOf(s.amount, s.cadence));
  };
  if (sale.debt !== null && sale.debt.left === 0) {
    const d = ctx.debts.find((x) => x.id === (sale.debt as { readonly id: string }).id) as V3Debt;
    const link = debtLinks(ctx.debts, ctx.series, ctx.asOf).get(d.id);
    if (link !== undefined && link.role === 'bill') sum += billShare(link);
    // any other debt is set aside by its minimum (debts.ts debtsInMonth: every debt not paid through a bill series)
    else sum += BigInt(d.minimum > 0 ? d.minimum : 0);
  }
  for (const s of replaces.stops) {
    if (s.source.kind !== 'bill' || !stopCounts(s)) continue;
    const series = billSeries(ctx, s.source.seriesId);
    if (series !== undefined) sum += billShare(series);
  }
  for (const { share } of cappedEveryday(replaces.stops, ctx.month)) sum += share;
  return minorUnits(Number(sum));
}

export interface ReplacesEffect {
  /** Money that stays or arrives on the path, dated (positive), except the sale part netted against the day-one need. */
  readonly flows: readonly DatedFlow[];
  /** The sale's account part that arrives on or before the purchase date: it lowers what the purchase needs on day one (SO-01). */
  readonly saleNow: MinorUnits;
  /** The day the sale arrives (asOf when no sale counts). */
  readonly saleDate: LocalDate;
  /** The sale's account part that arrives after the purchase date: only the ready date counts it, from its month (SO-02). */
  readonly saleLater: { readonly amount: MinorUnits; readonly date: LocalDate } | null;
  /** What the usual month gets back after buying. */
  readonly freed: MinorUnits;
  /** The usual month line shows for a one-off: a stop that counts, or a sale that pays a debt. */
  readonly showsUsual: boolean;
  /** The debts after the sale: a debt paid off is gone, one paid in part owes the rest (D-102). */
  readonly debts: readonly V3Debt[];
  /** Yearly and every-3-month bill series whose hold-back goes: the bill stops before its due date. */
  readonly heldStops: ReadonlyMap<string, LocalDate>;
  readonly facts: readonly Fact[];
  /** 06.1 UX-38: the sale's account part kept on the path (one of flows, by identity), so the dated list names it; absent = none. */
  readonly saleOnPath?: DatedFlow | null;
}

/** Everything a check's replaces does (null when there is nothing that counts). */
export function replacesEffect(replaces: Replaces | null | undefined, ctx: ReplacesCtx, buyDate: LocalDate): ReplacesEffect | null {
  if (replaces == null) return null;
  const stops = replaces.stops.filter(stopCounts);
  const counted = saleCounts(replaces.sale, ctx.asOf);
  if (stops.length === 0 && !counted) return null;
  const sale = saleFlows(replaces.sale, ctx);
  // D-137 (owner, 2026-11-05): a purchase dated past the path is held to its last day (D-96), so a sale counts toward it only when
  // it arrives by that day; one arriving later helps only the ready date (saleLater), never the answer.
  const now = counted && (replaces.sale as Sale).arrives <= dayOneDate(buyDate, ctx.asOf, ctx.days);
  const saleNow = now ? sale.toAccount : minorUnits(0);
  const arrives = counted ? (replaces.sale as Sale).arrives : null;
  // The account part arriving on or before the purchase date is netted against day one, so it is not on the path twice.
  const saleFlowsKept = now ? sale.flows.filter((f) => f !== sale.account) : sale.flows;
  const stopFlows = stoppedCostFlows(
    stops,
    sale.endedDues.size === 0 ? ctx : { ...ctx, paid: new Set([...ctx.paid, ...sale.endedDues]) }
  );
  const debts = sale.debt === null ? ctx.debts : ctx.debts.flatMap((d) => (d.id !== (sale.debt as { id: string }).id ? [d] : (sale.debt as { left: MinorUnits }).left === 0 ? [] : [{ ...d, balance: (sale.debt as { left: MinorUnits }).left }]));
  const held = new Map<string, LocalDate>();
  for (const s of stops) if (s.source.kind === 'bill') held.set(s.source.seriesId, s.stopDate);
  const facts: Fact[] = [];
  if (counted) facts.push({ code: 'sale_counted', values: { amount: (replaces.sale as Sale).amount, date: arrives as LocalDate } });
  if (sale.debt !== null && sale.debt.left > 0) facts.push({ code: 'debt_left_after_sale', values: { amount: sale.debt.left } });
  const flows = [...saleFlowsKept, ...stopFlows].sort(byDate);
  return {
    flows,
    saleNow,
    saleDate: arrives ?? ctx.asOf,
    saleLater: counted && !now && sale.toAccount > 0 ? { amount: sale.toAccount, date: arrives as LocalDate } : null,
    freed: usualFreed({ stops, sale: replaces.sale }, ctx, sale),
    showsUsual: stops.length > 0 || sale.debt !== null,
    debts,
    heldStops: held,
    facts,
    saleOnPath: now ? null : sale.account,
  };
}

/**
 * The flows to put on the cash path as money out (negative = money that stays or arrives): what the purchase replaces, and the part of a
 * sale netted against day one that is more than the day-one cost (it arrives on its date; SO-01 nets the rest).
 */
export function replacesOutflows(rep: ReplacesEffect, netted: number): DatedFlow[] {
  return replacesFlowsLabelled(rep, netted).map(asOutflow);
}

/**
 * 06.1 UX-38: replacesOutflows with labels (signed, money in positive): the sale's account part is a sale, the rest (costs that stop,
 * debt payments the sale ends) is money that stays. replacesOutflows is this with the labels dropped.
 */
export function replacesFlowsLabelled(rep: ReplacesEffect, netted: number): LabelledFlow[] {
  const above = rep.saleNow - netted;
  const out: LabelledFlow[] = rep.flows.map((f) => ({ date: f.date, amount: f.amount, kind: f === rep.saleOnPath ? 'sale' : 'stopped_cost', seriesId: null, debtId: null }));
  if (above > 0) out.push({ date: rep.saleDate, amount: minorUnits(above), kind: 'sale', seriesId: null, debtId: null });
  return out;
}
