/**
 * Plain calculator. Written from the right-answer table rule statements. Shares no code with src/engine. QA-03.
 * Own integer maths on bigint minor units; percentages are parsed from strings to basis points. No floats in money.
 */
import type { RightAnswerFixture } from '../rightAnswers/schema';
import { TIGHT_SHARE_BP, FLOOR_DIVISOR } from './rules';

type Cents = bigint;
export interface PlainAnswer { code: string; variant: string | null; afterBuy: number | null }

const big = (n: number): Cents => BigInt(n);
const maxC = (a: Cents, b: Cents): Cents => (a > b ? a : b);

/** '12.5' -> 1250 basis points, digits only, no floats. */
export function basisPoints(text: string): Cents {
  const [whole = '0', frac = ''] = text.trim().split('.');
  return BigInt(whole) * 100n + BigInt((frac + '00').slice(0, 2));
}

/** Monthly payment on a plan: level payment with a monthly rate of apr/12, in scaled integers. */
export function monthlyPayment(amount: Cents, months: number, apr: string | null): Cents {
  if (months <= 0) return amount;
  const n = BigInt(months);
  if (apr === null || basisPoints(apr) === 0n) return (amount + n / 2n) / n;
  const S = 10n ** 12n;
  const r = (basisPoints(apr) * S) / (10_000n * 12n);
  let growth = S;
  for (let i = 0; i < months; i++) growth = (growth * (S + r)) / S;
  return (amount * r * growth) / (S * (growth - S));
}

/** Days in the month of a 'YYYY-MM-DD' date. */
function daysInMonthOf(date: string): bigint {
  return BigInt(new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)).getUTCDate());
}

/**
 * Everyday spending still to come: the usual pace over the days left, but never less than whatever of a usual
 * month is not yet logged. Nothing is still to come on the last day of the month.
 */
export function everydayToCome(f: RightAnswerFixture): Cents {
  const days = daysInMonthOf(f.asOf);
  const day = BigInt(Number(f.asOf.slice(8, 10)));
  if (day >= days) return 0n;
  const usual = big(f.usualMonth.everyday);
  const pace = (usual * (days - day) * 2n + days) / (days * 2n); // rounded half up
  return maxC(pace, maxC(0n, usual - big(f.thisMonth.everydaySoFar)));
}

/** The money left this month before the purchase: money in, less everything paid, due, spent and still to come. */
export function leftThisMonth(f: RightAnswerFixture): Cents {
  const t = f.thisMonth;
  return big(t.received) - big(t.billsPaid) - big(t.billsDue) - big(t.everydaySoFar) - everydayToCome(f);
}

/** Money in the checking and current accounts. */
export function sittingMoney(f: RightAnswerFixture): Cents {
  return f.accounts.filter((a) => a.kind === 'checking' || a.kind === 'current').reduce((s, a) => s + big(a.balance), 0n);
}

/** Cash left at the worst point before payday if the cost is paid today; below zero means the cash does not hold. */
export function cashMargin(f: RightAnswerFixture, cost: Cents, withDues: boolean): Cents {
  return sittingMoney(f) - (withDues ? big(f.thisMonth.billsDue) : 0n) - everydayToCome(f) - cost;
}

export function plainAnswer(f: RightAnswerFixture): PlainAnswer {
  const c = f.check;
  if (c.price === null) return { code: 'needs_input', variant: null, afterBuy: null };
  const left = leftThisMonth(f);
  const cost = big(c.price) + big(c.oneOffFees);
  if (c.pay.mode === 'plan') {
    const pay = monthlyPayment(cost - big(c.pay.deposit) + big(c.pay.fees), c.pay.months, c.pay.apr);
    const usualLeft = big(f.pay.amount) - big(f.usualMonth.bills) - big(f.usualMonth.everyday);
    return { code: usualLeft - pay < 0n ? 'monthly_short' : 'fits_month', variant: null, afterBuy: Number(left - big(c.pay.deposit)) };
  }
  const after = left - cost;
  const sitting = sittingMoney(f);
  // Cash check first: what is in the spending accounts has to carry the bills still due and the everyday spending
  // still to come until payday (the next pay lands after this month ends), as well as the cost itself.
  if (cashMargin(f, cost, true) < 0n) return { code: 'not_yet', variant: null, afterBuy: Number(after) };
  // Room next: this month's money left (never below zero). What it cannot cover comes from money already sitting
  // in the spending accounts, less the part of it this month's room already counted.
  const room = maxC(0n, left);
  const fromMonth = cost < room ? cost : room;
  const rest = cost - fromMonth;
  if (rest === 0n) return { code: 'fits_month', variant: null, afterBuy: Number(after) };
  const earlier = maxC(0n, sitting - fromMonth);
  return { code: rest <= earlier ? 'fits_unspent' : 'not_yet', variant: null, afterBuy: Number(after) };
}

/** Named so the table's thresholds have one reader; the Theme A plans use them. */
export const RULE_NAMES = { TIGHT_SHARE_BP, FLOOR_DIVISOR };
