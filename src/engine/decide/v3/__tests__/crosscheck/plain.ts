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

/**
 * Pay still to arrive this month: each pay date later this month (or today, when nothing has been received yet). "Expected pay
 * later this month counts on its date" (D-23).
 */
export function payToArrive(f: RightAnswerFixture): Cents {
  const ym = f.asOf.slice(0, 7);
  return payDates(f)
    .filter((d) => d.slice(0, 7) === ym && (d > f.asOf || (d === f.asOf && f.thisMonth.received === 0)))
    .reduce((t) => t + big(f.pay.amount), 0n);
}

/**
 * Free money: what sits in the spending accounts, plus pay still to arrive this month, less the bills still due and the
 * everyday spending still to come (SN-04: "Without touching the net he has $300 now"; SN-12: "£400 free after this month's
 * plans"). This month's room is part of it, counted once.
 */
export function freeMoney(f: RightAnswerFixture): Cents {
  return sittingMoney(f) + payToArrive(f) - big(f.thisMonth.billsDue) - everydayToCome(f);
}

// --- Safety net (05.4 FIN-01, FIN-02, ENG-03, ENG-04). Restated from the approved safety-net cases SN-01 .. SN-15, CONTEXT D-05,
// D-06, D-35, D-41 and the 05.4-12 revision notes. Not read from the engine.

export interface PlainNet { off: boolean; saved: Cents; size: Cents; starter: Cents; protectedPart: Cents; above: Cents; lend: Cents }

/**
 * "No record means the default: protection on, a starter size of one month of essential costs (bills + debt minimums + essential
 * everyday spending, rounded up to a whole unit), and $0 saved" (SN-01). "Only money already in the net is protected, so
 * nothing is held back" (D-35): the protected part is what is saved, up to the size; "the $500 above the $1,000 size is spare"
 * (SN-13). "A $0 net is treated exactly like protection off" (D-06, SN-07); with protection off the net's money counts like
 * any other (SN-05).
 */
export function plainNet(f: RightAnswerFixture): PlainNet {
  const n = f.safetyNet ?? { protect: true, size: null, saved: 0 };
  const essentials = big(f.usualMonth.bills) + f.debts.reduce((t, d) => t + big(d.minimum), 0n) + big(f.usualMonth.essentialEveryday);
  const starter = ((essentials + 99n) / 100n) * 100n;
  const size = n.size === null ? starter : big(n.size);
  const saved = maxC(0n, big(n.saved));
  const off = !n.protect || size === 0n;
  const protectedPart = off ? 0n : saved < size ? saved : size;
  const above = off ? 0n : saved - protectedPart;
  return { off, saved, size, starter, protectedPart, above, lend: off ? saved : protectedPart };
}

/** D-35: a fit while protection is on and the net is empty or below its size is amber. */
function netVariant(net: PlainNet): string | null {
  if (net.off) return null;
  if (net.saved === 0n) return 'no_net';
  return net.saved < net.size ? 'small_net' : null;
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
  const net = plainNet(f);
  // Cash check first: what is in the spending accounts has to carry the bills still due and the everyday spending
  // still to come until payday (the next pay lands after this month ends), as well as the cost itself. Balances keep their
  // sign ("-$1,500 is treated as $1,500 worse, never rounded up to $0", OD-10). Money saved above the net's size is spare
  // and counts here (SN-13). Below 0 is fine only inside the overdraft limit; past it, the money in the net may carry it
  // ("the path must stay above the net", FIN-02, SN-09: "Dips into your safety net"); past both it is Not yet (D-27, D-28).
  const margin = cashMargin(f, cost, true) + net.above;
  const pastLimit = margin < -overdraftRoom(f);
  if (pastLimit && margin + net.lend < 0n) return { code: 'not_yet', variant: null, afterBuy: Number(after) };
  // Room next: this month's money left (a month already below zero funds nothing). What it cannot cover comes from free
  // money from earlier months (free money less this month's room, counted once; below 0 has to be made up first), then
  // money above the net's size, then the overdraft as far as the account really goes below 0 (OD-01), then the net.
  const room = maxC(0n, left);
  const fromMonth = cost < room ? cost : room;
  const rest = cost - fromMonth;
  const earlier = freeMoney(f) - fromMonth;
  const dip = !pastLimit && margin < 0n ? -margin : 0n;
  const offVariant = net.off ? 'protection_off' : null;
  if (rest > 0n && rest > earlier + net.above && !(dip > 0n && rest <= earlier + net.above + dip)) {
    // "$1,500 is more than spare money plus the whole net, so it is Not yet" (SN-04).
    if (rest > earlier + net.above + net.lend) return { code: 'not_yet', variant: null, afterBuy: Number(after) };
    if (dip === 0n) return { code: 'fits_uses_net', variant: offVariant, afterBuy: Number(after) };
  }
  if (dip > 0n) return { code: 'fits_uses_overdraft', variant: notCleared(f, cost) ? 'not_cleared' : null, afterBuy: Number(after) };
  // "Any purchase that uses money in the net is Dips into your safety net, whatever its purpose" (D-41): here the path.
  if (pastLimit) return { code: 'fits_uses_net', variant: offVariant, afterBuy: Number(after) };
  return { code: rest === 0n ? 'fits_month' : 'fits_unspent', variant: netVariant(net), afterBuy: Number(after) };
}

