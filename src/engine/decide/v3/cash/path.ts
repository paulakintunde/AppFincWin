/**
 * v3 cash path (05.1 S3, I2, I19, C9). Built fresh: the old cashPath.ts B2 spread (basis - series) is not reused.
 * Spread is piecewise: Erest across the rest of this month, then E per later month, both cumulative half-up so daily
 * amounts never drift. Pure: asOf is an input.
 *
 * Bills and debt payments sit on their real dates; only confirmed live pay lands (I3, I34). Debt payments are dated
 * money out that Erest does not contain (I19), so they are taken on their dates too. Saving and investing are
 * pausable and are not taken. A due that dueDrops says no longer counts (05.3-64; D-27, D-31, skips) is not taken, in
 * any month of the path; one already settled by a paid line is skipped first.
 */
import { divideHalfUp } from '../../../money/rounding';
import { minorUnits, type MinorUnits } from '../../../money/types';
import { minorFromBigInt } from '../../../payoff/types';
import { myPart, type ResolvedShare } from '../../share';
import { CASH_PATH_DAYS_V3 } from '../constants';
import { addDays, daysBetween, daysInYearMonth, dayOfMonth, yearMonthOf } from '../dates';
import type { DueDrops } from '../month/dueDrops';
import { liveSeriesOf, seriesOccurrences } from '../month/series';
import { paymentsInRange } from '../plan/schedule';
import type { Schedule, V3Series } from '../types';

export interface CashPoint {
  readonly date: string;
  readonly balance: MinorUnits;
}
export interface CashPathV3 {
  readonly asOf: string;
  readonly points: readonly CashPoint[];
  /** Total pay withheld by the D-35 expected-income caps; absent when nothing was capped (D-46). */
  readonly capped?: MinorUnits;
}
export interface DatedFlow {
  readonly date: string;
  readonly amount: MinorUnits;
}

const FN = 'cash/path';

function monthIndex(ym: string): number {
  return Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;
}

/** Cumulative spread through day index `day` (0 = asOf). Erest over this month's remaining days, then E per later month. */
export function spreadThrough(
  day: number,
  input: { readonly erest: MinorUnits; readonly e: MinorUnits; readonly asOf: string }
): bigint {
  if (!Number.isInteger(day) || day < 0) throw new RangeError(`${FN}: day must be a non-negative integer`);
  const ym = yearMonthOf(input.asOf);
  const n = daysInYearMonth(ym);
  const r = n - dayOfMonth(input.asOf) + 1; // days left in this month including asOf
  const erest = BigInt(input.erest);
  if (day < r) return divideHalfUp(erest * BigInt(day + 1), BigInt(r));
  const date = addDays(input.asOf, day);
  const dym = yearMonthOf(date);
  const full = monthIndex(dym) - monthIndex(ym) - 1; // whole months strictly between
  const e = BigInt(input.e);
  const partial = divideHalfUp(e * BigInt(dayOfMonth(date)), BigInt(daysInYearMonth(dym)));
  return erest + e * BigInt(full) + partial;
}

/** The price-independent part of the path: net flows per day, the cumulative spread per day, and the pay withheld by caps. */
export interface OpenCashPath {
  readonly asOf: string;
  readonly days: number;
  readonly end: string;
  readonly net: readonly bigint[];
  readonly spread: readonly bigint[];
  readonly capped: bigint;
}

export interface OpenCashPathInput {
  readonly asOf: string;
  readonly days: number;
  readonly series: readonly V3Series[];
  readonly paidThisMonth: ReadonlySet<string>;
  readonly erest: MinorUnits;
  readonly e: MinorUnits;
  /** D-35: per month (YYYY-MM), the most pay that may land. null = steady, every pay lands at its amount. */
  readonly payCaps?: ReadonlyMap<string, MinorUnits> | null;
  /** 05.3-64 (D-27, D-31): bill and debt dues that no longer count (paid by someone else, always paid by someone else, skipped). Absent = none. */
  readonly drops?: DueDrops;
}

function putFlow(net: bigint[], asOf: string, end: string, date: string, amount: bigint): void {
  if (date >= end) return;
  const idx = date <= asOf ? 0 : daysBetween(asOf, date);
  net[idx] = (net[idx] as bigint) + amount;
}

