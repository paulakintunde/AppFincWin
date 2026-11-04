/**
 * Plain calculator. Written from the right-answer table rule statements. Shares no code with src/engine. QA-03.
 * Own integer maths on bigint minor units; percentages are parsed from strings to basis points. No floats in money.
 */
import type { RightAnswerFixture } from '../rightAnswers/schema';
import { TIGHT_SHARE_BP, FLOOR_DIVISOR, EXPENSIVE_APR_BP } from './rules';

type Cents = bigint;
export interface PlainAnswer { code: string; variant: string | null; afterBuy: number | null }

const big = (n: number): Cents => BigInt(n);
const maxC = (a: Cents, b: Cents): Cents => (a > b ? a : b);

/**
 * A usual month's pay: the stated pay for monthly pay (or the steady amount for irregular pay, D-52); 26 fortnights or 52 weeks a
 * year over 12 months otherwise, rounded half up (SN-09: $1,400 every two weeks is about $3,033 a month, so the usual month is not
 * short). 05.4-19: the usual month was read as one fortnight's pay before SN-09 came into the comparison.
 */
export function monthPay(f: RightAnswerFixture): Cents {
  if (f.pay.cadence === 'monthly' || f.pay.irregular !== undefined) return big(f.pay.amount);
  const year = big(f.pay.amount) * (f.pay.cadence === 'fortnightly' ? 26n : 52n);
  return (year * 2n + 12n) / 24n;
}

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

// --- Card and loan minimums (05.4 FIN-04, FIN-10, D-39b). Restated from the approved debt cases DB-01 .. DB-12 and CONTEXT D-08,
// D-39b, D-51. Not read from the engine.

type PlainDebt = RightAnswerFixture['debts'][number];

/**
 * DB-03: "Iris pays her $300 card minimum as a monthly bill ... it is part of this month's $1,500 of bills paid ... it is counted
 * once"; DB-07: "the $1,500 monthly payment is one of her $2,200 of bills". A debt paid as a bill is the bills list's monthly bill,
 * paid by this person, of the same amount on the same due day; each bill pays one debt, in the order the debts are listed.
 */
export function paidAsBill(f: RightAnswerFixture): ReadonlySet<string> {
  const used = new Set<string>();
  const out = new Set<string>();
  for (const d of f.debts) {
    const b = f.bills.find((x) => !used.has(x.id) && x.everyMonths === 1 && x.paidBy === 'me' && x.amount === d.minimum && d.dueDay !== null && Number(x.nextDue.slice(8, 10)) === d.dueDay);
    if (b === undefined) continue;
    used.add(b.id);
    out.add(d.id);
  }
  return out;
}

/** The debts the usual month counts by their minimum: every one not already one of the usual bills (counted once, DB-07). */
export function ownDebts(f: RightAnswerFixture): PlainDebt[] {
  const asBill = paidAsBill(f);
  return f.debts.filter((d) => !asBill.has(d.id));
}

/** The minimums a usual month sets aside besides its bills (DB-01: "November leaves $1,000 spare before his card"). */
export function debtMinimums(f: RightAnswerFixture): Cents {
  return ownDebts(f).reduce((t, d) => t + maxC(0n, big(d.minimum)), 0n);
}

/** Day `day` (cut to the month's last day) of the month `n` months after the month of `date`. */
function onDayOf(date: string, n: number, day: number): string {
  const first = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 10);
  return first.slice(0, 8) + String(Math.min(day, Number(daysInMonthOf(first)))).padStart(2, '0');
}

/**
 * Each minimum on the day-by-day path: "The card minimum lands on the day-by-day path on its due date" (DB-01), every month; "With
 * the due day unknown, the earliest likely day (tomorrow, 16 November) is used" (DB-02), then the same day each month; "Only the
 * $200 still owed on the minimum is taken, on 25 November" (DB-10). A due day already past this month was paid (it is in the
 * balance). A debt paid as a bill lands as that bill (DB-03).
 */
export function debtDates(f: RightAnswerFixture): { date: string; amount: Cents }[] {
  const end = dayAfter(f.asOf, PATH_DAYS);
  const ym = f.asOf.slice(0, 7);
  const out: { date: string; amount: Cents }[] = [];
  for (const d of ownDebts(f)) {
    if (d.minimum <= 0) continue;
    const first = d.dueDay === null ? dayAfter(f.asOf, 1) : onDayOf(f.asOf, 0, d.dueDay);
    const day = d.dueDay ?? Number(first.slice(8, 10));
    const owedNow = maxC(0n, big(d.minimum) - big(d.paidThisMonth ?? 0));
    // D-73 (owner): "a minimum stops once the balance is paid off. The last payment is only what's left, then nothing more."
    let left = maxC(0n, big(d.balance));
    for (let i = 0; ; i++) {
      const date = i === 0 ? first : onDayOf(first, i, day);
      if (date >= end) break;
      if (date < f.asOf) continue;
      const due = i === 0 && first.slice(0, 7) === ym ? owedNow : big(d.minimum);
      const amount = due < left ? due : left;
      if (amount > 0n) {
        out.push({ date, amount });
        left -= amount;
      }
    }
  }
  return out;
}

/** What is still to pay on the minimums this month (they leave before the month ends). */
export function debtToPay(f: RightAnswerFixture): Cents {
  const ym = f.asOf.slice(0, 7);
  return debtDates(f).filter((x) => x.date.slice(0, 7) === ym).reduce((t, x) => t + x.amount, 0n);
}

