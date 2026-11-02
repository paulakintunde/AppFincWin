/**
 * Right-answer table contract (05.4-05, QA-02). Test-only. Money is integer minor units, dates are 'YYYY-MM-DD'.
 * One JSON file per topic holds the cases; the same JSON feeds the engine tests and the owner review pages.
 */
export const TOPICS = ['safety-net','overdraft','debts','borrowing','tax','running-costs','selling-the-old-one','quick-estimates','household'] as const;
export type Topic = typeof TOPICS[number];
export type CaseStatus = 'draft' | 'approved' | 'to_do' | 'disputed';
export interface FixtureAccount { id: string; kind: 'checking'|'current'|'savings'|'card'; name: string; balance: number; overdraftLimit: number|null; overdraftRate: string|null; use: 'everyday'|'emergency'|'untouched'|null }
export interface FixtureBill { id: string; amount: number; everyMonths: 1|3|12; nextDue: string; lastPaid: string|null; paidBy: 'me'|'other' }
export interface FixtureDebt { id: string; kind: 'loan'|'card'|'other'; balance: number; minimum: number; apr: string|null; dueDay: number|null; joint: boolean }
export interface FixtureRunningCost { id: string; amount: number; everyMonths: 1|3|12; start: string; end: string|null }
export interface FixtureCheck {
  price: number|null; taxPercent: string|null; taxIncluded: boolean|null; oneOffFees: number;
  pay: { mode: 'once' } | { mode: 'plan'; months: number; apr: string|null; fees: number; deposit: number; firstPaymentDate: string };
  runningCosts?: FixtureRunningCost[]; closingPercent?: string|null; purchaseDate?: string|null;
  replaces?: { stops: { id: string; amount: number; everyMonths: 1|3|12; stopDate: string; source: 'bill'|'everyday' }[]; sale: { amount: number; arrives: string; paysDebtId: string|null } | null } | null;
  saveForIt?: boolean; yourAnswer?: 'yes'|'no'|null;
}
export interface RightAnswerFixture {
  asOf: string; currency: 'USD'|'CAD'|'GBP'|'EUR'; region: { country: string; subdivision: string|null } | null;
  pay: { amount: number; cadence: 'monthly'|'fortnightly'|'weekly'; nextDate: string; setupAmount: number|null; lastThree: [number,number,number]|null };
  usualMonth: { bills: number; everyday: number; essentialEveryday: number };
  thisMonth: { received: number; billsPaid: number; billsDue: number; everydaySoFar: number };
  historyMonths: number; quickEstimates: { income: number; bills: number; everyday: number } | null; recordsAsOf: string|null;
  accounts: FixtureAccount[]; safetyNet: { protect: boolean; size: number|null; saved: number } | null;
  bills: FixtureBill[]; debts: FixtureDebt[]; userLine: number|null; factLines: boolean;
  check: FixtureCheck;
}
export interface Expected { code: string; variant: string|null; afterBuy: { month: number|null; usualMonth: number|null }; readyBy: string|null; mustHaveReasons: string[]; mustHaveFacts: string[]; mustNotHaveFacts: string[] }
export interface RightAnswerCase { id: string; topic: Topic; persona: string; situation: string; fixture: RightAnswerFixture; expected: Expected; why: string; fixIds: string[]; status: CaseStatus; approvedAt: string|null; ownerReason: string|null; expertNote: string|null; changeApproved?: string|null }

export const ID_PREFIX: Readonly<Record<Topic, string>> = {
  'safety-net': 'SN', overdraft: 'OD', debts: 'DB', borrowing: 'BR', tax: 'TX', 'running-costs': 'RC',
  'selling-the-old-one': 'SO', 'quick-estimates': 'QE', household: 'HH',
};
const STATUSES: readonly string[] = ['draft', 'approved', 'to_do', 'disputed'];
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
  const fx = k.fixture;
  if (!fx || typeof fx !== 'object') {
    errs.push(`${id}: fixture is required`);
  } else {
    if (!isDate(fx.asOf)) errs.push(`${id}: fixture.asOf is not a date`);
    if (fx.pay && !isDate(fx.pay.nextDate)) errs.push(`${id}: fixture.pay.nextDate is not a date`);
    moneyErrors(`${id}.fixture`, { ...fx, region: null, asOf: null }, errs);
    const price = fx.check?.price;
    if (typeof price === 'number' && price < 0) errs.push(`${id}: price cannot be negative`);
    const pay = fx.check?.pay;
    if (pay && pay.mode === 'plan' && !isDate(pay.firstPaymentDate)) errs.push(`${id}: first payment date is not a date`);
  }
  const ex = k.expected;
  if (!ex || typeof ex.code !== 'string') errs.push(`${id}: expected.code is required`);
  else {
    for (const f of ['mustHaveReasons', 'mustHaveFacts', 'mustNotHaveFacts'] as const) {
      if (!Array.isArray(ex[f])) errs.push(`${id}: expected.${f} must be a list`);
    }
    if (ex.readyBy !== null && ex.readyBy !== undefined && typeof ex.readyBy !== 'string') errs.push(`${id}: expected.readyBy must be text or null`);
  }
  return errs;
}