/** OD-11: "her next pay does not clear it": after the next pay (and that day's bills and spending) the account is still below 0. */
export function notCleared(f: RightAnswerFixture, cost: Cents): boolean {
  const path = plainPath(f, cost);
  const next = payDates(f).find((d) => d > f.asOf);
  const onPay = next === undefined ? undefined : path.find((p) => p.date === next);
  return onPay === undefined || onPay.balance < 0n;
}

/**
 * QE-07: "December is expected to leave $1,000, like a usual month, and $1,000 - $500 = $500." With fresh records and
 * nothing recorded yet, this month is a usual month: the pay lands on the 1st, the usual bills and everyday spending go
 * out. The cash check counts that pay, then the same ladder as below: this month's room, then free money (what sits in the
 * accounts plus this month's room, less the part of it this month's room already counted).
 */
function freshAnswer(f: RightAnswerFixture, cost: Cents): PlainAnswer {
  const usualLeft = big(f.pay.amount) - big(f.usualMonth.bills) - big(f.usualMonth.everyday);
  const after = usualLeft - cost;
  const sitting = sittingMoney(f);
  const net = plainNet(f);
  const margin = sitting + usualLeft - cost + net.above;
  if (margin < 0n) return { code: margin + net.lend < 0n ? 'not_yet' : 'fits_uses_net', variant: net.off ? 'protection_off' : null, afterBuy: Number(after) };
  const room = maxC(0n, usualLeft);
  const fromMonth = cost < room ? cost : room;
  const rest = cost - fromMonth;
  if (rest === 0n) return { code: 'fits_month', variant: netVariant(net), afterBuy: Number(after) };
  // Free money is what sits plus this month's room; less the room this purchase already took, it is the earlier money.
  const earlier = sitting + usualLeft - fromMonth + net.above;
  return { code: rest <= earlier ? 'fits_unspent' : 'not_yet', variant: netVariant(net), afterBuy: Number(after) };
}

// --- Overdraft (05.4 FIN-03 / ENG-02). Restated from the approved overdraft cases (OD-01 .. OD-12), CONTEXT D-26..D-28 and
// D-36..D-38, and the 05.4-12 revision notes "How the figures were made". Not read from the engine.

/** "Only checking and current accounts have an overdraft", and only one used for everyday spending; no limit set counts as 0. */
export function overdraftRoom(f: RightAnswerFixture): Cents {
  return f.accounts
    .filter((a) => (a.kind === 'checking' || a.kind === 'current') && a.use === 'everyday' && a.overdraftLimit !== null && a.overdraftLimit > 0)
    .reduce((s, a) => s + big(a.overdraftLimit as number), 0n);
}

/** The date `d` days after 'YYYY-MM-DD'. */
function dayAfter(date: string, d: number): string {
  return new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)) + d)).toISOString().slice(0, 10);
}

