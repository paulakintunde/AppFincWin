/**
 * Plain calculator. Written from the right-answer table rule statements. Shares no code with src/engine. QA-03.
 * Own integer maths on bigint minor units; percentages are parsed from strings to basis points. No floats in money.
 */
import type { RightAnswerFixture } from '../rightAnswers/schema';
import { TIGHT_SHARE_BP, FLOOR_DIVISOR, EXPENSIVE_APR_BP, EXPENSIVE_INTEREST_BP, PAY_GAP_LINE_BP } from './rules';

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
  if (f.pay.irregular !== undefined) return big(f.pay.amount);
  if (f.pay.cadence === 'monthly') return lowerPay(f);
  const year = big(f.pay.amount) * (f.pay.cadence === 'fortnightly' ? 26n : 52n);
  return (year * 2n + 12n) / 24n;
}

/**
 * FIN-15 (QE-06): "He is judged on the lower figure, the middle of the last three: $2,720, which is 9.3% below the set-up pay". The
 * set-up pay is the stated set-up amount, else the usual pay; with the last three pays stated, the lower of it and their middle.
 */
export function lowerPay(f: RightAnswerFixture): Cents {
  const setup = big(f.pay.setupAmount ?? f.pay.amount);
  if (f.pay.lastThree === null) return setup;
  const middle = [...f.pay.lastThree].sort((a, b) => a - b)[1] as number;
  return big(middle) < setup ? big(middle) : setup;
}

/** FIN-15: "over the 5% line, so the gap is named". */
export function payGapNamed(f: RightAnswerFixture): boolean {
  const setup = big(f.pay.setupAmount ?? f.pay.amount);
  return (setup - lowerPay(f)) * 10_000n > BigInt(PAY_GAP_LINE_BP) * setup;
}

/** '12.5' -> 1250 basis points, digits only, no floats. */
export function basisPoints(text: string): Cents {
  const [whole = '0', frac = ''] = text.trim().split('.');
  return BigInt(whole) * 100n + BigInt((frac + '00').slice(0, 2));
}

/**
 * FIN-27 (05.4-25), restated from the tax cases and D-19 / D-20. "Up-front cost = price + tax + fees" (TX-07: "$9,000 + $720 (8%) +
 * $300 = $10,020"); on a plan "the tax is added to the plan" (TX-08: "$3,270.90 is paid over the plan, not $3,000"). The rate:
 * - "Price already includes tax" on: nothing is added (TX-02: "Adding VAT again would make the TV look £120 dearer");
 * - a rate the person typed is used as typed (TX-07: "His own 8% is used, not the pre-filled rate");
 * - else the usual rate of their state or province, an estimate (TX-06: "Decide pre-filled the usual 13% HST");
 * - UK and EU prices already include VAT (TX-02, TX-03); anywhere else, or the US or Canada with no state or province, adds
 *   nothing (TX-04, TX-05: "no tax is added and no rate is made up").
 * Tax = price x rate / 100, rounded half up to the cent. PLAIN_TAX_RATES is this calculator's own small table: only the places the
 * random fixtures and the table cases use, typed from the published sources (Tax Foundation, 1 July 2026; canada.ca, from 1 April
 * 2025). table.test checks each one against the engine's table.
 */
export const PLAIN_TAX_RATES: Readonly<Record<string, string>> = {
  'US-CA': '9.03',
  'US-TX': '8.2',
  'US-OR': '0',
  'CA-ON': '13',
  'CA-QC': '14.975',
  'CA-AB': '5',
};
/** The UK and the EU countries the random fixtures use (prices include VAT). */
export const PLAIN_VAT_INCLUDED: readonly string[] = ['GB', 'DE', 'FR', 'IE'];

/** '14.975' -> 14975 thousandths of a percent, digits only, no floats. */
function milliPercent(text: string): Cents {
  const [whole = '0', frac = ''] = text.trim().split('.');
  return BigInt(whole) * 1000n + BigInt((frac + '000').slice(0, 3));
}

/** The rate counted, as text; null = none added. */
export function plainTaxRate(f: RightAnswerFixture): string | null {
  const c = f.check;
  if (c.taxIncluded === true) return null;
  if (c.taxPercent !== null) return c.taxPercent;
  const r = f.region;
  if (r === null || PLAIN_VAT_INCLUDED.includes(r.country) || r.subdivision === null) return null;
  return PLAIN_TAX_RATES[`${r.country}-${r.subdivision}`] ?? null;
}

/** D-20: no rate typed, the switch not on, and no usual rate for where the person is (and not the UK or EU). */
export function plainTaxNotIncluded(f: RightAnswerFixture): boolean {
  const c = f.check;
  if (c.taxIncluded === true || c.taxPercent !== null) return false;
  if (f.region !== null && PLAIN_VAT_INCLUDED.includes(f.region.country)) return false;
  return plainTaxRate(f) === null;
}

/** The sales tax on the price, rounded half up. */
export function plainTax(f: RightAnswerFixture): Cents {
  const rate = plainTaxRate(f);
  if (rate === null || f.check.price === null) return 0n;
  const m = milliPercent(rate);
  return (2n * big(f.check.price) * m + 100_000n) / 200_000n;
}