/** Everything about the path that does not depend on the opening balance or the purchase (05.4-13: runs once per prepare). */
export function openCashPath(input: OpenCashPathInput): OpenCashPath {
  const { asOf, days } = input;
  if (!Number.isInteger(days) || days < 1 || days > CASH_PATH_DAYS_V3) {
    throw new RangeError(`${FN}: days must be 1..${CASH_PATH_DAYS_V3}`);
  }
  const end = addDays(asOf, days);
  const net = new Array<bigint>(days).fill(0n);
  const put = (date: string, amount: bigint): void => putFlow(net, asOf, end, date, amount);
  const pays: { readonly id: string; readonly date: string; readonly amount: bigint }[] = [];
  for (const s of liveSeriesOf(input.series, asOf, 'pay')) {
    for (const d of seriesOccurrences(s, asOf, end)) {
      if (input.paidThisMonth.has(`${s.id}|${d}`)) continue; // H-01: a pay already logged is in the opening balance
      pays.push({ id: s.id, date: d, amount: BigInt(s.amount) });
    }
  }
  // D-35: a variable or seasonal earner's pay in a month never exceeds that month's expected income, so a high-season pay
  // figure cannot cushion a lean month. A profile with no pay series lands no income at all (cautious, unchanged; review note).
  let capped = 0n;
  if (input.payCaps == null) {
    for (const p of pays) put(p.date, p.amount);
  } else {
    const remaining = new Map<string, bigint>();
    for (const [ym, cap] of input.payCaps) remaining.set(ym, BigInt(cap));
    pays.sort((a, b) => (`${a.date}|${a.id}` < `${b.date}|${b.id}` ? -1 : 1)); // date, then series id (unique pairs)
    for (const p of pays) {
      const ym = yearMonthOf(p.date);
      const left = remaining.get(ym) ?? 0n;
      const landed = p.amount < left ? p.amount : left;
      remaining.set(ym, left - landed);
      capped += p.amount - landed;
      put(p.date, landed);
    }
  }
  for (const role of ['bill', 'debt_payment'] as const) {
    for (const s of liveSeriesOf(input.series, asOf, role)) {
      for (const d of seriesOccurrences(s, asOf, end)) {
        if (input.paidThisMonth.has(`${s.id}|${d}`)) continue; // a recorded payment wins: settled before any drop
        if ((input.drops?.has(s.id, d) ?? null) !== null) continue; // D-27, D-31, skips: one rule (month/dueDrops.ts)
        put(d, -BigInt(s.amount));
      }
    }
  }
  const spread: bigint[] = [];
  for (let i = 0; i < days; i++) spread.push(spreadThrough(i, { erest: input.erest, e: input.e, asOf }));
  return { asOf, days, end, net, spread, capped };
}

/** Adds the opening balance and the purchase's dated flows to an open path. The open path is not changed. */
export function applyPurchaseFlows(open: OpenCashPath, opening: MinorUnits, extraOut: readonly DatedFlow[]): CashPathV3 {
  const { asOf, days, end } = open;
  const net = open.net.slice();
  for (const f of extraOut) putFlow(net, asOf, end, f.date, -BigInt(f.amount));
  const points: CashPoint[] = [];
  let running = BigInt(opening);
  for (let i = 0; i < days; i++) {
    running += net[i] as bigint;
    const balance = running - (open.spread[i] as bigint);
    points.push({ date: addDays(asOf, i), balance: minorFromBigInt(balance, FN) });
  }
  return open.capped > 0n ? { asOf, points, capped: minorFromBigInt(open.capped, FN) } : { asOf, points };
}

export function buildCashPathV3(
  input: OpenCashPathInput & { readonly opening: MinorUnits; readonly extraOut: readonly DatedFlow[] }
): CashPathV3 {
  return applyPurchaseFlows(openCashPath(input), input.opening, input.extraOut);
}

/** First confirmed live pay occurrence on or after asOf (a missed pay before asOf never counts: I3). */
export function nextPayDate(series: readonly V3Series[], asOf: string): string | null {
  let best: string | null = null;
  const far = addDays(asOf, 3700);
  for (const s of liveSeriesOf(series, asOf, 'pay')) {
    const first = seriesOccurrences(s, asOf, far)[0];
    if (first !== undefined && (best === null || first < best)) best = first;
  }
  return best;
}

export type CashCheck =
  | { readonly kind: 'ok'; readonly lowest: CashPoint }
  | { readonly kind: 'payday'; readonly until: string; readonly shortBy: MinorUnits }
  | { readonly kind: 'not_covered'; readonly shortBy: MinorUnits; readonly payDate?: string | null };

export function cashCheck(withPurchase: CashPathV3, payDate: string | null): CashCheck {
  let lowest = withPurchase.points[0] as CashPoint;
  for (const p of withPurchase.points) if (p.balance < lowest.balance) lowest = p;
  if (lowest.balance >= 0) return { kind: 'ok', lowest };
  const shortBy = minorUnits(-lowest.balance);
  if (payDate !== null) {
    const after = withPurchase.points.filter((p) => p.date >= payDate);
    if (after.length > 0 && after.every((p) => p.balance >= 0)) return { kind: 'payday', until: payDate, shortBy };
  }
  return { kind: 'not_covered', shortBy, payDate };
}

/** Dated flows of the purchase: dayOne (already my share) on asOf; each schedule payment as myPart, applied once. */
export function purchaseFlows(
  purchase: { readonly dayOne: MinorUnits; readonly schedule: Schedule | null; readonly share: ResolvedShare },
  asOf: string,
  days: number
): DatedFlow[] {
  const out: DatedFlow[] = [];
  if (purchase.dayOne !== 0) out.push({ date: asOf, amount: purchase.dayOne });
  if (purchase.schedule !== null) {
    for (const p of paymentsInRange(purchase.schedule, asOf, addDays(asOf, days))) {
      out.push({ date: p.date, amount: myPart(p.amount, purchase.share) });
    }
  }
  return out;
}
