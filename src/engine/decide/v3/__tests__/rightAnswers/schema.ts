/**
 * Right-answer table contract (05.4-05, QA-02). Test-only. Money is integer minor units, dates are 'YYYY-MM-DD'.
 * One JSON file per topic holds the cases; the same JSON feeds the engine tests and the owner review pages.
 */
export const TOPICS = ['safety-net','overdraft','debts','borrowing','tax','running-costs','selling-the-old-one','quick-estimates','household'] as const;
export type Topic = typeof TOPICS[number];
export type CaseStatus = 'draft' | 'approved' | 'to_do' | 'disputed';
export interface FixtureAccount { id: string; kind: 'checking'|'current'|'savings'|'card'; name: string; balance: number; overdraftLimit: number|null; overdraftRate: string|null; use: 'everyday'|'emergency'|'untouched'|null }
export interface FixtureBill { id: string; amount: number; everyMonths: 1|3|12; nextDue: string; lastPaid: string|null; paidBy: 'me'|'other';
  /** D-70: a yearly or every-3-month bill the usual month already sets aside at amount / everyMonths a month (inside usualMonth.bills, never in thisMonth's figures); absent = false (left out of the usual month, as RC-10) */ inUsualMonth?: boolean }
export interface FixtureDebt { id: string; kind: 'loan'|'card'|'other'; balance: number; minimum: number; apr: string|null; dueDay: number|null; joint: boolean; /** a mortgage or other housing debt (D-08 housing fact); absent = false */ housing?: boolean; /** already paid toward this month's minimum (DB-10); absent = 0 */ paidThisMonth?: number }
export interface FixtureRunningCost { id: string; amount: number; everyMonths: 1|3|12; start: string; end: string|null; /** switched off by the user (FIN-28); absent = on */ off?: boolean }
export interface FixtureCheck {
  price: number|null; taxPercent: string|null; taxIncluded: boolean|null; oneOffFees: number;
  pay: { mode: 'once' } | { mode: 'plan'; /** the number of payments */ months: number; apr: string|null; fees: number; deposit: number; firstPaymentDate: string; /** how often a payment falls; absent = month */ every?: 'month'|'fortnight'; /** a 0% deal that back-charges interest if not paid in full; absent = false */ deferredInterest?: boolean; /** a mortgage or other home loan: skips the 10%-of-amount interest test, still costed (D-39c); absent = false */ housing?: boolean };
  runningCosts?: FixtureRunningCost[]; closingPercent?: string|null; purchaseDate?: string|null;
  replaces?: { stops: { id: string; amount: number; everyMonths: 1|3|12; stopDate: string; source: 'bill'|'everyday' }[]; sale: { amount: number; arrives: string; paysDebtId: string|null } | null } | null;
  saveForIt?: boolean; yourAnswer?: 'yes'|'no'|null;
  /** the check's existing `purpose` preset; necessity and for_work read as a need, nice_to_have/treat/luxury as a want (D-41: words and order only) */
  purpose?: 'invest_in_me'|'for_work'|'necessity'|'nice_to_have'|'treat'|'luxury'|null;
}
export interface RightAnswerFixture {
  asOf: string; currency: 'USD'|'CAD'|'GBP'|'EUR'; region: { country: string; subdivision: string|null } | null;
  pay: { amount: number; cadence: 'monthly'|'fortnightly'|'weekly'; nextDate: string; setupAmount: number|null; lastThree: [number,number,number]|null; /** low months stated explicitly ('YYYY-MM', pay that month); absent = none beyond lastThree */ lean?: { month: string; amount: number }[];
    /** D-52: no pay is scheduled (freelance); amounts = full-month income oldest first, one per history month, paid on `day`; absent = scheduled pay */ irregular?: { amounts: number[]; day: number } };
  usualMonth: { bills: number; everyday: number; essentialEveryday: number;
    /** D-58: a regular monthly transfer from the everyday account to savings; absent = none. movedThisMonth: this month's transfer is logged (on its day, on or before asOf) */ saving?: { amount: number; day: number; movedThisMonth: boolean } };
  thisMonth: { received: number; billsPaid: number; billsDue: number; everydaySoFar: number };
  historyMonths: number; quickEstimates: { income: number; bills: number; everyday: number } | null; recordsAsOf: string|null;
  accounts: FixtureAccount[]; safetyNet: { protect: boolean; size: number|null; saved: number; /** D-61: absent = locked (the net up to its size is left out of the answer) */ locked?: boolean } | null;
  bills: FixtureBill[]; debts: FixtureDebt[]; userLine: number|null; factLines: boolean;
  check: FixtureCheck;
}
export interface Expected { code: string; variant: string|null; afterBuy: { month: number|null; usualMonth: number|null }; readyBy: string|null; mustHaveReasons: string[]; mustHaveFacts: string[]; mustNotHaveFacts: string[] }
export interface RightAnswerCase { id: string; topic: Topic; persona: string; situation: string; fixture: RightAnswerFixture; expected: Expected; why: string; fixIds: string[]; status: CaseStatus; approvedAt: string|null; ownerReason: string|null; expertNote: string|null; changeApproved?: string|null;
  /** round 1b: an "Owner check" note the review page shows, for a pending change the owner sees before it is applied; absent = none */
  reviewNote?: string|null;
  /** round 1b: a note for the rule planner, shown on the review page; absent = none */
  plannerNote?: string|null }

