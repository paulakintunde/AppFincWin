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

// Restated from the right-answer table (QE-07) and the needs-input rule (UP §5.4 rule 3); not imported from the engine (QA-03).
/** A purchase over 1,000.00 (band 5 and up) asks for more records first when the records look behind. */
const ASK_FOR_RECORDS_ABOVE: Cents = 100_000n;
/** The newest everyday record must be at most 10 days old to count as current. */
const RECORD_AGE_DAYS = 10;
/** QE-07: only in the first 7 days of a month ... */
const FRESH_FIRST_DAYS = 7;
/** ... and only when the records synced at most 3 days before today. */
const FRESH_SYNC_DAYS = 3;

/** Whole days from a to b ('YYYY-MM-DD'). */
function daysFrom(a: string, b: string): number {
  const at = (d: string): number => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  return Math.round((at(b) - at(a)) / 86_400_000);
}

/** The month before 'YYYY-MM'. */
function monthBefore(ym: string): string {
  const t = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 2;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

/**
 * QE-07: "Last month's records are fresh (2 days old), so Decide answers from them instead of asking for more." In the
 * first 7 days of a month, with nothing recorded yet this month and last month complete, records synced at most 3 days
 * ago stand in for this month.
 */
export function recordsFresh(f: RightAnswerFixture): boolean {
  const t = f.thisMonth;
  if (f.recordsAsOf === null || f.recordsAsOf > f.asOf) return false;
  if (Number(f.asOf.slice(8, 10)) > FRESH_FIRST_DAYS || daysFrom(f.recordsAsOf, f.asOf) > FRESH_SYNC_DAYS) return false;
  return t.received === 0 && t.billsPaid === 0 && t.everydaySoFar === 0 && f.historyMonths > 0;
}

/**
 * Records look behind: everyday spending logged this month is under half the usual pace, and the newest everyday record
 * is more than 10 days old. A fixture records this month's spending on the 1st and each earlier month's on the 15th.
 * Fresh records (QE-07) never look behind.
 */
export function recordsLookBehind(f: RightAnswerFixture): boolean {
  if (f.historyMonths === 0 && f.quickEstimates === null) return false; // no usual pace to compare with
  const ym = f.asOf.slice(0, 7);
  const newest = f.thisMonth.everydaySoFar > 0 ? `${ym}-01` : f.historyMonths > 0 ? `${monthBefore(ym)}-15` : null;
  const old = newest === null || daysFrom(newest, f.asOf) > RECORD_AGE_DAYS;
  const day = BigInt(Number(f.asOf.slice(8, 10)));
  const behind = big(f.thisMonth.everydaySoFar) * daysInMonthOf(f.asOf) * 100n < 50n * big(f.usualMonth.everyday) * day;
  return old && behind && !recordsFresh(f);
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
  const cost = big(c.price) + big(c.oneOffFees);
  if (cost > ASK_FOR_RECORDS_ABOVE && recordsLookBehind(f)) return { code: 'needs_input', variant: null, afterBuy: null };
  if (recordsFresh(f)) return freshAnswer(f, cost);
  const left = leftThisMonth(f);
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

/**
 * QE-07: "December is expected to leave $1,000, like a usual month, and $1,000 - $500 = $500." With fresh records and
 * nothing recorded yet, this month is a usual month: the pay lands on the 1st, the usual bills and everyday spending go
 * out. The cash check counts that pay, then the same ladder as below: this month's room, then money already sitting
 * (less the part this month's room already counted).
 */
function freshAnswer(f: RightAnswerFixture, cost: Cents): PlainAnswer {
  const usualLeft = big(f.pay.amount) - big(f.usualMonth.bills) - big(f.usualMonth.everyday);
  const after = usualLeft - cost;
  const sitting = sittingMoney(f);
  if (sitting + usualLeft - cost < 0n) return { code: 'not_yet', variant: null, afterBuy: Number(after) };
  const room = maxC(0n, usualLeft);
  const fromMonth = cost < room ? cost : room;
  const rest = cost - fromMonth;
  if (rest === 0n) return { code: 'fits_month', variant: null, afterBuy: Number(after) };
  // As below: money already sitting, less the part of it this month's room already counted.
  const earlier = maxC(0n, sitting - fromMonth);
  return { code: rest <= earlier ? 'fits_unspent' : 'not_yet', variant: null, afterBuy: Number(after) };
}

/** Named so the table's thresholds have one reader; the Theme A plans use them. */
export const RULE_NAMES = { TIGHT_SHARE_BP, FLOOR_DIVISOR };