/**
 * D-39b (owner round 1): "amber when money saved from earlier months is spent while a debt at 20% APR or more remains"; DB-04:
 * "Because money saved from earlier months goes on the holiday while a card at 24.9% (20% or more) remains, the answer is the amber
 * 'Fits, but you carry costly debt'"; DB-11: "The purchase comes from this month's spare money ... so the costly-debt caution does
 * not apply". Money saved above the net's size is money saved in earlier months too (D-56).
 */
export function carriesCostlyDebt(f: RightAnswerFixture, fromEarlier: Cents): boolean {
  // D-72 (owner): "the costly-debt warning shows only when putting the earlier-month money toward the debt would save at least
  // $1.00 a month in interest": min(money from earlier months, balance) x APR / 12, rounded half up, at least 100 minor units.
  return f.debts.some((d) => {
    if (d.apr === null || basisPoints(d.apr) < big(EXPENSIVE_APR_BP)) return false;
    const put = fromEarlier < big(d.balance) ? fromEarlier : big(d.balance);
    return put > 0n && halfUp(put * basisPoints(d.apr), 120_000n) >= COSTLY_SAVING_MIN;
  });
}

/** D-72: the least interest a month the money from earlier months must save for the costly-debt caution, in minor units. */
const COSTLY_SAVING_MIN: Cents = 100n;

// --- Regular saving (05.4 D-58, D-67). "Regular saving/investing transfers out of the paying (main/everyday) account are taken out
// of it everywhere: the month-end figure, spare money (the D-56 cap), and the 90-day cash path" (D-67); "the amount to move and the
// date it must be moved by" (D-58). The usual month sets the saving aside (D-55: "expected at month end ... after savings").

/** The regular saving set aside in a usual month; 0 when the fixture states none. */
export function savingAmount(f: RightAnswerFixture): Cents {
  return big(f.usualMonth.saving?.amount ?? 0);
}

/** The saving still to move this month: not moved yet, and its day is today or later (D-67). */
export function savingToMove(f: RightAnswerFixture): Cents {
  const sv = f.usualMonth.saving;
  if (sv === undefined || sv.movedThisMonth || sv.day < Number(f.asOf.slice(8, 10))) return 0n;
  return big(sv.amount);
}

