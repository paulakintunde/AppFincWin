/**
 * v3 cash path (05.1 S3, I2, I19, C9). Built fresh: the old cashPath.ts B2 spread (basis - series) is not reused.
 * Spread is piecewise: Erest across the rest of this month, then E per later month, both cumulative half-up so daily
 * amounts never drift. Pure: asOf is an input.
 *
 * Bills and debt payments sit on their real dates; only confirmed live pay lands (I3, I34). Debt payments are dated
 * money out that Erest does not contain (I19), so they are taken on their dates too. Saving and investing are
 * pausable and are not taken.
 */
import { divideHalfUp } from '../../../money/rounding';
import { minorUnits, type MinorUnits } from '../../../money/types';
import { minorFromBigInt } from '../../../payoff/types';
import { myPart, type ResolvedShare } from '../../share';
import { CASH_PATH_DAYS_V3 } from '../constants';
import { addDays, daysBetween, daysInYearMonth, dayOfMonth, yearMonthOf } from '../dates';
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

export function buildCashPathV3(input: {
  readonly asOf: string;
  readonly days: number;
  readonly opening: MinorUnits;
  readonly series: readonly V3Series[];
  readonly paidThisMonth: ReadonlySet<string>;
  readonly erest: MinorUnits;
  readonly e: MinorUnits;
  readonly extraOut: readonly DatedFlow[];
}): CashPathV3 {
  const { asOf, days } = input;
  if (!Number.isInteger(days) || days < 1 || days > CASH_PATH_DAYS_V3) {
    throw new RangeError(`${FN}: days must be 1..${CASH_PATH_DAYS_V3}`);
  }
  const end = addDays(asOf, days);
  const net = new Array<bigint>(days).fill(0n);
  const put = (date: string, amount: bigint): void => {
    if (date >= end) return;
    const idx = date <= asOf ? 0 : daysBetween(asOf, date);
    net[idx] = (net[idx] as bigint) + amount;
  };
  for (const s of liveSeriesOf(input.series, asOf, 'pay')) {
    for (const d of seriesOccurrences(s, asOf, end)) put(d, BigInt(s.amount));
  }
  for (const role of ['bill', 'debt_payment'] as const) {
    for (const s of liveSeriesOf(input.series, asOf, role)) {
      for (const d of seriesOccurrences(s, asOf, end)) {
        if (input.paidThisMonth.has(`${s.id}|${d}`)) continue;
        put(d, -BigInt(s.amount));
      }
    }
  }
  for (const f of input.extraOut) put(f.date, -BigInt(f.amount));
  const points: CashPoint[] = [];
  let running = BigInt(input.opening);
  for (let i = 0; i < days; i++) {
    running += net[i] as bigint;
    const balance = running - spreadThrough(i, { erest: input.erest, e: input.e, asOf });
    points.push({ date: addDays(asOf, i), balance: minorFromBigInt(balance, FN) });
  }
  return { asOf, points };
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
  | { readonly kind: 'not_covered'; readonly shortBy: MinorUnits };

export function cashCheck(withPurchase: CashPathV3, payDate: string | null): CashCheck {
  let lowest = withPurchase.points[0] as CashPoint;
  for (const p of withPurchase.points) if (p.balance < lowest.balance) lowest = p;
  if (lowest.balance >= 0) return { kind: 'ok', lowest };
  const shortBy = minorUnits(-lowest.balance);
  if (payDate !== null) {
    const after = withPurchase.points.filter((p) => p.date >= payDate);
    if (after.length > 0 && after.every((p) => p.balance >= 0)) return { kind: 'payday', until: payDate, shortBy };
  }
  return { kind: 'not_covered', shortBy };
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