export const ID_PREFIX: Readonly<Record<Topic, string>> = {
  'safety-net': 'SN', overdraft: 'OD', debts: 'DB', borrowing: 'BR', tax: 'TX', 'running-costs': 'RC',
  'selling-the-old-one': 'SO', 'quick-estimates': 'QE', household: 'HH',
};
const STATUSES: readonly string[] = ['draft', 'approved', 'to_do', 'disputed'];
/** Answer codes a case may expect (no new codes in 05.4; the shadow-run CHECK in migration 20261103000500 holds the same list). */
export const CODES = ['needs_input', 'not_yet', 'monthly_short', 'emergency_use', 'fits_unspent', 'fits_month', 'fits_uses_net', 'fits_uses_overdraft', 'fits_by_borrowing', 'fits_on_your_answer'] as const;
/**
 * Variants a case may expect. Round 1 (D-35..D-41) adds: not_cleared (overdraft not cleared by the next pay), no_net and
 * small_net (nothing saved / net below its size), costly_debt (earlier savings spent while 20%+ APR debt remains) and
 * borrowing_costs_more (cash fits but a plan is chosen). tight now also applies to one-off answers. Keep in step with the
 * migration's variant CHECK.
 */
export const VARIANTS = ['payday', 'not_covered', 'low_month', 'tight', 'protection_off', 'not_cleared', 'no_net', 'small_net', 'costly_debt', 'borrowing_costs_more', 'extra_savings', 'month_already_short', 'month_short_small', 'month_short_moderate', 'month_short_moderate_extra'] as const; // extra_savings: 05.4 D-62; month_already_short: 05.4 D-63 (both in the CHECK widened by migration 20261103000900); month_short_*: 05.4 D-65 (migration 20261103001000)
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const COUNT_KEYS = ['everyMonths', 'months', 'historyMonths', 'dueDay'];