/** The saving transfers inside the 90 days: this month's when still to move, then one on its day each later month (D-67). */
function savingDates(f: RightAnswerFixture): string[] {
  const sv = f.usualMonth.saving;
  if (sv === undefined) return [];
  const end = dayAfter(f.asOf, PATH_DAYS);
  const y = Number(f.asOf.slice(0, 4));
  const m = Number(f.asOf.slice(5, 7)) - 1;
  const out: string[] = [];
  for (let i = 0; ; i++) {
    const date = new Date(Date.UTC(y, m + i, sv.day)).toISOString().slice(0, 10);
    if (date >= end) return out;
    if (i === 0 && savingToMove(f) === 0n) continue;
    out.push(date);
  }
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

/**
 * The money left this month before the purchase: money in, less everything paid, due, spent and still to come. With irregular
 * pay and a stated steady amount (D-52 fixtures), this month's money in is that steady amount, received or not: "at setup she
 * chose a steady amount of $3,000" (SN-16, the plan-18 audit's Maya).
 */
export function leftThisMonth(f: RightAnswerFixture): Cents {
  const t = f.thisMonth;
  const moneyIn = f.pay.irregular === undefined ? big(t.received) : big(f.pay.amount);
  // D-67 / D-55: the month sets the regular saving aside, moved yet or not. DB-10: "$3,000 pay - $1,200 bills - $800 everyday
  // spending - $100 already paid - $200 still due = $700": the whole minimum, paid or not.
  return moneyIn - big(t.billsPaid) - big(t.billsDue) - big(t.everydaySoFar) - everydayToCome(f) - savingAmount(f) - debtMinimums(f);
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
    .reduce((t) => t + payAmount(f), 0n);
}

/**
 * Free money: what sits in the spending accounts, plus pay still to arrive this month, less the bills still due and the
 * everyday spending still to come (SN-04: "Without touching the net he has $300 now"; SN-12: "£400 free after this month's
 * plans"). This month's room is part of it, counted once.
 */
export function freeMoney(f: RightAnswerFixture): Cents {
  const free = sittingMoney(f) + payToArrive(f) - big(f.thisMonth.billsDue) - everydayToCome(f);
  // D-56: "spare money" is money left in the everyday account, so it is never more than the account holds at month end (a month
  // end below 0 is the cash check's to judge, not a cap). Balances follow from their records (05.4-48), so this binds only by
  // rounding; it is restated so the rule has a reader here.
  const cap = maxC(0n, monthEndBalance(f));
  // D-47: the part of yearly and every-3-month bills the months before they are due cannot cover is held back from it.
  return (free < cap ? free : cap) - plainHoldBack(f);
}

// --- Yearly and every-3-month bills (05.4 FIN-11 as changed by D-47). Restated from RC-10 and CONTEXT D-47. Not read from the engine.

/** 'YYYY-MM-DD' plus n months, the day kept or cut to the month's last day. */
function plusMonths(date: string, n: number): string {
  const t = Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1 + n;
  const y = Math.floor(t / 12);
  const m = (t % 12) + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(Math.min(Number(date.slice(8, 10)), last)).padStart(2, '0')}`;
}

/** Whole months from a to b: RC-10 "4 whole months pass before 1 March 2027" from 15 October; 0 when b is not after a. */
export function wholeMonths(a: string, b: string): number {
  let n = 0;
  while (plusMonths(a, n + 1) <= b) n++;
  return n;
}

/** A bill the bills list names that comes every 3 or 12 months and is paid by this person (someone else's is never held back, D-31). */
const longBills = (f: RightAnswerFixture) => f.bills.filter((b) => b.paidBy === 'me' && (b.everyMonths === 3 || b.everyMonths === 12));

export interface PlainHeld { id: string; builtUp: Cents; uncovered: Cents; holdBack: Cents; months: number; perMonth: Cents }

/**
 * D-47 (owner round 2): "for yearly or quarterly bills, hold back only the part the months before the due date cannot cover from
 * the usual monthly leftover: hold-back = max(0, bill - usual leftover x whole months until due), capped at the built-up share ...
 * The built-up share resets after each payment." 05.4-19: "built-up share = bill x months since last paid / every months (half
 * up), capped at the bill"; "a bill with no last-paid date builds up from its anchor date" (nothing built up before its first due
 * date). RC-10: "Her usual month leaves £2,500 - £1,000 - £800 = £700, and 4 whole months pass before 1 March 2027 ... Hold-back
 * = the larger of £0 and £1,200 - £2,800, so £0 (the cap, the £700 built up over the 7 months since the last payment, is not
 * reached)." The usual leftover is never below 0 (a short month covers nothing). A bill due this month is in this month's bills
 * already (thisMonth.billsDue), so nothing more is held back for it.
 */
export function plainHeld(f: RightAnswerFixture): PlainHeld[] {
  const usual = monthPay(f) - big(f.usualMonth.bills) - big(f.usualMonth.everyday) - debtMinimums(f) - savingAmount(f);
  return longBills(f).map((b) => {
    const bill = big(b.amount);
    // D-70 (owner, 2026-11-04, "count it once"): "When the usual month already sets aside a twelfth of the bill ..., the cover check
    // uses leftover plus that twelfth for each month until the due date. Example: $800 a month, not $700."
    const leftover = maxC(0n, usual + ownShare(b));
    const since = b.lastPaid === null || b.lastPaid > f.asOf ? 0 : wholeMonths(b.lastPaid, f.asOf);
    const share = (bill * BigInt(since) * 2n + BigInt(b.everyMonths)) / (BigInt(b.everyMonths) * 2n);
    const builtUp = share < bill ? share : bill;
    const months = wholeMonths(f.asOf, b.nextDue);
    const uncovered = maxC(0n, bill - leftover * BigInt(months));
    const thisMonth = b.nextDue.slice(0, 7) === f.asOf.slice(0, 7);
    return { id: b.id, builtUp, uncovered, holdBack: thisMonth ? 0n : uncovered < builtUp ? uncovered : builtUp, months, perMonth: leftover };
  });
}

/** A yearly or every-3-month bill falls due inside the 90 days, after this month (this month's is in thisMonth.billsDue). */
export function longDueInWindow(f: RightAnswerFixture): boolean {
  const end = dayAfter(f.asOf, PATH_DAYS);
  return longBills(f).some((b) => b.nextDue.slice(0, 7) !== f.asOf.slice(0, 7) ? b.nextDue < end : plusMonths(b.nextDue, b.everyMonths) < end);
}

/** D-70: the monthly share of a bill the usual month already sets aside (inUsualMonth), bill / months between payments, half up. */
function ownShare(b: RightAnswerFixture['bills'][number]): Cents {
  if (b.inUsualMonth !== true) return 0n;
  return (big(b.amount) * 2n + BigInt(b.everyMonths)) / (BigInt(b.everyMonths) * 2n);
}

/** D-70: the part of usualMonth.bills that is yearly-bill shares; those bills land on their due dates, not on payday. */
export function sharesInUsual(f: RightAnswerFixture): Cents {
  return longBills(f).reduce((t, b) => t + ownShare(b), 0n);
}

/** The D-47 total held back from spare money. */
export function plainHoldBack(f: RightAnswerFixture): Cents {
  return plainHeld(f).reduce((t, h) => t + h.holdBack, 0n);
}

/**
 * What the spending accounts hold at the end of this month: what sits now, plus pay still to arrive, less what is still to go out,
 * the saving still to move included (D-67: "taken out of it everywhere: the month-end figure, spare money (the D-56 cap)").
 */
export function monthEndBalance(f: RightAnswerFixture): Cents {
  // DB-01: "November leaves $1,000 spare before his card": the minimum still to pay this month leaves the account too.
  return sittingMoney(f) + payToArrive(f) - big(f.thisMonth.billsDue) - everydayToCome(f) - savingToMove(f) - debtToPay(f);
}

// --- Safety net (05.4 FIN-01, FIN-02, ENG-03, ENG-04). Restated from the approved safety-net cases SN-01 .. SN-15, CONTEXT D-05,
// D-06, D-35, D-41 and the 05.4-12 revision notes. Not read from the engine.

export interface PlainNet { off: boolean; locked: boolean; saved: Cents; size: Cents; starter: Cents; protectedPart: Cents; above: Cents; lend: Cents }

/**
 * "No record means the default: protection on, a starter size of one month of essential costs (bills + debt minimums + essential
 * everyday spending, rounded up to a whole unit), and $0 saved" (SN-01). "Only money already in the net is protected, so
 * nothing is held back" (D-35): the protected part is what is saved, up to the size; "the $500 above the $1,000 size is spare"
 * (SN-13). "A $0 net is treated exactly like protection off" (D-06, SN-07); with protection off the net's money counts like
 * any other (SN-05).
 *
 * D-61: "the safety net (up to its set size) is locked by default and left out of the analysis entirely: a purchase that could
 * only be paid by using it is Not yet ... Money saved above the set size stays extra savings and can be used". Absent = locked;
 * no record at all is locked too. While locked the net lends nothing; unlocked (QE-14, SN-03, SN-09, SN-14, SN-15 say
 * locked: false) it lends its protected part as before. Protection off or a $0 size is never locked (D-06).
 */
export function plainNet(f: RightAnswerFixture): PlainNet {
  const n = f.safetyNet ?? { protect: true, size: null, saved: 0 };
  // D-51: "usual bills + essential spending + card and loan minimums"; a minimum paid as a bill is in the bills once (DB-07).
  const essentials = big(f.usualMonth.bills) + debtMinimums(f) + big(f.usualMonth.essentialEveryday);
  const starter = ((essentials + 99n) / 100n) * 100n;
  const size = n.size === null ? starter : big(n.size);
  const saved = maxC(0n, big(n.saved));
  const off = !n.protect || size === 0n;
  const protectedPart = off ? 0n : saved < size ? saved : size;
  const above = off ? 0n : saved - protectedPart;
  const locked = !off && n.locked !== false;
  return { off, locked, saved, size, starter, protectedPart, above, lend: off ? saved : locked ? 0n : protectedPart };
}

/** D-35: a fit while protection is on and the net is empty or below its size is amber. */
function netVariant(net: PlainNet): string | null {
  if (net.off) return null;
  if (net.saved === 0n) return 'no_net';
  return net.saved < net.size ? 'small_net' : null;
}

/**
 * D-63: "when the usual month is already short before the purchase, for any purchase (cash or plan), the answer is a clear no
 * with the headline 'No: your month is already short' ... on the code the engine would otherwise give". It never changes the
 * code; it leads the variant on every answer but an ask. The usual month: pay (the stated steady amount for irregular pay,
 * D-52), less the usual bills, everyday spending and debt minimums.
 */
export function usualMonthShort(f: RightAnswerFixture): boolean {
  return usualShortfall(f) > 0n;
}

/**
 * The variant on a fit (D-59, D-62): extra_savings ("Fits from extra savings": the purchase uses money above the net's size)
 * before the D-35 safety-net caution. month_already_short (D-63) leads both; plainAnswer sets it.
 */
function fitVariant(net: PlainNet, usesExtra: boolean, costly = false): string | null {
  // D-39b: the costly-debt caution leads the money's source and the net caution (05.4-20).
  if (costly) return 'costly_debt';
  if (usesExtra) return 'extra_savings';
  return netVariant(net);
}

/**
 * Cash left at the worst point before payday if the cost is paid today; below zero means the cash does not hold. D-67: the saving
 * still to move this month leaves the account before the next pay too.
 */
export function cashMargin(f: RightAnswerFixture, cost: Cents, withDues: boolean): Cents {
  return sittingMoney(f) - (withDues ? big(f.thisMonth.billsDue) + debtToPay(f) : 0n) - everydayToCome(f) - savingToMove(f) - cost;
}

/**
 * The usual month's shortfall (pay less usual bills, everyday spending, debt minimums and the regular saving, D-67), as a positive
 * figure; 0 when it balances.
 */
export function usualShortfall(f: RightAnswerFixture): Cents {
  const left = monthPay(f) - big(f.usualMonth.bills) - big(f.usualMonth.everyday) - debtMinimums(f) - savingAmount(f);
  return left < 0n ? -left : 0n;
}

export interface PlainTier { variant: string; months: number | null; monthsAfter: number | null }

/**
 * D-65 (owner, 2026-11-03, replaces D-63's single headline): "when the usual month is already short before the purchase, the
 * headline depends on how much the purchase eats into the money propping up the month. 'How long your money lasts' = months the
 * spare money + extra savings (never locked safety-net money, D-61) can cover the usual monthly shortfall. Small (cuts it by less
 * than 1 month): 'Fits, but your month is already short' ... Moderate (cuts it by 1 month or more): 'Fits from [spare money / extra
 * savings], but your month is already short' ... Large (needs the locked safety net, takes the 90-day path below $0, or a plan
 * payment makes the month more short): 'No: your month is already short'."
 * Restated: only a cash fit (Fits or Fits from spare money) that is a one-off with no running cost can be Small or Moderate.
 * used = the day-one cost (price + one-off fees); S = the usual shortfall; R = the free money (never below 0) + the money above the
 * net's size, never below used (the protected net is never in it). used < S is Small; else Moderate, from extra savings when the
 * purchase is more than the free money (extra savings pay part). N = floor(R / S), M = floor((R - used) / S).
 */
export function plainTier(f: RightAnswerFixture, code: string): PlainTier {
  const c = f.check;
  // D-68 refinement (a): "if the usual month is already short, a plan judged by cash gets the same D-65 tier a cash buy of the same
  // total would get"; used = the plan's whole cost.
  const short = plainShortPlan(f);
  const oneOff = (c.pay.mode === 'once' || short) && (c.runningCosts ?? []).length === 0;
  if (!((code === 'fits_month' || code === 'fits_unspent') && oneOff)) return { variant: 'month_already_short', months: null, monthsAfter: null };
  const used = short ? plainPlanTotal(f) : big(c.price ?? 0) + big(c.oneOffFees);
  const S = usualShortfall(f);
  const free = maxC(0n, freeMoney(f));
  const money = free + plainNet(f).above;
  const R = money > used ? money : used;
  if (used < S) return { variant: 'month_short_small', months: null, monthsAfter: null };
  return { variant: used > free ? 'month_short_moderate_extra' : 'month_short_moderate', months: Number(R / S), monthsAfter: Number((R - used) / S) };
}

/** The answer, with D-65's headline (D-63's on the Large tier) on every answer but an ask when the usual month is already short. */
export function plainAnswer(f: RightAnswerFixture): PlainAnswer {
  const a = plainCode(f);
  if (a.code === 'needs_input' || !usualMonthShort(f)) return a;
  return { ...a, variant: plainTier(f, a.code).variant };
}

function plainCode(f: RightAnswerFixture): PlainAnswer {
  const c = f.check;
  if (c.price === null) return { code: 'needs_input', variant: null, afterBuy: null };
  const cost = big(c.price) + big(c.oneOffFees);
  if (cost > ASK_FOR_RECORDS_ABOVE && recordsLookBehind(f)) return { code: 'needs_input', variant: null, afterBuy: null };
  if (recordsFresh(f)) return freshAnswer(f, cost);
  const left = leftThisMonth(f);
  if (c.pay.mode === 'plan') {
    // D-68: a short plan that money on hand pays in full inside the 90 days is judged by cash, as a one-off of its whole cost.
    if (plainShortPlan(f)) return shortPlanAnswer(f);
    // BR-12: "she would run out after the first payment ... Not yet"; BR-13: "A 0% plan cannot look fine while the account is
    // ... overdrawn". A plan whose dated path goes below $0, past the money above the net's size and any net money it may use, is
    // Not yet (no overdraft carries a plan). The ready-by month is not restated here.
    const net = plainNet(f);
    if (planPathLow(f) + net.above + net.lend < 0n) return { code: 'not_yet', variant: null, afterBuy: Number(left - big(c.pay.deposit)) };
    return { code: usualLeftOf(f) - plainPlanMonthly(f) < 0n ? 'monthly_short' : 'fits_month', variant: null, afterBuy: Number(left - big(c.pay.deposit)) };
  }
  const after = left - cost;
  const net = plainNet(f);
  // Cash check first: what is in the spending accounts has to carry the bills still due and the everyday spending
  // still to come until payday (the next pay lands after this month ends), as well as the cost itself. Balances keep their
  // sign ("-$1,500 is treated as $1,500 worse, never rounded up to $0", OD-10). Money saved above the net's size is spare
  // and counts here (SN-13). Below 0 is fine only inside the overdraft limit; past it, the money in the net may carry it
  // ("the path must stay above the net", FIN-02, SN-09: "Dips into your safety net"); past both it is Not yet (D-27, D-28).
  // D-52: irregular pay can land mid-month and the next pay can come after next month's bills, so the cash check reads the
  // day-by-day path's lowest point instead of the month-end figure (the same 90-day path the overdraft cases use).
  // 05.4-19 (D-47, RC-10 "by 28 February she has £2,850 before the bill is taken"): a yearly or every-3-month bill inside the
  // 90 days can take a later month below 0, so with one on the path the lower of the two figures decides.
  const until = f.pay.irregular === undefined ? cashMargin(f, cost, true) : pathLow(f, cost);
  // DB-01: "The card minimum lands on the day-by-day path on its due date", so with a minimum on the path its lowest point decides too.
  const longLow = longDueInWindow(f) || debtDates(f).length > 0 ? pathLow(f, cost) : until;
  const margin = (longLow < until ? longLow : until) + net.above;
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
  return { code: rest === 0n ? 'fits_month' : 'fits_unspent', variant: fitVariant(net, rest > maxC(0n, earlier), carriesCostlyDebt(f, rest)), afterBuy: Number(after) };
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
  const usualLeft = big(f.pay.amount) - big(f.usualMonth.bills) - big(f.usualMonth.everyday) - savingAmount(f) - debtMinimums(f);
  const after = usualLeft - cost;
  const sitting = sittingMoney(f);
  const net = plainNet(f);
  const margin = sitting + usualLeft - cost + net.above;
  if (margin < 0n) return { code: margin + net.lend < 0n ? 'not_yet' : 'fits_uses_net', variant: net.off ? 'protection_off' : null, afterBuy: Number(after) };
  const room = maxC(0n, usualLeft);
  const fromMonth = cost < room ? cost : room;
  const rest = cost - fromMonth;
  if (rest === 0n) return { code: 'fits_month', variant: fitVariant(net, false), afterBuy: Number(after) };
  // Free money is what sits plus this month's room; less the room this purchase already took, it is the earlier money.
  const earlier = sitting + usualLeft - fromMonth + net.above;
  if (rest > earlier) return { code: 'not_yet', variant: null, afterBuy: Number(after) };
  return { code: 'fits_unspent', variant: fitVariant(net, rest > earlier - net.above, carriesCostlyDebt(f, rest)), afterBuy: Number(after) };
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

/**
 * D-52: "for steady-but-irregular income ... with enough history and no scheduled pay series, the 90-day cash path expects pay
 * on the person's usual payday (from history) at their low-month amount". A fixture with pay.irregular pays on its stated day:
 * one date a month on min(day, days in the month), strictly after asOf; this month's only when nothing is received yet. The
 * amount is the lowest history month; a lowest month of 0 lands nothing.
 */
function irregularDates(f: RightAnswerFixture, day: number): string[] {
  if (payAmount(f) <= 0n) return [];
  const end = dayAfter(f.asOf, PATH_DAYS);
  const out: string[] = [];
  const y = Number(f.asOf.slice(0, 4));
  const m = Number(f.asOf.slice(5, 7)) - 1;
  for (let i = 0; ; i++) {
    const first = new Date(Date.UTC(y, m + i, 1)).toISOString().slice(0, 10);
    if (first >= end) return out;
    if (i === 0 && f.thisMonth.received > 0) continue;
    const date = first.slice(0, 8) + String(Math.min(day, Number(daysInMonthOf(first)))).padStart(2, '0');
    if (date > f.asOf && date < end) out.push(date);
  }
}

/** One pay: the stated pay, or for irregular pay (D-52) the lowest history month. */
export function payAmount(f: RightAnswerFixture): Cents {
  const irr = f.pay.irregular;
  if (irr === undefined) return big(f.pay.amount);
  return irr.amounts.reduce((lo, a) => (big(a) < lo ? big(a) : lo), big(irr.amounts[0] ?? 0));
}

/** Pay dates from the next pay on, every month on the same day (or every 1 or 2 weeks), inside the 90 days. */
export function payDates(f: RightAnswerFixture): string[] {
  if (f.pay.irregular !== undefined) return irregularDates(f, f.pay.irregular.day);
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
  return plainPathFlows(f, [{ date: f.asOf, amount: cost }]);
}

/**
 * The same day-by-day path with the purchase as dated flows, each taken on its own date (05.4-54, D-68: "the 90-day cash path can
 * pay" a plan whose "payments all fall inside the 90-day window"). plainPath is this with one flow, the cost, on day 0.
 */
export function plainPathFlows(f: RightAnswerFixture, flows: readonly { date: string; amount: Cents }[]): { date: string; balance: Cents }[] {
  const ym = f.asOf.slice(0, 7);
  const dim = daysInMonthOf(f.asOf);
  const left = dim - BigInt(Number(f.asOf.slice(8, 10))) + 1n; // days left in this month, day 0 included
  const toCome = everydayToCome(f);
  const usual = big(f.usualMonth.everyday);
  const pays = new Set(payDates(f));
  const billsMonths = new Set<string>();
  const firstPay = [...pays].find((d) => d > f.asOf) ?? null;
  // Undated bills still due land the day before the next pay; with irregular pay (no pay series) on the last day of this month.
  const monthEnd = `${ym}-${String(dim).padStart(2, '0')}`;
  // 05.4-19: never later than this month's last day (they are this month's bills).
  const before = firstPay === null ? null : dayAfter(firstPay, -1);
  const dueDay = f.pay.irregular !== undefined ? monthEnd : before === null ? null : before < monthEnd ? before : monthEnd;
  const dated = f.bills.filter((b) => b.paidBy === 'me' && b.nextDue >= f.asOf && b.nextDue.slice(0, 7) === ym);
  const undated = big(f.thisMonth.billsDue) - dated.reduce((t, b) => t + big(b.amount), 0n);
  // 05.4-19 (D-47): a yearly or every-3-month bill lands on each due date inside the 90 days (this month's is in `dated`).
  const endDay = dayAfter(f.asOf, PATH_DAYS);
  const longDues: { date: string; amount: Cents }[] = [];
  for (const b of longBills(f)) {
    for (let n = b.nextDue.slice(0, 7) === ym ? 1 : 0; ; n++) {
      const d = plusMonths(b.nextDue, b.everyMonths * n);
      if (d >= endDay) break;
      if (d >= f.asOf) longDues.push({ date: d, amount: big(b.amount) });
    }
  }
  const out: { date: string; balance: Cents }[] = [];
  let money = sittingMoney(f);
  const saves = new Set(savingDates(f)); // D-67: each saving transfer leaves the account on its date
  const minimums = debtDates(f); // FIN-04: each minimum on its due date, once
  for (let i = 0; i < PATH_DAYS; i++) {
    const date = dayAfter(f.asOf, i);
    for (const fl of flows) if (fl.date === date) money -= fl.amount;
    if (pays.has(date)) money += payAmount(f);
    if (saves.has(date)) money -= savingAmount(f);
    // The usual bills land on payday; with irregular pay (D-52) there is no pay series, so on the 1st of each later month.
    const billsDay = f.pay.irregular === undefined ? pays.has(date) : date.slice(8, 10) === '01' && date.slice(0, 7) !== ym;
    // 05.4-19 (FIN-11): a bill falls on the same day every month, so the part still due this month on its due day falls on that
    // day (cut to the month's end) in each later month too; only the rest lands on payday.
    const laterDue = undated > 0n && dueDay !== null ? undated : 0n;
    if (billsDay && !billsMonths.has(date.slice(0, 7))) {
      billsMonths.add(date.slice(0, 7));
      money -= big(f.usualMonth.bills) - laterDue - sharesInUsual(f);
    }
    if (laterDue > 0n && date.slice(0, 7) !== ym && Number(date.slice(8, 10)) === Math.min(Number((dueDay as string).slice(8, 10)), Number(daysInMonthOf(date)))) money -= laterDue;
    for (const b of dated) if (b.nextDue === date) money -= big(b.amount);
    for (const b of longDues) if (b.date === date) money -= b.amount;
    for (const x of minimums) if (x.date === date) money -= x.amount;
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

/** The lowest point of the day-by-day path with the cost paid today. */
export function pathLow(f: RightAnswerFixture, cost: Cents): Cents {
  return plainPath(f, cost).reduce((lo, p) => (p.balance < lo ? p.balance : lo), sittingMoney(f) - cost);
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

/**
 * D-58 (owner, 2026-11-03): "when extra savings (or any money) in another account must cover a gap the paying account cannot, the
 * answer states the amount to move and the date it must be moved by". The everyday account alone (no extra savings, no net) on the
 * day-by-day path with the purchase, the saving transfers taken on their dates (D-67). The amount is how far it goes below $0 at
 * its lowest, at most the money elsewhere that can cover it (money above the net's size, plus the net's own when the answer dips
 * into it); the date is the first day below $0. null when it never goes below $0 or nothing else can cover it.
 */
export function plainMoveBy(f: RightAnswerFixture, cost: Cents, dipsIntoNet = false): { amount: number; date: string } | null {
  const net = plainNet(f);
  const cover = net.above + (dipsIntoNet ? net.lend : 0n);
  if (cover <= 0n) return null;
  const path = plainPath(f, cost);
  const first = path.find((p) => p.balance < 0n);
  if (first === undefined) return null;
  const low = path.reduce((lo, p) => (p.balance < lo ? p.balance : lo), 0n);
  return { amount: Number(-low < cover ? -low : cover), date: first.date };
}

/**
 * Plan-49 re-run (the interest-total double count): a plan's total is the deposit plus every payment, each counted once, whatever
 * the date of the first payment (a first payment today is one of the payments, not an extra one). Fees are part of the amount the
 * payments repay, as in plainCode. The payments: a level payment (the exact annuity payment rounded up to the cent; with the first
 * payment today, the annuity-due payment), interest each month on what is owed rounded half up, the last payment whatever is left;
 * when that last payment would be more than the level one, the level payment goes up a cent (D-64, "the final payment never exceeds
 * the level payment"). 0% splits the amount evenly, rounded up, the last payment taking the rest.
 */
export function plainPlanTotal(f: RightAnswerFixture): Cents {
  const c = f.check;
  if (c.pay.mode !== 'plan') return 0n;
  const amount = big(c.price ?? 0) + big(c.oneOffFees) - big(c.pay.deposit) + big(c.pay.fees);
  const today = c.pay.firstPaymentDate === f.asOf;
  return big(c.pay.deposit) + planPayments(amount, c.pay.months, c.pay.apr, today).reduce((t, p) => t + p, 0n);
}

/** Every payment of a plan, in order (see plainPlanTotal). */
export function planPayments(amount: Cents, months: number, apr: string | null, firstToday: boolean): Cents[] {
  const bp = apr === null ? 0n : basisPoints(apr);
  const D = 10_000n * 12n; // a monthly rate of bp / D
  const ceil = (a: Cents, b: Cents): Cents => (a + b - 1n) / b;
  const n = BigInt(months);
  let level: Cents;
  if (bp === 0n) level = ceil(amount, n);
  else {
    const An = (D + bp) ** n;
    const Dn = D ** n;
    level = ceil(amount * bp * An, (firstToday ? D + bp : D) * (An - Dn));
  }
  const walk = (pay: Cents): Cents[] => {
    let owed = amount;
    const out: Cents[] = [];
    for (let k = 0; k < months; k++) {
      const interest = k === 0 && firstToday ? 0n : (2n * owed * bp + D) / (2n * D);
      const due = owed + interest;
      const paid = k === months - 1 || pay >= due ? due : pay;
      owed = due - paid;
      if (paid > 0n) out.push(paid);
    }
    return out;
  };
  let payments = walk(level);
  while ((payments[payments.length - 1] ?? 0n) > level) payments = walk(++level);
  return payments;
}

// --- Short plans paid from money on hand (05.4-54, D-68). Restated from CONTEXT D-68 and its refinements (a)-(c), BR-12 and the
// 05.4-53 SUMMARY's "How the rule works, in plain words". Not read from the engine.

type PlanPay = Extract<RightAnswerFixture['check']['pay'], { mode: 'plan' }>;

/**
 * The payment dates of a plan: `months` of them from the first payment date, on the same day each month (clamped to the month's
 * last day) or every 14 days when the plan says every fortnight (BR-12: "15 October, 29 October, 12 November and 26 November").
 */
export function planDates(f: RightAnswerFixture): string[] {
  const c = f.check.pay;
  if (c.mode !== 'plan') return [];
  const first = c.firstPaymentDate;
  const y = Number(first.slice(0, 4));
  const m = Number(first.slice(5, 7)) - 1;
  const d = Number(first.slice(8, 10));
  const out: string[] = [];
  for (let i = 0; i < c.months; i++) {
    if (c.every === 'fortnight') {
      out.push(dayAfter(first, 14 * i));
      continue;
    }
    const monthStart = new Date(Date.UTC(y, m + i, 1)).toISOString().slice(0, 10);
    out.push(monthStart.slice(0, 8) + String(Math.min(d, Number(daysInMonthOf(monthStart)))).padStart(2, '0'));
  }
  return out;
}

/**
 * The plan's payments a month, as the monthly test reads them: the level payment (planPayments' first; with the first payment
 * today the annuity-due payment, BR-16: "paid off in 48 payments of $205.76 (the last $205.57), the first of them today"), or for a
 * plan paid every fortnight that payment x 26 / 12 (BR-12: "about £487.50 a month while it runs" for 4 x £225 every two
 * weeks), rounded half up. The amount repaid is the one plainPlanTotal uses.
 */
export function plainPlanMonthly(f: RightAnswerFixture): Cents {
  const c = f.check.pay;
  if (c.mode !== 'plan') return 0n;
  const amount = big(f.check.price ?? 0) + big(f.check.oneOffFees) - big(c.deposit) + big(c.fees);
  const pay = planPayments(amount, c.months, c.apr, c.firstPaymentDate === f.asOf)[0] ?? 0n;
  return c.every === 'fortnight' ? halfUp(pay * 26n, 12n) : pay;
}

/** The plan's dated flows on the cash path: the deposit and fees on day 0, then each payment on its own date (D-68). */
function planFlows(f: RightAnswerFixture, c: PlanPay): { date: string; amount: Cents }[] {
  const amount = big(f.check.price ?? 0) + big(f.check.oneOffFees) - big(c.deposit);
  const pays = planPayments(amount, c.months, c.apr, c.firstPaymentDate === f.asOf);
  const dates = planDates(f);
  return [{ date: f.asOf, amount: big(c.deposit) + big(c.fees) }, ...pays.map((p, i) => ({ date: dates[i] ?? f.asOf, amount: p }))];
}

/** The lowest point of the day-by-day path with the plan's flows on their dates (D-68). */
export function planPathLow(f: RightAnswerFixture): Cents {
  const c = f.check.pay;
  if (c.mode !== 'plan') return pathLow(f, 0n);
  const flows = planFlows(f, c);
  const day0 = flows.filter((x) => x.date === f.asOf).reduce((t, x) => t + x.amount, 0n);
  return plainPathFlows(f, flows).reduce((lo, p) => (p.balance < lo ? p.balance : lo), sittingMoney(f) - day0);
}

/** The usual month's money left (pay less usual bills, everyday spending, the regular saving, D-67, and debt minimums), before any plan. */
function usualLeftOf(f: RightAnswerFixture): Cents {
  return monthPay(f) - big(f.usualMonth.bills) - big(f.usualMonth.everyday) - savingAmount(f) - debtMinimums(f);
}

/**
 * D-68 (owner, 2026-11-03): "a plan whose payments all fall inside the 90-day window, and which the 90-day cash path can pay
 * without going below $0 and without the locked safety net, is judged by cash like a one-off purchase, not by the monthly 'Short
 * each month' test." Refinements: "(b) money on hand must cover the plan's whole cost the way a cash buy would (matches BR-12),
 * with no help from pay beyond what the 90-day path already counts; (c) D-68 stays narrow: it changes an answer only when the
 * monthly test fails, and never applies when the plan needs the overdraft, any safety-net money (locked or not), or has a running
 * cost." 05.4-53 SUMMARY: "Is every payment dated before day 90 (days 0..89, the same days the cash path reads)?" and "this month's
 * room, spare money and extra savings above the net's size cover it, and the 90-day path with every payment on its own date never
 * goes below $0".
 *
 * Restated, all five must hold:
 *  1. a plan with no running monthly cost;
 *  2. every payment date is before asOf + 90 days;
 *  3. the monthly test fails: the plan's payments a month are more than the usual month leaves (the QE-12 test it replaces);
 *  4. the dated path (deposit and fees on day 0, each payment on its date) plus the money above the net's size never goes below
 *     $0: no overdraft, and no money in the net up to its size, locked or not;
 *  5. the plan's whole cost (plainPlanTotal) is covered, as a one-off of that cost, by this month's room, earlier money and money
 *     above the net's size.
 */
export function plainShortPlan(f: RightAnswerFixture): boolean {
  const c = f.check.pay;
  if (c.mode !== 'plan' || f.check.price === null || (f.check.runningCosts ?? []).length > 0) return false;
  const end = dayAfter(f.asOf, PATH_DAYS);
  if (!planDates(f).every((d) => d < end)) return false;
  if (usualLeftOf(f) - plainPlanMonthly(f) >= 0n) return false;
  return shortPlanCash(f) !== null;
}

/** Conditions 4 and 5 of plainShortPlan: the one-off ladder for the whole cost, the cash check read from the dated path. */
function shortPlanCash(f: RightAnswerFixture): { total: Cents; rest: Cents; earlier: Cents } | null {
  const net = plainNet(f);
  if (planPathLow(f) + net.above < 0n) return null;
  const total = plainPlanTotal(f);
  const room = maxC(0n, leftThisMonth(f));
  const fromMonth = total < room ? total : room;
  const rest = total - fromMonth;
  const earlier = freeMoney(f) - fromMonth;
  if (rest > 0n && rest > earlier + net.above) return null;
  return { total, rest, earlier };
}

/** D-68: the one-off answer for the plan's whole cost (Fits this month, or Fits from spare money / extra savings). */
function shortPlanAnswer(f: RightAnswerFixture): PlainAnswer {
  const s = shortPlanCash(f) as { total: Cents; rest: Cents; earlier: Cents };
  const after = Number(leftThisMonth(f) - s.total);
  return { code: s.rest === 0n ? 'fits_month' : 'fits_unspent', variant: fitVariant(plainNet(f), s.rest > maxC(0n, s.earlier), carriesCostlyDebt(f, s.rest)), afterBuy: after };
}

/** Named so the table's thresholds have one reader; the Theme A plans use them. */
export const RULE_NAMES = { TIGHT_SHARE_BP, FLOOR_DIVISOR };
