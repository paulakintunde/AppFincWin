/**
 * "What could I do instead?" (05.1 plan 26). v3 §3.8, UP §5.6 (C11), I13, I26.
 * The choice is yours: the futures are never ranked. They come in one fixed order (FUTURE_ORDER) and carry no rank or score.
 *
 * C11: the deposit uses the rate the user typed, plus the 0% view. There are no example or market rates.
 * Payment stream: a financed purchase is compared as the same payments paid into a deposit each period. Interest given
 * up = the stream's future value - the payments made, plus the loan interest avoided by not financing.
 * Approximation: a weekly or multi-week stream is converted to its monthly equivalent before futureValueExact (monthly
 * compounding); no decision needs the exact per-period future value.
 * I13: ready-by is the month unspent money covers the price at the typical pace. The wait logic is ported from
 * decide/wait.ts, not imported (D-16).
 *
 * Share convention: the schedule is on the full lender amount; my part is applied once to its monthly equivalent and
 * interest here.
 */
import { MAX_TERM_MONTHS, SIMULATION_MONTH_CAP } from '../../../payoff/constants';
import { futureValueExact } from '../../../payoff/futureValue';
import { ceilDivide, minorFromBigInt, ZERO_PERCENT, type Percent } from '../../../payoff/types';
import { minorUnits, type MinorUnits } from '../../../money/types';
import { myPart } from '../../share';
import { addYearMonths } from '../dates';
import type { Funds, MonthModel, Purchase, Result, Schedule } from '../types';

export const FUTURE_ORDER = ['buy_now', 'keep', 'deposit', 'buy_later'] as const;
export type FutureKind = (typeof FUTURE_ORDER)[number];

export interface DepositView {
  readonly rate: Percent;
  readonly value: MinorUnits;
  readonly paidIn: MinorUnits;
  readonly interestGivenUp: MinorUnits;
}

export interface Futures {
  readonly order: readonly FutureKind[];
  readonly buyNow: {
    readonly unspentAfter: MinorUnits | null;
    readonly emergencyUntouched: boolean;
    readonly planTotal: MinorUnits | null;
  };
  readonly keep: { readonly unspentKept: MinorUnits | null };
  readonly deposit: { readonly years: number; readonly views: readonly DepositView[] };
  readonly buyLater: {
    readonly months: number | null;
    readonly readyBy: string | null;
    readonly monthlyAmount: MinorUnits | null;
  };
}

/**
 * What a payment stream (and a lump) would be worth in a deposit at `rate`. `schedule` carries the stream
 * (monthlyEquivalent) and the loan interest avoided (totalInterest); null = a one-off lump only.
 */
export function depositOfStream(input: {
  readonly schedule: Schedule | null;
  readonly lump: MinorUnits;
  readonly rate: Percent;
  readonly months: number;
}): DepositView {
  const monthly = input.schedule === null ? 0 : input.schedule.monthlyEquivalent;
  const fv = futureValueExact(minorUnits(monthly), input.rate, input.months, input.lump);
  const paid = BigInt(input.lump) + BigInt(monthly) * BigInt(input.months);
  const avoided = input.schedule === null ? 0n : BigInt(input.schedule.totalInterest);
  return {
    rate: input.rate,
    value: minorFromBigInt(fv, 'depositOfStream'),
    paidIn: minorFromBigInt(paid, 'depositOfStream'),
    interestGivenUp: minorFromBigInt(fv - paid + avoided, 'depositOfStream'),
  };
}

export function buyLater(input: {
  readonly price: MinorUnits;
  readonly unspent: MinorUnits | null;
  readonly typicalLeft: MinorUnits | null;
  readonly month: string;
}): { readonly months: number | null; readonly readyBy: string | null; readonly monthlyAmount: MinorUnits | null } {
  const none = { months: null, readyBy: null, monthlyAmount: null } as const;
  if (input.unspent === null) return none;
  const target = Math.max(0, input.price - input.unspent);
  if (target === 0) return { months: 0, readyBy: input.month, monthlyAmount: input.typicalLeft };
  if (input.typicalLeft === null || input.typicalLeft <= 0) return none;
  const months = Math.max(1, Number(ceilDivide(BigInt(target), BigInt(input.typicalLeft))));
  if (months > SIMULATION_MONTH_CAP) return { ...none, monthlyAmount: input.typicalLeft };
  return { months, readyBy: addYearMonths(input.month, months), monthlyAmount: input.typicalLeft };
}

function streamMonths(s: Schedule): number {
  const span = s.cadence.every * s.count;
  const months = s.cadence.unit === 'month' ? span : Math.round((span * 12) / 52);
  return Math.min(MAX_TERM_MONTHS, Math.max(1, months));
}

export function insteadFutures(input: {
  readonly result: Result;
  readonly month: MonthModel;
  readonly funds: Funds;
  readonly purchase: Purchase;
  readonly userRate: Percent | null;
  readonly years: number;
}): Futures {
  const { result, month, funds, purchase, userRate } = input;
  const unspent = funds.unspent === null ? null : funds.unspent.value;
  const sched = purchase.schedule;
  const mySched: Schedule | null =
    sched === null
      ? null
      : {
          ...sched,
          monthlyEquivalent: myPart(sched.monthlyEquivalent, purchase.share),
          totalInterest: myPart(sched.totalInterest, purchase.share),
        };
  const years = Math.max(0, Math.min(Math.floor(MAX_TERM_MONTHS / 12), Math.floor(input.years)));
  const months = mySched === null ? years * 12 : streamMonths(mySched);
  const rates: Percent[] = [ZERO_PERCENT];
  if (userRate !== null && userRate !== ZERO_PERCENT) rates.push(userRate);
  const views: DepositView[] = [];
  for (const rate of rates) {
    try {
      views.push(depositOfStream({ schedule: mySched, lump: purchase.dayOne, rate, months }));
    } catch (e) {
      if (!(e instanceof RangeError)) throw e; // a figure past the safe range is left out, never shown wrong
    }
  }
  return {
    order: FUTURE_ORDER,
    buyNow: {
      unspentAfter: unspent === null ? null : minorUnits(unspent - purchase.dayOne),
      emergencyUntouched: result.code !== 'emergency_use',
      planTotal: sched === null ? null : myPart(sched.totalPaid, purchase.share),
    },
    keep: { unspentKept: unspent === null ? null : minorUnits(unspent) },
    deposit: { years: months / 12, views },
    buyLater: buyLater({ price: purchase.whole, unspent, typicalLeft: month.typicalLeft, month: month.month }),
  };
}