function isDate(v: unknown): boolean {
  if (typeof v !== 'string' || !DATE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Every number in the fixture must be an integer (minor units); counts are skipped by key. */
function moneyErrors(path: string, v: unknown, out: string[]): void {
  if (typeof v === 'number') {
    if (!Number.isInteger(v)) out.push(`${path}: money must be a whole number of minor units`);
    return;
  }
  if (Array.isArray(v)) v.forEach((x, i) => moneyErrors(`${path}[${i}]`, x, out));
  else if (v !== null && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (!COUNT_KEYS.includes(k)) moneyErrors(`${path}.${k}`, x, out);
    }
  }
}

/** [] when valid; else readable errors. */
export function validateCase(c: unknown): string[] {
  const errs: string[] = [];
  if (c === null || typeof c !== 'object') return ['case must be an object'];
  const k = c as Partial<RightAnswerCase>;
  const id = typeof k.id === 'string' ? k.id : '?';
  if (typeof k.id !== 'string' || !/^[A-Z]{2}-\d{2,}$/.test(k.id)) errs.push(`${id}: id must look like SN-01`);
  if (!TOPICS.includes(k.topic as Topic)) errs.push(`${id}: unknown topic "${String(k.topic)}"`);
  else if (typeof k.id === 'string' && !k.id.startsWith(`${ID_PREFIX[k.topic as Topic]}-`)) {
    errs.push(`${id}: id prefix must be ${ID_PREFIX[k.topic as Topic]} for topic ${String(k.topic)}`);
  }
  if (!STATUSES.includes(String(k.status))) errs.push(`${id}: bad status "${String(k.status)}"`);
  if (k.status === 'approved' && !k.approvedAt) errs.push(`${id}: approved case needs approvedAt`);
  if (k.approvedAt && !isDate(k.approvedAt)) errs.push(`${id}: approvedAt is not a date`);
  for (const f of ['persona', 'situation', 'why'] as const) {
    if (typeof k[f] !== 'string' || (k[f] as string).length === 0) errs.push(`${id}: ${f} is required`);
  }
  if (!Array.isArray(k.fixIds)) errs.push(`${id}: fixIds must be a list`);
  for (const f of ['reviewNote', 'plannerNote'] as const) {
    const v = k[f];
    if (v !== undefined && v !== null && (typeof v !== 'string' || v.length === 0)) errs.push(`${id}: ${f} must be text or null`);
  }
  const fx = k.fixture;
  if (!fx || typeof fx !== 'object') {
    errs.push(`${id}: fixture is required`);
  } else {
    if (!isDate(fx.asOf)) errs.push(`${id}: fixture.asOf is not a date`);
    if (fx.pay && !isDate(fx.pay.nextDate)) errs.push(`${id}: fixture.pay.nextDate is not a date`);
    const irr = fx.pay?.irregular;
    if (irr !== undefined) {
      if (!Array.isArray(irr.amounts) || irr.amounts.length !== fx.historyMonths) errs.push(`${id}: pay.irregular.amounts needs one amount per history month`);
      if (!Number.isInteger(irr.day) || irr.day < 1 || irr.day > 31) errs.push(`${id}: pay.irregular.day must be 1 to 31`);
    }
    const sv = fx.usualMonth?.saving;
    if (sv !== undefined) {
      if (!Number.isInteger(sv.amount) || sv.amount <= 0) errs.push(`${id}: usualMonth.saving.amount must be a whole number above 0`);
      if (!Number.isInteger(sv.day) || sv.day < 1 || sv.day > 28) errs.push(`${id}: usualMonth.saving.day must be 1 to 28`);
      if (typeof sv.movedThisMonth !== 'boolean') errs.push(`${id}: usualMonth.saving.movedThisMonth must be true or false`);
      else if (sv.movedThisMonth && isDate(fx.asOf) && sv.day > Number(fx.asOf.slice(8, 10))) errs.push(`${id}: usualMonth.saving cannot be moved this month before its day`);
    }
    const lk = fx.safetyNet?.locked;
    if (lk !== undefined && typeof lk !== 'boolean') errs.push(`${id}: safetyNet.locked must be true or false`);
    moneyErrors(`${id}.fixture`, { ...fx, region: null, asOf: null }, errs);
    const price = fx.check?.price;
    if (typeof price === 'number' && price < 0) errs.push(`${id}: price cannot be negative`);
    const pay = fx.check?.pay;
    if (pay && pay.mode === 'plan' && !isDate(pay.firstPaymentDate)) errs.push(`${id}: first payment date is not a date`);
  }
  const ex = k.expected;
  if (!ex || typeof ex.code !== 'string') errs.push(`${id}: expected.code is required`);
  else {
    if (!(CODES as readonly string[]).includes(ex.code)) errs.push(`${id}: unknown answer code "${ex.code}"`);
    if (ex.variant !== null && !(VARIANTS as readonly string[]).includes(String(ex.variant))) errs.push(`${id}: unknown variant "${String(ex.variant)}"`);
    for (const f of ['mustHaveReasons', 'mustHaveFacts', 'mustNotHaveFacts'] as const) {
      if (!Array.isArray(ex[f])) errs.push(`${id}: expected.${f} must be a list`);
    }
    if (ex.readyBy !== null && ex.readyBy !== undefined && typeof ex.readyBy !== 'string') errs.push(`${id}: expected.readyBy must be text or null`);
  }
  return errs;
}