/** Months from 'YYYY-MM' a to b. */
function monthsBetween(a: string, b: string): number {
  return (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
}

const PATH_DAYS = 90;

/** Pay dates from the next pay on, every month on the same day (or every 1 or 2 weeks), inside the 90 days. */
export function payDates(f: RightAnswerFixture): string[] {
  const end = dayAfter(f.asOf, PATH_DAYS);
  const out: string[] = [];
  for (let i = 0; ; i++) {
    const d =
      f.pay.cadence === 'monthly'
        ? new Date(Date.UTC(Number(f.pay.nextDate.slice(0, 4)), Number(f.pay.nextDate.slice(5, 7)) - 1 + i, Number(f.pay.nextDate.slice(8, 10)))).toISOString().slice(0, 10)
        : dayAfter(f.pay.nextDate, i * (f.pay.cadence === 'fortnightly' ? 14 : 7));
    if (d >= end) return out;
    if (d >= f.asOf) out.push(d);
  }
}

/**
 * "The day-by-day path follows: day 0 is the 'as of' day, the purchase is on day 0, the rest of this month's everyday
 * spending is spread evenly over the days left including day 0 (cumulative, rounded half up), later months spread by day of
 * month, and pay and the usual bills land on payday." Bills still due this month land on their due date when the fixture's
 * bills list gives one this month (OD-03: "after the $500 bill on the 28th"); the rest land the day before the next pay.
 */
export function plainPath(f: RightAnswerFixture, cost: Cents): { date: string; balance: Cents }[] {
  const ym = f.asOf.slice(0, 7);
  const dim = daysInMonthOf(f.asOf);
  const left = dim - BigInt(Number(f.asOf.slice(8, 10))) + 1n; // days left in this month, day 0 included
  const toCome = everydayToCome(f);
  const usual = big(f.usualMonth.everyday);
  const pays = new Set(payDates(f));
  const billsMonths = new Set<string>();
  const firstPay = [...pays].find((d) => d > f.asOf) ?? null;
  const dueDay = firstPay === null ? null : dayAfter(firstPay, -1);
  const dated = f.bills.filter((b) => b.paidBy === 'me' && b.nextDue >= f.asOf && b.nextDue.slice(0, 7) === ym);
  const undated = big(f.thisMonth.billsDue) - dated.reduce((t, b) => t + big(b.amount), 0n);
  const out: { date: string; balance: Cents }[] = [];
  let money = sittingMoney(f) - cost;
  for (let i = 0; i < PATH_DAYS; i++) {
    const date = dayAfter(f.asOf, i);
    if (pays.has(date)) {
      money += big(f.pay.amount);
      if (!billsMonths.has(date.slice(0, 7))) {
        billsMonths.add(date.slice(0, 7));
        money -= big(f.usualMonth.bills);
      }
    }
    for (const b of dated) if (b.nextDue === date) money -= big(b.amount);
    if (date === (dueDay ?? '') || (dueDay === null && i === 0)) money -= undated > 0n ? undated : 0n;
    const m = date.slice(0, 7);
    const spent =
      m === ym
        ? halfUp(toCome * BigInt(i + 1), left)
        : toCome + usual * BigInt(monthsBetween(ym, m) - 1) + halfUp(usual * BigInt(Number(date.slice(8, 10))), daysInMonthOf(date));
    out.push({ date, balance: money - spent });
  }
  return out;
}

/** Non-negative a / b, rounded half up. */
function halfUp(a: Cents, b: Cents): Cents {
  return (2n * a + b) / (2n * b);
}

/** D-36: "(sum over each day below $0 of how far below) x rate / 365, rounded half up". */
export function plainOverdraftCost(path: readonly { balance: Cents }[], rate: string): Cents {
  const below = path.reduce((s, p) => (p.balance < 0n ? s - p.balance : s), 0n);
  return halfUp(below * basisPoints(rate), 10_000n * 365n);
}

/** Named so the table's thresholds have one reader; the Theme A plans use them. */
export const RULE_NAMES = { TIGHT_SHARE_BP, FLOOR_DIVISOR };