/** The up-front cost before any plan: price + tax + one-off fees (TX-07). */
export function upFront(f: RightAnswerFixture): Cents {
  return big(f.check.price ?? 0) + plainTax(f) + big(f.check.oneOffFees);
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

// --- Quick estimates (05.4-57, ENG-11). Restated from the QE-01 and QE-13 statements, not from the engine (QA-03).
// QE-01: "quick estimates (pay £2,500, bills £1,000, everyday £300) ... The rest of her £300 everyday estimate is £80"; the
// estimates' bills are her bills, counted once as bills and never again inside the everyday figure. QE-13: "her £1,200 safety
// net (one month of £1,000 bills + £200 essential everyday spending)", the "£200 of it on essentials" the situation states.
// Every approved fixture with quick estimates states a usual month equal to its estimates, so these give the same results as
// reading usualMonth directly for all approved cases; they matter for drawn people (fixtureArb) and for the table pins.

const onEstimates = (f: RightAnswerFixture): boolean => f.historyMonths === 0 && f.quickEstimates !== null;

/**
 * The usual everyday spending per month. With no full month of records, it is what the quick estimates spend in a month (bills
 * + everyday) less the usual bills she has, never below 0: her £1,300 less her £1,000 of bills is the £300 everyday estimate.
 * With no bills recorded, the whole £1,300 is everyday spending (counted once, as everyday); with more bills recorded than the
 * estimates spend, nothing is left for everyday spending.
 * D-74 (owner, 2026-11-03): "money out" already includes the recorded bills, card and loan minimums and regular saving. The
 * money out she enters is her stated bills + everyday + the minimums not paid as one of her bills + her regular saving; each
 * recorded item is taken out of it once, and if they add up to more than the money out, nothing is left for everyday (so the
 * usual month takes out the larger figure: pay - bills - everyday - minimums - saving below).
 */
export function quickMoneyOut(f: RightAnswerFixture): Cents {
  const q = f.quickEstimates as NonNullable<RightAnswerFixture['quickEstimates']>;
  return big(q.bills) + big(q.everyday) + debtMinimums(f) + savingAmount(f);
}

export function usualEveryday(f: RightAnswerFixture): Cents {
  if (!onEstimates(f)) return big(f.usualMonth.everyday);
  const recorded = big(f.usualMonth.bills) + debtMinimums(f) + savingAmount(f);
  return maxC(0n, quickMoneyOut(f) - recorded);
}

/** The essential part of everyday spending ("£200 of it on essentials"), for the D-51 starter safety net; part of the everyday figure, so never above it on estimates. */
export function usualEssential(f: RightAnswerFixture): Cents {
  const stated = big(f.usualMonth.essentialEveryday);
  if (!onEstimates(f)) return stated;
  const e = usualEveryday(f);
  return stated < e ? stated : e;
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
  const behind = big(f.thisMonth.everydaySoFar) * daysInMonthOf(f.asOf) * 100n < 50n * usualEveryday(f) * day;
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
  const out: { date: string; amount: Cents }[] = [];
  for (const d of ownDebts(f)) out.push(...datesOfDebt(f, d));
  return out;
}

/** One debt's minimums on the path (debtDates). */
function datesOfDebt(f: RightAnswerFixture, d: PlainDebt): { date: string; amount: Cents }[] {
  const end = dayAfter(f.asOf, PATH_DAYS);
  const ym = f.asOf.slice(0, 7);
  const out: { date: string; amount: Cents }[] = [];
  if (d.minimum <= 0) return out;
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
  // 05.4-27 (SO-03): "The sale clears the $4,000 loan": a debt the sale pays off is gone, one paid in part owes the rest (D-102).
  return debtsAfterSale(f).some((d) => {
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
  const usual = usualEveryday(f);
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
  // 05.4-24 FIN-09b (D-86, owner): "money owed from last month comes off this month's big number, for everyone", and "it uses this
  // month up" (BR-06: "October ended $500 overdrawn ... November would end at -$300").
  return moneyIn - big(t.billsPaid) - big(t.billsDue) - big(t.everydaySoFar) - everydayToCome(f) - savingAmount(f) - debtMinimums(f) - carriedIn(f);
}

/**
 * 05.4-24 FIN-09b (D-86): the overdraft carried into this month. The everyday account now holds what it opened the month with plus
 * this month's money so far (BR-06: "October ended $500 overdrawn, so on 15 November he has $400" after $3,000 in, $1,500 of bills
 * and $600 of spending); an opening below 0 is owed from last month. Money carried in above 0 changes nothing (QE-09).
 */
export function carriedIn(f: RightAnswerFixture): Cents {
  const t = f.thisMonth;
  const moved = f.usualMonth.saving?.movedThisMonth === true ? big(f.usualMonth.saving.amount) : 0n;
  // DB-10: "$100 already paid - $200 still due": the part of a card or loan minimum already paid this month left the account too
  const debtPaid = maxC(0n, debtMinimums(f) - debtToPay(f));
  const opening = sittingMoney(f) - big(t.received) + big(t.billsPaid) + big(t.everydaySoFar) + moved + debtPaid;
  return opening < 0n ? -opening : 0n;
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
  const usual = monthPay(f) - big(f.usualMonth.bills) - usualEveryday(f) - debtMinimums(f) - savingAmount(f);
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
    // 05.4-27 (rule accepted 2026-11-04): "a stopped bill leaves ... the yearly-bill hold-back after its stop date".
    const stopped = stopsOf(f).some((s) => s.source === 'bill' && s.id === b.id && s.stopDate < b.nextDue);
    return { id: b.id, builtUp, uncovered, holdBack: thisMonth || stopped ? 0n : uncovered < builtUp ? uncovered : builtUp, months, perMonth: leftover };
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
  const essentials = big(f.usualMonth.bills) + debtMinimums(f) + usualEssential(f);
  const starter = ((essentials + 99n) / 100n) * 100n;
  const size = n.size === null ? starter : big(n.size);
  const saved = maxC(0n, big(n.saved));
  const off = !n.protect || size === 0n;
  const protectedPart = off ? 0n : saved < size ? saved : size;
  // 06 D-05, D-22: "an unlocked goal's saved money counts as spare in Decide"; money in an untouched account never
  // counts as spending money, so an unlocked goal kept there joins the money above the net's size. Locked goals stay out.
  const outside = new Set(f.accounts.filter((a) => a.use === 'untouched').map((a) => a.id));
  const unlocked = (f.goals ?? []).reduce((t, g) => t + (g.locked === false && g.accountId != null && outside.has(g.accountId) ? maxC(0n, big(g.saved)) : 0n), 0n);
  const above = (off ? 0n : saved - protectedPart) + unlocked;
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
function fitVariant(net: PlainNet, usesExtra: boolean, costly = false, tight = false): string | null {
  // D-59: "when 'tight' and a safety-net caution (no net / small net) both apply, 'tight' leads the answer" (05.4-21).
  if (tight) return 'tight';
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
  const left = monthPay(f) - big(f.usualMonth.bills) - usualEveryday(f) - debtMinimums(f) - savingAmount(f);
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
  const used = short ? plainPlanTotal(f) : upFront(f) + plainClosing(f);
  const S = usualShortfall(f);
  const free = maxC(0n, freeMoney(f));
  const money = free + plainNet(f).above;
  const R = money > used ? money : used;
  if (used < S) return { variant: 'month_short_small', months: null, monthsAfter: null };
  return { variant: used > free ? 'month_short_moderate_extra' : 'month_short_moderate', months: Number(R / S), monthsAfter: Number((R - used) / S) };
}

/**
 * ENG-15 (05.4-28, D-109): "That price is too large to check" above about US$100,000,000 in every currency, the US$ figure taken
 * at the fixed reference rate and tidied to one significant figure: $100,000,000; C$137,000,000 to C$100,000,000; £79,000,000 to
 * £80,000,000; €92,000,000 to €90,000,000. This calculator's own table, in cents, for the currencies the fixtures use.
 */
export const PLAIN_PRICE_LIMIT: Readonly<Record<RightAnswerFixture['currency'], Cents>> = {
  USD: 10_000_000_000n,
  CAD: 10_000_000_000n,
  GBP: 8_000_000_000n,
  EUR: 9_000_000_000n,
};

/** ENG-15: no price or 0 asks for a price; above the limit is too large to check (both asks), in both pay modes. */
export function priceAsks(f: RightAnswerFixture): boolean {
  const p = f.check.price;
  return p === null || p <= 0 || big(p) > PLAIN_PRICE_LIMIT[f.currency];
}

/** ENG-17 (D-114): "No exchange rate for {account}, so it is left out." An account with no rate is not counted anywhere. */
export function withoutUnrated(f: RightAnswerFixture): RightAnswerFixture {
  return f.accounts.some((a) => a.noRate === true) ? { ...f, accounts: f.accounts.filter((a) => a.noRate !== true) } : f;
}

/** The answer, with D-65's headline (D-63's on the Large tier) on every answer but an ask when the usual month is already short. */
export function plainAnswer(f0: RightAnswerFixture): PlainAnswer {
  const f = withoutUnrated(f0);
  const a = plainCode(f);
  if (a.code === 'needs_input' || !usualMonthShort(f)) return a;
  // 05.4-22: "Only by borrowing" keeps the headline the plan's own fit gets when the month is already short
  const own = a.code === 'fits_by_borrowing' ? plainPlanCode(f).code : a.code;
  return { ...a, variant: plainTier(f, own).variant };
}

function plainCode(f: RightAnswerFixture): PlainAnswer {
  const c = f.check;
  if (priceAsks(f)) return { code: 'needs_input', variant: null, afterBuy: null };
  const cost = upFront(f) + plainClosing(f);
  // 05.4-26 (D-100): the closing % is paid up front but is not part of the price the records rule reads (price, tax and fees).
  if (upFront(f) > ASK_FOR_RECORDS_ABOVE && recordsLookBehind(f)) return { code: 'needs_input', variant: null, afterBuy: null };
  // 05.4-27 (SO-01): "she needs only $6,000 - $5,500 = $500 of her own money": a sale arriving by the purchase date lowers what it
  // needs on day one (the records rule above still reads the price).
  const need = cost - saleNow(f, cost);
  if (recordsFresh(f)) return withRunning(f, laterFigure(f, freshAnswer(f, need)));
  if (c.pay.mode === 'plan') return plainBorrowing(f, plainPlanCode(f));
  return withRunning(f, laterFigure(f, plainOnce(f, need)));
}

/** A plan's own answer, before the borrowing rule (plainBorrowing). */
function plainPlanCode(f: RightAnswerFixture): PlainAnswer {
  const c = f.check;
  const left = leftThisMonth(f);
  if (c.pay.mode === 'plan') {
    // The plan's rate is asked when it is not given (the needs-input rule: "plan_rate_missing", 05.1 D-07).
    if (c.pay.apr === null) return { code: 'needs_input', variant: null, afterBuy: null };
    // D-68: a short plan that money on hand pays in full inside the 90 days is judged by cash, as a one-off of its whole cost.
    if (plainShortPlan(f)) return shortPlanAnswer(f);
    // BR-12: "she would run out after the first payment ... Not yet"; BR-13: "A 0% plan cannot look fine while the account is
    // ... overdrawn". A plan whose dated path goes below $0, past the money above the net's size and any net money it may use, is
    // Not yet (no overdraft carries a plan). The ready-by month is not restated here.
    const net = plainNet(f);
    // 05.4-24 (FIN-09, BR-06: "the first $100 payment falls on 28 November, inside this month"): the month figure loses what the
    // plan takes this month, the deposit and fees on the day and every payment dated before next month.
    const month = Number(left - plainThisMonthPlan(f));
    if (planPathLow(f) + net.above + net.lend < 0n) return { code: 'not_yet', variant: null, afterBuy: month };
    if (plainMonthlyShort(f)) return { code: 'monthly_short', variant: null, afterBuy: month };
    const low = plainLowMonths(f);
    if (low !== null) return { ...low, afterBuy: month };
    return { code: 'fits_month', variant: plainTightPlan(f) ? 'tight' : null, afterBuy: month };
  }
  return { code: 'needs_input', variant: null, afterBuy: null };
}

/** A purchase paid once: the cash check, then the ladder. */
function plainOnce(f: RightAnswerFixture, cost: Cents): PlainAnswer {
  const left = leftThisMonth(f);
  // 05.4-24 (FIN-09, D-23, QE-09): "The pay on the 27th counts in the month figure ($800 - $600 = $200 left)": the figure after
  // buying counts pay still to arrive this month (irregular pay is already counted in full above).
  const figure = left + (f.pay.irregular === undefined ? payToArrive(f) : 0n);
  const after = figure - cost;
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
  // 05.4-26 (RC-08): bought on a later date, the cost leaves on that date, so the day-by-day path decides.
  // 05.4-27: what a purchase replaces lands on its own dates (SO-02: "on 20 December"), so the day-by-day path decides.
  const until = f.pay.irregular === undefined && buyDay(f) === f.asOf && replacesDates(f).length === 0 ? cashMargin(f, cost, true) : pathLow(f, cost);
  // DB-01: "The card minimum lands on the day-by-day path on its due date", so with a minimum on the path its lowest point decides too.
  // 05.4-21: D-65 "Large (... takes the 90-day path below $0 ...)": with the usual month already short, every month on the path loses
  // money, so its lowest point decides as well (this was the second half of the FIN-06/FIN-07 skip, now restated).
  // 05.4-26 (RC-04): "On the cash path the full $600 falls on 15 January": with a running cost on the path its lowest point decides too.
  const longLow = longDueInWindow(f) || debtDates(f).length > 0 || usualMonthShort(f) || runningDates(f).length > 0 || replacesDates(f).length > 0 ? pathLow(f, cost) : until;
  const margin = (longLow < until ? longLow : until) + net.above;
  const pastLimit = margin < -overdraftRoom(f);
  if (pastLimit && margin + net.lend < 0n) return { code: 'not_yet', variant: null, afterBuy: Number(after) };
  // Room next: this month's money left (a month already below zero funds nothing). What it cannot cover comes from free
  // money from earlier months (free money less this month's room, counted once; below 0 has to be made up first), then
  // money above the net's size, then the overdraft as far as the account really goes below 0 (OD-01), then the net.
  const room = maxC(0n, left);
  const thisMonth = cost < room ? cost : room;
  // RC-08: "By then she has her $1,000 now plus December's $1,000": a later purchase month adds the usual months before it.
  const fromMonth = thisMonth + minC(cost - thisMonth, laterMoney(f));
  const rest = cost - fromMonth;
  const earlier = freeMoney(f) - thisMonth;
  const dip = !pastLimit && margin < 0n ? -margin : 0n;
  const offVariant = net.off ? 'protection_off' : null;
  if (rest > 0n && rest > earlier + net.above && !(dip > 0n && rest <= earlier + net.above + dip)) {
    // "$1,500 is more than spare money plus the whole net, so it is Not yet" (SN-04).
    if (rest > earlier + net.above + net.lend) return { code: 'not_yet', variant: null, afterBuy: Number(after) };
    // 05.4-24: the spare money and extra savings it uses are named (D-44), so they do not come off the month; the net money does (SN-03).
    // The net lends what the ladder still needs or, when the 90-day path dips further, the whole dip ("the path must stay above the
    // net", FIN-02); what is left of the price after the month and the net is the named money.
    if (dip === 0n) return { code: 'fits_uses_net', variant: offVariant, afterBuy: netDipFigure(figure, cost, rest - maxC(0n, earlier) - net.above, purchaseMargin(f, margin, pathLow), net) };
  }
  // 05.4-24: on Uses your overdraft the price comes out of this month ("the account pays now and goes below 0"), except the part the
  // money above the net's size pays after this month's room and the spare money (extra savings, named, D-44 / D-56).
  // The ladder reads spare money with its sign (below 0 is made up first): the extra savings pay only when they close the gap; when
  // the overdraft carries it they pay nothing; past the overdraft the net lends, the extra savings first.
  if (dip > 0n) {
    const short = rest - maxC(0n, earlier);
    const extraUsed = rest <= earlier ? 0n : rest <= earlier + net.above ? short : rest <= earlier + net.above + dip ? 0n : net.above < short ? net.above : short;
    return { code: 'fits_uses_overdraft', variant: notCleared(f, cost) ? 'not_cleared' : null, afterBuy: Number(after + extraUsed) };
  }
  // "Any purchase that uses money in the net is Dips into your safety net, whatever its purpose" (D-41): here the path.
  if (pastLimit) return { code: 'fits_uses_net', variant: offVariant, afterBuy: netDipFigure(figure, cost, maxC(0n, rest - maxC(0n, earlier) - net.above), purchaseMargin(f, margin, pathLow), net) };
  const tight = plainTightOnce(f, freeMoney(f) + net.above + laterMoney(f) - cost);
  // 05.4-24 (FIN-09): money from earlier months is not this month's, so the month figure drops only by what the month pays (BR-17).
  return { code: rest === 0n ? 'fits_month' : 'fits_unspent', variant: fitVariant(net, rest > maxC(0n, earlier), carriesCostlyDebt(f, rest), tight), afterBuy: Number(figure - fromMonth) };
}

/**
 * 05.4-24 (FIN-09): the month figure on "Dips into your safety net". The net lends what the price still needs after this month, the
 * spare money and the extra savings, or the whole dip when the 90-day path goes lower ("the path must stay above the net", FIN-02),
 * never more than it may lend or the price. The rest of the price comes from the extra savings first, then this month, then spare
 * money (SN-13: "$300 spare in November plus $200 of the extra"). The month figure loses this month's part and the net's (SN-03:
 * "$300 - $500 = -$200"); the extra savings and spare money are named (D-44).
 */
/**
 * 05.4-27 (D-35: a dip that is there without the purchase is not the purchase's): with what a purchase replaces on the path, the net
 * lends what the purchase and its replacement add to the dip, the dip with them less the dip with neither (crosscheck: a stopped
 * every-3-month bill gives $1,319.99 back on 16 December, so the purchase adds $10,298.58, not the whole $11,283.74 dip).
 */
function purchaseMargin(f: RightAnswerFixture, margin: Cents, low: (g: RightAnswerFixture, cost: Cents) => Cents): Cents {
  if (replacesDates(f).length === 0) return margin;
  // the path with neither the purchase nor anything that comes with it (its running costs, what it replaces)
  const before = low({ ...f, check: { ...f.check, replaces: null, runningCosts: [] } }, 0n) + plainNet(f).above;
  return before < 0n ? margin - before : margin;
}

function netDipFigure(figure: Cents, cost: Cents, need: Cents, margin: Cents, net: PlainNet): number {
  const dip = margin < 0n ? -margin : 0n;
  const fromNet = [need > dip ? need : dip, net.lend, cost].reduce((a, b) => (b < a ? b : a));
  const extra = net.above < cost - fromNet ? net.above : cost - fromNet;
  const room = maxC(0n, figure);
  const month = room < cost - fromNet - extra ? room : cost - fromNet - extra;
  return Number(figure - fromNet - month);
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
  const usualRaw = big(f.pay.amount) - big(f.usualMonth.bills) - usualEveryday(f) - savingAmount(f) - debtMinimums(f);
  // 05.4-24 FIN-09b (D-86): an account that opens the month below 0 pays that back from this month first: this month's room and its
  // figure shrink; what sits in the account already shows the overdraft, so the month-end and spare-money sums keep the raw month.
  const usualLeft = usualRaw - carriedIn(f);
  const after = usualLeft - cost;
  const sitting = sittingMoney(f);
  const net = plainNet(f);
  // 05.4-21 (D-65 Large, as in plainCode): with the usual month already short, every month on the 90-day path loses money, so the
  // path's lowest point decides when it is lower than this month's end.
  const monthEnd = sitting + usualRaw - cost;
  // 05.4-26 (RC-08, D-95): bought on a later date, the cost leaves on that date, so the day-by-day path decides alone. With a running
  // cost on the path (RC-04: "On the cash path the full $600 falls on 15 January") its lowest point decides too, as when the usual
  // month is already short.
  // D-95: the money test counts this month and the whole months before the purchase month, never the purchase month's own pay.
  // 05.4-27 (SO-02: "On 20 December she has $1,000 + December's $1,000 + $5,500"): money a purchase's replacement brings in by the
  // purchase date (a sale, costs that stop) is there by then too (crosscheck seed 17: a $2,024.60 sale on 18 November, bought in February).
  const brought = replacesDates(f).filter((d) => d.date <= buyDay(f)).reduce((t, d) => t - d.amount, 0n);
  const money = monthEnd + laterMoney(f) + brought;
  const low = buyDay(f) !== f.asOf || usualMonthShort(f) || runningDates(f).length > 0 || replacesDates(f).length > 0 ? pathLowest(f, cost) : money;
  const margin = (low < money ? low : money) + net.above;
  // 05.4-24: on Dips into your safety net the spare money still in the account and the extra savings it uses are named (D-44), so
  // only the month's money and the net money come off the month figure.
  const room = maxC(0n, usualLeft);
  const thisMonth = cost < room ? cost : room;
  // D-95: the whole months before a later purchase month add their usual leftover.
  const fromMonth = thisMonth + minC(cost - thisMonth, laterMoney(f));
  const rest = cost - fromMonth;
  if (margin < 0n) {
    // what really sits from earlier months (D-56: never below 0) and the extra savings, as far as the price needs them
    const need = maxC(0n, rest - maxC(0n, sitting + usualRaw - thisMonth) - net.above);
    // 05.4-27 (crosscheck seed 37): the net lends only what the money ladder still needs: this month's room, the earlier money (with its
    // sign) and the extra savings come first, and a price past all of them and the net is Not yet, as on a day with records.
    const dips = margin + net.lend >= 0n && rest <= sitting + usualRaw - thisMonth + net.above + net.lend;
    return { code: dips ? 'fits_uses_net' : 'not_yet', variant: net.off ? 'protection_off' : null, afterBuy: dips ? netDipFigure(usualLeft, cost, need, purchaseMargin(f, margin, pathLowest), net) : Number(after) };
  }
  // D-40: free money is what sits plus this month's room; with the money above the net's size, less the purchase, it is what is left.
  const tight = plainTightOnce(f, sitting + usualRaw + net.above + laterMoney(f) - cost);
  if (rest === 0n) return { code: 'fits_month', variant: fitVariant(net, false, false, tight), afterBuy: Number(after) };
  // Free money is what sits plus this month's room; less the room this purchase already took, it is the earlier money.
  const earlier = sitting + usualRaw - thisMonth + net.above;
  if (rest > earlier) return { code: 'not_yet', variant: null, afterBuy: Number(after) };
  return { code: 'fits_unspent', variant: fitVariant(net, rest > earlier - net.above, carriesCostlyDebt(f, rest), tight), afterBuy: Number(usualLeft - fromMonth) };
}

// --- Short month and tight (05.4 FIN-06 / ENG-06, FIN-07, D-40). Restated from the owner's tight rule (2026-11-01), D-40, settled
// disagreement 5 of the fix plan and the approved cases BR-05..BR-11, SN-10, SN-11, DB-02, DB-03, DB-07, DB-10, QE-01, QE-08,
// QE-13, SO-06 and RC-10. Not read from the engine.

/**
 * The floor: "a line the user set, or less than a tenth of a month's spending" (owner), "a tenth of a usual month's bills plus
 * everyday spending" (D-40). BR-09: "A line the user sets replaces the tenth-of-spending floor." QE-01: "with no full month of
 * records, the floor comes from her estimates: a tenth of £1,000 bills + £300 everyday spending = £130". DB-02: "a tenth of $1,200
 * bills + $800 everyday spending" (the $300 card minimum is not spending). Rounded up to the cent.
 */
export function plainFloor(f: RightAnswerFixture): Cents {
  if (f.userLine !== null) return maxC(0n, big(f.userLine));
  const spend = maxC(0n, big(f.usualMonth.bills) + usualEveryday(f));
  const d = BigInt(FLOOR_DIVISOR);
  return (spend + d - 1n) / d;
}

/**
 * One-off tight (D-40): "money left after the purchase under a tenth of a usual month's bills plus everyday spending". The money
 * left is the free money after this month's plans (this month's room and earlier money, counted once) plus the money above the
 * net's size, less the purchase: SN-11 "£3,000 free - £2,950 = £50 left"; QE-08 "$1,000 - $975 = $25". The 80% part never applies.
 */
export function plainTightOnce(f: RightAnswerFixture, left: Cents): boolean {
  return left < plainFloor(f);
}

/**
 * Plan tight (owner): "the payment takes more than 80% of the usual monthly room, OR the money left each month falls below a floor".
 * BR-07: "$1,870 is 85% of her $2,200 room, which is more than 80%"; BR-11: "100% of his £200 room ... leaves £0".
 */
export function plainTightPlan(f: RightAnswerFixture): boolean {
  const room = usualLeftOf(f);
  const M = plainPlanMonthly(f);
  return M * 10_000n > room * BigInt(TIGHT_SHARE_BP) || room - M < plainFloor(f);
}

/**
 * FIN-06 (settled disagreement 5): "A new payment cannot fit when the usual month is at or below zero, or when this month is heading
 * below zero and the first payment falls this month." BR-06: "$400 - $600 means November is heading to -$200, and the first $100
 * payment falls on 28 November, inside this month": the free money after this month's plans. BR-05: "the money left each month is
 * below $0 before she buys anything". And the payment bigger than the room (QE-12, BR-11: "not Short each month, because the
 * payment is not bigger than the room").
 */
export function plainMonthlyShort(f: RightAnswerFixture): boolean {
  const room = usualLeftOf(f);
  if (room <= 0n || room - plainPlanMonthly(f) < 0n) return true;
  const first = planDates(f)[0];
  return first !== undefined && first.slice(0, 7) === f.asOf.slice(0, 7) && freeMoney(f) < 0n;
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
  // 05.4-26: the cost on the day it is bought (RC-08), held to the path's last day, and each running cost on its own dates (RC-03).
  const last = dayAfter(f.asOf, PATH_DAYS - 1);
  const day = buyDay(f) < last ? buyDay(f) : last;
  return plainPathFlows(f, [{ date: day, amount: cost }, ...runningDates(f), ...replacesDates(f)]);
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
  const usual = usualEveryday(f);
  const pays = new Set(payDates(f));
  const billsMonths = new Set<string>();
  const firstPay = [...pays].find((d) => d > f.asOf) ?? null;
  // Undated bills still due land the day before the next pay; with irregular pay (no pay series) on the last day of this month.
  const monthEnd = `${ym}-${String(dim).padStart(2, '0')}`;
  // 05.4-19: never later than this month's last day (they are this month's bills).
  const before = firstPay === null ? null : dayAfter(firstPay, -1);
  const dueDay = f.pay.irregular !== undefined ? monthEnd : before === null ? null : before < monthEnd ? before : monthEnd;
  const dated = f.bills.filter((b) => b.paidBy === 'me' && b.nextDue >= f.asOf && b.nextDue.slice(0, 7) === ym);
  const named = f.bills.filter((b) => b.paidBy === 'me' && b.everyMonths === 1);
  const namedMonthly = named.reduce((t, b) => t + big(b.amount), 0n);
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
      // 05.4-27 (CI seed 1859689569): a named monthly bill (DB-03: "a debt paid as a bill lands as that bill") falls on its own due day in
      // each later month, as this month's does; only the rest of the usual bills lands on payday.
      money -= big(f.usualMonth.bills) - laterDue - sharesInUsual(f) - (date.slice(0, 7) === ym ? 0n : namedMonthly);
    }
    if (date.slice(0, 7) !== ym) for (const b of named) if (date >= b.nextDue && Number(date.slice(8, 10)) === Math.min(Number(b.nextDue.slice(8, 10)), Number(daysInMonthOf(date)))) money -= big(b.amount);
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
  // 05.4-27 (SO-01: "The sale money arrives the same day"): sale money that lands today is in the account today, so the start of
  // the path counts it (crosscheck seed 14: an account $2,644 overdrawn, with a sale's $14,760 landing today, is not below $0 today).
  const today = replacesDates(f).filter((d) => d.date === f.asOf).reduce((t, d) => t - d.amount, 0n);
  return plainPath(f, cost).reduce((lo, p) => (p.balance < lo ? p.balance : lo), sittingMoney(f) + today - (buyDay(f) === f.asOf ? cost : 0n));
}

/** The lowest day of the day-by-day path itself (fresh records: the pay landing today is on the path, not in the account yet). */
function pathLowest(f: RightAnswerFixture, cost: Cents): Cents {
  return plainPath(f, cost).reduce((lo, p) => (p.balance < lo ? p.balance : lo), sittingMoney(f) + payAmount(f));
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
  const amount = upFront(f) - big(c.pay.deposit) + big(c.pay.fees);
  const today = c.pay.firstPaymentDate === f.asOf;
  return big(c.pay.deposit) + planPayments(amount, c.pay.months, c.pay.apr, today).reduce((t, p) => t + p, 0n);
}

/** Every payment of a plan, in order (see plainPlanTotal). */
export function planPayments(amount: Cents, months: number, apr: string | null, firstToday: boolean, perYear = 12n): Cents[] {
  const bp = apr === null ? 0n : basisPoints(apr);
  const D = 10_000n * perYear; // a rate per period of bp / D (a month by default; 05.4-22: 26 a year for a fortnight)
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
  const amount = upFront(f) - big(c.deposit) + big(c.fees);
  const pay = planPayments(amount, c.months, c.apr, c.firstPaymentDate === f.asOf)[0] ?? 0n;
  return c.every === 'fortnight' ? halfUp(pay * 26n, 12n) : pay;
}

/** The plan's dated flows on the cash path: the deposit and fees on day 0, then each payment on its own date (D-68). */
function planFlows(f: RightAnswerFixture, c: PlanPay): { date: string; amount: Cents }[] {
  const amount = upFront(f) - big(c.deposit);
  const pays = planPayments(amount, c.months, c.apr, c.firstPaymentDate === f.asOf);
  const dates = planDates(f);
  return [{ date: f.asOf, amount: big(c.deposit) + big(c.fees) }, ...pays.map((p, i) => ({ date: dates[i] ?? f.asOf, amount: p }))];
}

/** 05.4-24 (FIN-09): what a plan takes from this month: its day-0 flows and every payment dated before the first of next month. */
export function plainThisMonthPlan(f: RightAnswerFixture): Cents {
  const c = f.check.pay;
  if (c.mode !== 'plan') return 0n;
  const next = new Date(Date.UTC(Number(f.asOf.slice(0, 4)), Number(f.asOf.slice(5, 7)), 1)).toISOString().slice(0, 10);
  return planFlows(f, c).filter((x) => x.date < next).reduce((t, x) => t + x.amount, 0n);
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
// --- Low months (05.4 FIN-08 / ENG-07). Restated from QE-03, QE-04, QE-05 and QE-14 and the fix plan's FIN-08 line ("Savings are tried
// first as a bridge for low months. The question is only asked if savings can't carry it"). Not read from the engine.

/** One history month's pay as the case states it (pay.lean, then pay.lastThree for the last three months, else the usual pay). */
function statedPay(f: RightAnswerFixture, back: number): Cents {
  const ym = f.asOf.slice(0, 7);
  let m = ym;
  for (let i = 0; i < back; i++) m = monthBefore(m);
  const lean = f.pay.lean?.find((l) => l.month === m);
  if (lean !== undefined) return big(lean.amount);
  if (f.pay.lastThree !== null && back <= 3) return big(f.pay.lastThree[3 - back] as number);
  return big(f.pay.amount);
}

/**
 * QE-04: "Her records show 1 low month in the last 6: September, when $1,500 came in" ... "1 low month in the last 6 means about 2
 * over the 12 payments (12 / 6). Each one is $1,500 - $2,400 of bills and spending - $200 = -$1,100, so about 2 x $1,100 = $2,200 of
 * her $4,000 would come from savings." QE-05: "she needs $1,100 and has $500, and a usual month adds $600": savings are money
 * saved from earlier months ("Her everyday account holds only November's money") and money in a savings account; this month's room
 * is not. QE-14: savings that are her protected safety net make it "Dips into your safety net". QE-03: her yes is "Only on your
 * answer"; QE-05: her no is Not yet. A low month is a pay more than 5% under the set-up pay, in the last 6 months (the usual-month
 * window). Returns null when no low month falls short of the payment (the usual rules decide).
 */
export function plainLowMonths(f: RightAnswerFixture): Omit<PlainAnswer, 'afterBuy'> | null {
  const c = f.check.pay;
  if (c.mode !== 'plan' || c.every === 'fortnight' || f.pay.cadence !== 'monthly' || f.pay.irregular !== undefined) return null;
  const M = plainPlanMonthly(f);
  const setup = big(f.pay.setupAmount ?? f.pay.amount);
  const out = monthPay(f) - usualLeftOf(f);
  const window = Math.min(6, f.historyMonths);
  const lefts: Cents[] = [];
  for (let back = 1; back <= window; back++) {
    const p = statedPay(f, back);
    if ((setup - p) * 10_000n > BigInt(PAY_GAP_LINE_BP) * setup) lefts.push(p - out);
  }
  const short = lefts.filter((l) => l < M).length;
  if (short === 0) return null;
  const lowest = lefts.reduce((a, b) => (b < a ? b : a));
  const term = BigInt(c.months);
  const times = minC(term, maxC(1n, (BigInt(short) * term + BigInt(window) - 1n) / BigInt(window)));
  const shortfall = M - lowest;
  const between = maxC(0n, usualLeftOf(f) - M) * (term - times);
  const need = maxC(shortfall, shortfall * times - between);
  const net = plainNet(f);
  const kept = f.accounts.filter((a) => a.kind === 'savings' && (a.use === null || a.use === 'untouched')).reduce((s, a) => s + maxC(0n, big(a.balance)), 0n);
  const savings = freeMoney(f) - maxC(0n, leftThisMonth(f)) - big(c.deposit) + net.above + kept;
  if (savings >= need) return { code: 'fits_month', variant: 'low_month' };
  if (savings + net.lend >= need) return { code: 'fits_uses_net', variant: net.off ? 'protection_off' : null };
  const yes = f.check.yourAnswer ?? null;
  if (yes === null) return { code: 'needs_input', variant: null };
  return yes === 'yes' ? { code: 'fits_on_your_answer', variant: null } : { code: 'not_yet', variant: 'not_covered' };
}

const minC = (a: Cents, b: Cents): Cents => (a < b ? a : b);

function usualLeftOf(f: RightAnswerFixture): Cents {
  return monthPay(f) - big(f.usualMonth.bills) - usualEveryday(f) - savingAmount(f) - debtMinimums(f);
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
  if (!plainMonthlyShort(f)) return false; // 05.4-21: the monthly test includes FIN-06's short-month rule
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
  // 05.4-24 (BR-17): "This month ends at $500 - $500 = $0": the month pays what it has; the rest is spare money, named.
  const after = Number(leftThisMonth(f) - (s.total - s.rest));
  const net = plainNet(f);
  // D-68: "judged by cash like a one-off purchase", so the one-off tight rule (D-40) reads the whole cost.
  const tight = plainTightOnce(f, freeMoney(f) + net.above - s.total);
  return { code: s.rest === 0n ? 'fits_month' : 'fits_unspent', variant: fitVariant(net, s.rest > maxC(0n, s.earlier), carriesCostlyDebt(f, s.rest), tight), afterBuy: after };
}

// --- Borrowing costed and compared with saving (05.4-22, FIN-05 / ENG-08). Restated from D-07 ("When cash would fit but a loan or
// plan is chosen, add a caution if the APR is 20% or more, OR the total interest is 10% or more of the amount borrowed"), D-39a ("the
// answer is 'Fits, but borrowing costs more' with the total interest"), D-39c ("mortgages skip the 10%-of-amount interest test") and
// the approved cases BR-01 ("Cash says Not yet ... and the rate is far above 20%, so this is 'Fits only by borrowing', never a plain
// 'Fits'"), BR-02, BR-03, BR-04, BR-10, BR-15 and DB-09. A cheap plan stays as it is (BR-03; the 0% plans BR-07..BR-09, BR-11, BR-14).
// Not read from the engine.

/** One period after a date: a month (clamped to the month's last day), or 14 days for a plan paid every fortnight. */
function onePeriodAfter(f: RightAnswerFixture): string {
  const c = f.check.pay;
  if (c.mode === 'plan' && c.every === 'fortnight') return dayAfter(f.asOf, 14);
  const next = new Date(Date.UTC(Number(f.asOf.slice(0, 4)), Number(f.asOf.slice(5, 7)), 1)).toISOString().slice(0, 10);
  return next.slice(0, 8) + String(Math.min(Number(f.asOf.slice(8, 10)), Number(daysInMonthOf(next)))).padStart(2, '0');
}

/**
 * The amount borrowed and the interest on it. The amount borrowed is the price and one-off fees less the deposit (the plan's own
 * fee is paid on day one, not borrowed). The payments are the level-payment walk (planPayments), at the rate per period: a twelfth
 * of the yearly rate a month, a twenty-sixth a fortnight. Interest starts with the first period when the first payment is one
 * period away (BR-01: "Payments are £43.25 a month"); a first payment today, or on any other date, pays before any interest.
 */
export function plainBorrowed(f: RightAnswerFixture): { amount: Cents; interest: Cents } {
  const c = f.check.pay;
  if (c.mode !== 'plan') return { amount: 0n, interest: 0n };
  const raw = upFront(f) - big(c.deposit);
  const amount = maxC(0n, raw);
  const due = c.firstPaymentDate !== onePeriodAfter(f);
  const pays = planPayments(amount, c.months, c.apr, due, c.every === 'fortnight' ? 26n : 12n);
  return { amount, interest: pays.reduce((t, x) => t + x, 0n) - amount };
}

/** D-07 / D-39c: 20% a year or more, or (not for a home loan) interest of 10% or more of the amount borrowed. Nothing borrowed is not. */
export function plainExpensive(f: RightAnswerFixture): boolean {
  const c = f.check.pay;
  if (c.mode !== 'plan') return false;
  const { amount } = plainBorrowed(f); // the rounded interest is what the answer shows, not what the 10% line reads (D-138)
  if (amount <= 0n) return false;
  if (c.apr !== null && basisPoints(c.apr) >= big(EXPENSIVE_APR_BP)) return true;
  if (c.housing === true) return false;
  // D-138 (owner, 2026-11-05): "the 10% test reads the exact interest before rounding to the cent". With no rounding the level
  // payment is amount x bp x A^n / (B x (A^n - D^n)) (A = D + bp; B = A when the first payment is today, else D), so the interest
  // is at least 10% of the amount exactly when n x bp x A^n x 10,000 >= (10,000 + 1,000) x B x (A^n - D^n); the amount cancels.
  const bp = c.apr === null ? 0n : basisPoints(c.apr);
  if (bp === 0n) return false;
  const D = 10_000n * (c.every === 'fortnight' ? 26n : 12n);
  const n = BigInt(c.months);
  const An = (D + bp) ** n;
  const Dn = D ** n;
  const B = c.firstPaymentDate !== onePeriodAfter(f) ? D + bp : D;
  return n * bp * An * 10_000n >= (10_000n + big(EXPENSIVE_INTEREST_BP)) * B * (An - Dn);
}

/**
 * The borrowing rule on a plan's own answer: an expensive plan that fits is "Fits, but borrowing costs more" when paying the same
 * price once fits this month or from spare money, and "Only by borrowing" otherwise (including when paying once asks first). The
 * usual month already short keeps its own headline (D-63 / D-65, plainAnswer).
 */
function plainBorrowing(f: RightAnswerFixture, a: PlainAnswer): PlainAnswer {
  if ((a.code !== 'fits_month' && a.code !== 'fits_unspent') || !plainExpensive(f)) return a;
  const once: RightAnswerFixture = { ...f, check: { ...f.check, pay: { mode: 'once' } } };
  const cash = plainCode(once);
  const fits = cash.code === 'fits_month' || cash.code === 'fits_unspent' || (cash.code === 'not_yet' && plainShortWait(once));
  return { code: 'fits_by_borrowing', variant: fits ? 'borrowing_costs_more' : null, afterBuy: a.afterBuy };
}

/** D-80 (owner, 2026-11-04): "if the cash route is ready within 31 days of the check date", it counts as cash fitting. */
const SHORT_WAIT = 31;

/**
 * When paying at once (Not yet) is ready, restated from the ready-by rules the table states: the shortfall is the price less free
 * money and money above the net's size (OD-10: below $0 is that much more to make up); it is made up at the usual month's money
 * left, whole months from this month, at least the next month ("SN-12: £500 more at £80 a month = 7 months"). With nothing to make
 * up and the next pay clearing the dip for good, it is ready on that pay (BR-06: "ready on 1 December when his pay lands"); otherwise on the
 * next pay when it lands on or after the first of the ready month, else in that month. null: never (the usual month leaves nothing).
 */
export function plainCashReady(f: RightAnswerFixture): { date: string } | { month: string } | null {
  const cost = upFront(f);
  const short = cost - freeMoney(f) - plainNet(f).above;
  const pay = payDates(f).find((d) => d > f.asOf);
  // the next pay clears the dip for good: from that pay on, the 90-day path (with the money above the net's size) stays at or above $0
  const above = plainNet(f).above;
  const path = plainPath(f, cost);
  const clears = pay !== undefined && path.every((x) => x.date < pay || x.balance + above >= 0n);
  if (short <= 0n && clears) return { date: pay as string };
  const usual = usualLeftOf(f);
  if (usual <= 0n) return null;
  const n = short <= 0n ? 1n : maxC(1n, (short + usual - 1n) / usual);
  const month = plusMonths(`${f.asOf.slice(0, 7)}-01`, Number(n)).slice(0, 7);
  // a path that never goes below $0 waits for the money alone: the month. One that dips waits for the pay too (the later of them).
  const dips = path.some((x) => x.balance + above < 0n);
  return dips && pay !== undefined && pay >= `${month}-01` ? { date: pay } : { month };
}

/** D-80, restated: paying at once is ready within 31 days of the check date (a ready month counts by its last day). */
export function plainShortWait(f: RightAnswerFixture): boolean {
  const r = plainCashReady(f);
  if (r === null) return false;
  const day = 'date' in r ? r.date : `${r.month}-${String(daysInMonthOf(`${r.month}-01`)).padStart(2, '0')}`;
  return day <= dayAfter(f.asOf, SHORT_WAIT);
}

// --- Running costs, closing costs and the purchase date (05.4 BO-05, 05.4-26). Restated from RC-01..RC-09 and D-42. Not read from
// the engine.

/** RC-06: "Closing costs are 2.5% of $40,000 = $1,000, so the up-front amount is $41,000." A % of the price, rounded half up. */
export function plainClosing(f: RightAnswerFixture): Cents {
  const p = f.check.closingPercent;
  if (p == null || f.check.price === null) return 0n;
  return (2n * big(f.check.price) * milliPercent(p) + 100_000n) / 200_000n;
}

/** The running costs that count: RC-09 "A switched-off line is not counted". */
function liveRunning(f: RightAnswerFixture): NonNullable<RightAnswerFixture['check']['runningCosts']> {
  return (f.check.runningCosts ?? []).filter((r) => r.off !== true && r.amount > 0);
}

/**
 * What the running costs take from a usual month. RC-01: "$150 + $120 + $30 + $23 (the monthly share of $276 a year) = $323 a
 * month"; RC-04: "The yearly $600 counts as $50 a month in the usual month"; RC-03: "From then on the usual month is $1,000 - $100"
 * (a cost that starts later still counts); RC-05: "the usual month while it runs is $1,000 - $60" (one ended before this month does
 * not). Each line's amount over its months, rounded half up.
 */
export function runningShare(f: RightAnswerFixture): Cents {
  const first = `${f.asOf.slice(0, 7)}-01`;
  return liveRunning(f)
    .filter((r) => r.end === null || r.end >= first)
    .reduce((t, r) => t + (2n * big(r.amount) + BigInt(r.everyMonths)) / (2n * BigInt(r.everyMonths)), 0n);
}

/**
 * The running costs on the day-by-day path, each on its own dates. RC-03: "On the 90-day path (to 13 February) only one $100
 * payment falls, on 1 February"; RC-04: "On the cash path the full $600 falls on 15 January"; RC-05: "After 28 February it is never
 * counted again". From the start date every 1, 3 or 12 months (the day kept or cut to the month's last day), never before today.
 */
export function runningDates(f: RightAnswerFixture): { date: string; amount: Cents }[] {
  const endDay = dayAfter(f.asOf, PATH_DAYS);
  const out: { date: string; amount: Cents }[] = [];
  for (const r of liveRunning(f)) {
    for (let n = 0; ; n++) {
      const d = plusMonths(r.start, r.everyMonths * n);
      if (d >= endDay || (r.end !== null && d > r.end)) break;
      if (d >= f.asOf) out.push({ date: d, amount: big(r.amount) });
    }
  }
  return out;
}

/** D-42: "It is bought on 15 January 2027"; no date, or one before today, is today. */
export function buyDay(f: RightAnswerFixture): string {
  const d = f.check.purchaseDate;
  return d != null && d > f.asOf ? d : f.asOf;
}

/**
 * RC-08: "The $1,500 is paid on 15 January, so it is judged on that date. By then she has her $1,000 now plus December's $1,000 =
 * $2,000 before January's pay": the usual leftover of each whole month between this month and the month it is bought (never below 0).
 */
export function laterMoney(f: RightAnswerFixture): Cents {
  const n = monthsBetween(f.asOf.slice(0, 7), buyDay(f).slice(0, 7)) - 1;
  const usual = usualLeftOf(f);
  return n > 0 && usual > 0n ? usual * BigInt(n) : 0n;
}

/** RC-08: bought in a later month, this month's figure loses nothing to it ("The month figure for a later date"). */
function laterFigure(f: RightAnswerFixture, a: PlainAnswer): PlainAnswer {
  if (buyDay(f).slice(0, 7) === f.asOf.slice(0, 7) || a.code === 'needs_input') return a;
  const left = leftThisMonth(f);
  const figure = recordsFresh(f) ? big(f.pay.amount) - big(f.usualMonth.bills) - usualEveryday(f) - savingAmount(f) - debtMinimums(f) - carriedIn(f) : left + (f.pay.irregular === undefined ? payToArrive(f) : 0n);
  return { ...a, afterBuy: Number(figure) };
}

/**
 * The usual month with the running costs (RC-01: "His usual month goes from $250 to $250 - $323 = -$73, so it is 'Short each month'
 * even though the cash for the car is there"; RC-02: "$323 is 85% of his $380 room, more than 80% ... So it is 'Fits, but tight each
 * month'"). A cash fit stays a fit only when the usual month carries the running costs; the owner's tight rule (more than 80% of the
 * room, or under the floor) reads them as the payment. Not yet stays Not yet (it is stricter).
 */
function withRunning(f: RightAnswerFixture, a: PlainAnswer): PlainAnswer {
  const share = runningShare(f);
  if (share === 0n || a.code === 'needs_input' || a.code === 'not_yet') return a;
  // 05.4-27 (SO-05: "From January the usual month is $1,000 + $80 - $50 - $60"): what stops comes back to a usual month that is not
  // already short.
  const raw = usualLeftOf(f);
  const room = raw >= 0n ? raw + plainFreed(f) : raw;
  if (room <= 0n || room - share < 0n) return { code: 'monthly_short', variant: null, afterBuy: a.afterBuy };
  const tight = share * 10_000n > room * BigInt(TIGHT_SHARE_BP) || room - share < plainFloor(f);
  return tight && (a.code === 'fits_month' || a.code === 'fits_unspent') ? { ...a, variant: 'tight' } : a;
}

/** RC-01..RC-09: what a usual month leaves once the running costs start; null with no running-cost lines (paid once). */
export function plainUsualAfter(f: RightAnswerFixture): number | null {
  if ((f.check.runningCosts ?? []).length === 0) return null;
  return Number(usualLeftOf(f) - runningShare(f));
}

/** Named so the table's thresholds have one reader (05.4-21 reads them in plainFloor and plainTightPlan). */
export const RULE_NAMES = { TIGHT_SHARE_BP, FLOOR_DIVISOR };

// --- What a purchase replaces (05.4-27, BO-05 part B). Restated from SO-01..SO-06, CONTEXT D-101..D-105 and the rules the owner
// accepted on 2026-11-04. Not read from the engine. Paid once only: plans stay out of the whole-answer comparison (PLAIN-PLANS).

type PlainStop = NonNullable<RightAnswerFixture['check']['replaces']>['stops'][number];

/** The stops that can count: a real stop date, an amount above 0 and every 1, 3 or 12 months. */
function stopsOf(f: RightAnswerFixture): PlainStop[] {
  return (f.check.replaces?.stops ?? []).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.stopDate) && s.amount > 0 && [1, 3, 12].includes(s.everyMonths));
}

/** "Money that arrives later does not help today's cash path" (SO-02); a sale dated before today is not counted (D-105). */
function saleOf(f: RightAnswerFixture): NonNullable<NonNullable<RightAnswerFixture['check']['replaces']>['sale']> | null {
  const s = f.check.replaces?.sale ?? null;
  return s !== null && s.amount > 0 && s.arrives >= f.asOf ? s : null;
}

interface PlainSale { toAccount: Cents; debtId: string | null; left: Cents; ended: { date: string; amount: Cents }[] }

/**
 * SO-03: "The sale clears the $4,000 loan, so its $250 minimum stops after 20 November ... The other $1,000 of the sale goes to his
 * account." SO-04: "The sale pays $5,000 of the $7,000, so $2,000 is still owed and the $250 minimum keeps coming" (D-102), until
 * what is left is paid (D-73). What the debt's minimums paid before the sale comes off what is owed first.
 */
function plainSale(f: RightAnswerFixture): PlainSale | null {
  const s = saleOf(f);
  if (s === null) return null;
  const d = s.paysDebtId === null ? undefined : f.debts.find((x) => x.id === s.paysDebtId);
  if (d === undefined) return { toAccount: big(s.amount), debtId: null, left: 0n, ended: [] };
  const dues = ownDebts(f).includes(d) ? datesOfDebt(f, d) : [];
  let owed = maxC(0n, big(d.balance));
  for (const p of dues) if (p.date < s.arrives) owed -= p.amount < owed ? p.amount : owed;
  const toDebt = big(s.amount) < owed ? big(s.amount) : owed;
  let left = owed - toDebt;
  const ended: { date: string; amount: Cents }[] = [];
  for (const p of dues) {
    if (p.date < s.arrives) continue;
    const kept = p.amount < left ? p.amount : left;
    left -= kept;
    if (p.amount - kept > 0n) ended.push({ date: p.date, amount: p.amount - kept });
  }
  return { toAccount: big(s.amount) - toDebt, debtId: d.id, left: owed - toDebt, ended };
}

/** The debts after the sale: one paid off is gone; one paid in part owes the rest. */
function debtsAfterSale(f: RightAnswerFixture): RightAnswerFixture['debts'] {
  const s = plainSale(f);
  if (s === null || s.debtId === null) return f.debts;
  return f.debts.flatMap((d) => (d.id !== s.debtId ? [d] : s.left === 0n ? [] : [{ ...d, balance: Number(s.left) }]));
}

/** SO-01: the sale's account part that arrives by the purchase date, as far as the cost needs it. */
/**
 * D-137 (owner, 2026-11-05): "when a purchase date is more than 90 days ahead and is held to day 90, a sale counts toward it only if
 * the sale arrives on or before day 90." The last day a sale can arrive and still count: the purchase date, or day 90 (asOf + 89, the
 * path's last day) when the purchase is later.
 */
export function saleCutoff(f: RightAnswerFixture): string {
  const day90 = dayAfter(f.asOf, PATH_DAYS - 1);
  return buyDay(f) > day90 ? day90 : buyDay(f);
}

export function saleNow(f: RightAnswerFixture, cost: Cents): Cents {
  const s = saleOf(f);
  const p = plainSale(f);
  if (s === null || p === null || s.arrives > saleCutoff(f)) return 0n;
  return p.toAccount < cost ? p.toAccount : cost;
}

/** The last day of 'YYYY-MM'. */
function lastDayOf(ym: string): string {
  return `${ym}-${String(daysInMonthOf(`${ym}-01`)).padStart(2, '0')}`;
}

/**
 * What a purchase replaces on the day-by-day path, as money coming back (negative amounts: the path takes each flow away).
 * - The sale's account part on its date (SO-02), less what lowered the day-one cost (SO-01: the part above the cost arrives on the day).
 * - The minimums the sale ends (SO-03).
 * - SO-05: "The old $80 is due on 1 December, before the 20 December stop, so it is counted once more and then never again": each due
 *   of a stopped bill after its stop date comes back on that due date (a yearly or every-3-month bill lands on its due dates here).
 * - SO-06 / D-103: "After 30 November the gym is never counted again": an everyday stop's share (its amount over its months, half up,
 *   never more than the usual everyday spending) comes back at the end of each month that starts after its stop date; never this month.
 */
export function replacesDates(f: RightAnswerFixture): { date: string; amount: Cents }[] {
  const out: { date: string; amount: Cents }[] = [];
  const end = dayAfter(f.asOf, PATH_DAYS);
  const s = saleOf(f);
  const p = plainSale(f);
  if (s !== null && p !== null) {
    const before = s.arrives <= saleCutoff(f);
    const used = before ? (p.toAccount < upFrontAll(f) ? p.toAccount : upFrontAll(f)) : 0n;
    const lands = p.toAccount - used;
    if (lands > 0n && s.arrives < end) out.push({ date: s.arrives, amount: -lands });
    for (const e of p.ended) out.push({ date: e.date, amount: -e.amount });
  }
  const ym = f.asOf.slice(0, 7);
  for (const st of stopsOf(f)) {
    if (st.source !== 'bill') continue;
    const b = longBills(f).find((x) => x.id === st.id);
    if (b === undefined) continue;
    for (let n = 0; ; n++) {
      const d = plusMonths(b.nextDue, b.everyMonths * n);
      if (d >= end) break;
      if (d >= f.asOf && d > st.stopDate) out.push({ date: d, amount: -big(b.amount) });
    }
  }
  let room = usualEveryday(f);
  for (const st of stopsOf(f)) {
    if (st.source !== 'everyday') continue;
    const want = (2n * big(st.amount) + BigInt(st.everyMonths)) / (2n * BigInt(st.everyMonths));
    const share = want < room ? want : maxC(0n, room);
    room -= share;
    if (share === 0n) continue;
    const after = monthAfter(st.stopDate.slice(0, 7));
    for (let m = after > ym ? after : monthAfter(ym); lastDayOf(m) < end; m = monthAfter(m)) out.push({ date: lastDayOf(m), amount: -share });
  }
  return out;
}

/** The whole up-front cost of a one-off (price, tax, fees and closing costs), before any sale. */
function upFrontAll(f: RightAnswerFixture): Cents {
  return upFront(f) + plainClosing(f);
}

/** The month after 'YYYY-MM'. */
function monthAfter(ym: string): string {
  const t = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7));
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

/**
 * What a usual month gets back after buying: a stopped monthly bill its amount, a yearly bill only the share the usual month counted
 * (D-104: "The usual month gets back only what it was counting"), an everyday stop its share (SO-06: "$1,000 + $50 = $1,050"), and a
 * debt the sale pays off its minimum (SO-03: "$1,000 + $250 (old minimum gone)").
 */
export function plainFreed(f: RightAnswerFixture): Cents {
  let sum = 0n;
  const seen = new Set<string>();
  for (const st of stopsOf(f)) {
    if (st.source !== 'bill' || seen.has(st.id)) continue;
    const b = f.bills.find((x) => x.id === st.id && x.paidBy === 'me');
    if (b === undefined) continue;
    seen.add(st.id);
    sum += b.everyMonths === 1 ? big(b.amount) : ownShare(b);
  }
  let room = usualEveryday(f);
  for (const st of stopsOf(f)) {
    if (st.source !== 'everyday') continue;
    const want = (2n * big(st.amount) + BigInt(st.everyMonths)) / (2n * BigInt(st.everyMonths));
    const share = want < room ? want : maxC(0n, room);
    room -= share;
    sum += share;
  }
  const p = plainSale(f);
  if (p !== null && p.debtId !== null && p.left === 0n) {
    const d = f.debts.find((x) => x.id === p.debtId) as PlainDebt;
    sum += maxC(0n, big(d.minimum));
  }
  return sum;
}
