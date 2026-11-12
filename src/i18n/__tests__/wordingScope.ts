/**
 * 05.4-41 (D-15, D-150..D-153): what the wording review page covers, what a later sign-off locks, and the shared pieces the
 * page writer (wordingPage.write.test.ts) and the always-on guard (wordingSignoff.test.ts) both read. Test helper only.
 *
 * - LOCKED_ROOTS: the groups a sign-off locks (Decide's answer wording and the lines and sheets around it).
 * - OTHER_KEYS (D-151): the 48 lines plan 05.4-06 added on shipped screens. Reviewed on the page, never locked.
 * - DECISION_MAP: every string written from an owner decision, with the decision and the owner's words, for the page's first
 *   section. A key missing from en.ts fails the guard.
 * - SAMPLE_VALUES: one example per {{placeholder}}, so every string on the page also reads as a filled sentence. A placeholder
 *   with no sample fails the guard.
 * - The sign-off itself happens before Grow starts (D-150). Until then decideWordingSignoff.json is all null and the signed copy
 *   (decideWordingSigned.json, D-153) does not exist; signRecord() builds both for that day.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type Leaves = Record<string, string>;

export const LOCKED_ROOTS = ['decide.v3', 'legal.decideAnswer', 'legal.decideAbout', 'legal.decideIntro'] as const;

/** The undo actions plan 05.4-06 added (each has a named and an unnamed label). */
const UNDO_ACTIONS = [
  'payArrivalSaved',
  'expectedIncomeSaved',
  'incomePatternSaved',
  'payUpdated',
  'keptYourFigure',
  'planSaved',
  'notBuyingSaved',
  'paidByOther',
  'alwaysPaidByOther',
  'didNotHappen',
  'noPayThisMonth',
  'incomeElsewhere',
  'nothingToAdd',
  'monthComplete',
  'decideStartMonth',
  'readinessAnswerCleared',
  'ownOptionAdded',
  'ownOptionRenamed',
  'ownOptionRemoved',
] as const;

export const OTHER_KEYS: readonly string[] = [
  ...UNDO_ACTIONS.map((a) => `undo.label.${a}`),
  ...UNDO_ACTIONS.map((a) => `undo.labelUnnamed.${a}`),
  'history.confirmTitle_one',
  'history.confirmTitle_other',
  'history.confirmBody',
  'history.confirmAction_one',
  'history.confirmAction_other',
  'history.keep',
  'history.blocked',
  'history.undoing',
  'sync.checkCopyNotSaved',
  'sync.failedSheet.reason.copyNotSaved',
];

/** Every leaf string under `node`, keyed by its dotted path. */
export function leaves(node: unknown, prefix: string, out: Leaves = {}): Leaves {
  if (typeof node === 'string') {
    out[prefix] = node;
  } else if (node !== null && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) leaves(v, prefix === '' ? k : `${prefix}.${k}`, out);
  }
  return out;
}

/** The node at a dotted path, or undefined. */
export function nodeAt(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const k of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

/** The strings a sign-off locks, sorted by key. */
export function lockedLeaves(en: unknown): Leaves {
  const all: Leaves = {};
  for (const root of LOCKED_ROOTS) leaves(nodeAt(en, root), root, all);
  const sorted: Leaves = {};
  for (const k of Object.keys(all).sort()) sorted[k] = all[k] as string;
  return sorted;
}

/** sha256 of the locked strings as sorted [key, text] pairs (64 hex characters). */
export function hashOf(locked: Leaves): string {
  const pairs = Object.keys(locked)
    .sort()
    .map((k) => [k, locked[k]]);
  return createHash('sha256').update(JSON.stringify(pairs)).digest('hex');
}

export const lockedHash = (en: unknown): string => hashOf(lockedLeaves(en));

export interface SignoffRecord {
  readonly signedAt: string | null;
  readonly by: string | null;
  readonly hash: string | null;
}

export const SIGNOFF_PATH = join(__dirname, '..', 'decideWordingSignoff.json');
/** D-153: the signed copy. Written only on the day the owner signs. */
export const SIGNED_COPY_PATH = join(__dirname, '..', 'decideWordingSigned.json');

export function readSignoff(): SignoffRecord {
  return JSON.parse(readFileSync(SIGNOFF_PATH, 'utf8')) as SignoffRecord;
}

/** The signed copy, or null while nothing is signed (D-153). */
export function readSigned(): Leaves | null {
  return existsSync(SIGNED_COPY_PATH) ? (JSON.parse(readFileSync(SIGNED_COPY_PATH, 'utf8')) as Leaves) : null;
}

/** What the sign-off writes: the record and the signed copy. Nothing calls this until the owner signs (D-150). */
export function signRecord(en: unknown, today: string): { readonly signoff: SignoffRecord; readonly signed: Leaves } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new RangeError(`signRecord: ${today} is not a YYYY-MM-DD date`);
  const signed = lockedLeaves(en);
  return { signoff: { signedAt: today, by: 'owner', hash: hashOf(signed) }, signed };
}

/** Keys whose text differs between two copies: changed, added or removed. */
export function changedKeys(signed: Leaves, now: Leaves): string[] {
  const keys = new Set([...Object.keys(signed), ...Object.keys(now)]);
  return [...keys].filter((k) => signed[k] !== now[k]).sort();
}

export interface Decision {
  readonly id: string;
  readonly words: string;
}

const d = (id: string, words: string): Decision => ({ id, words });
const NET = d('D-35', 'Mention that building a 1 month protection is a start; caution that it is risky not to have a safety net.');
const OD_PAST = d('D-36', 'Below $0 and the next pay does not clear it: a strong warning.');
const BORROW = d('D-48', 'Every borrowing answer shows the interest as a cost, that a safety net covers surprises, and that more income or lower costs makes repaying easier.');
const TIGHT = d('D-40', '"Tight" also applies to one-off purchases: money left under a tenth of a usual month.');
const ASK_DEBTS = d('D-43', 'Ask about loans, overdraft and other debts when they are not recorded (ask, do not block).');
const EARLIER = d('D-44', 'An answer that relies on money from earlier months states where it went.');
const RUNWAY = d('D-46', 'State how many payments savings cover, and how a further shortfall shortens that.');
const DEPLETION = d('D-54', 'Factual depletion lines: the shortfall now and with this, the price against the safety net, how long the net lasts, the interest as a cost.');
const BALANCE = d('D-117', 'No "room": a usual month that balances leaves money for a new payment.');
const TIERS = d('D-65', 'Three headlines when the usual month is already short: small, moderate, large.');
const SALE = d('D-106', 'Two new lines on every answer that counts a sale.');
const DISCLAIMER = d('D-64', 'Under every answer: "Worked out only from what’s recorded here. The choice is yours." A "What this can’t see" link, and "FincWin is a planning tool, not a lender."');
const INTRO = d('D-120', 'The one-time "How Decide answers" card gets its wording now.');
const HELP = d('D-122', 'No "free": "{{name}} gives money help at no cost."; heading "Money help at no cost".');
const SHORT = d('D-116', 'New Decide copy says "short", never "overspent".');

/** Owner-worded lines (D-35..D-48 from the round 1-2 review, then the later owner wording up to D-123), key -> decision. */
export const DECISION_MAP: Readonly<Record<string, Decision>> = Object.freeze({
  'decide.v3.verdict.fitsNoNet.chip': NET,
  'decide.v3.verdict.fitsNoNet.title': NET,
  'decide.v3.verdict.fitsSmallNet.chip': NET,
  'decide.v3.verdict.fitsSmallNet.title': NET,
  'decide.v3.fact.net_none_start': NET,
  'decide.v3.fact.net_progress': NET,
  'decide.v3.fact.overdraft_use': d('D-26', 'How far below $0, for about how many days, and roughly what it costs, labelled an estimate.'),
  'decide.v3.verdict.fitsUsesOverdraftNotCleared.chip': OD_PAST,
  'decide.v3.verdict.fitsUsesOverdraftNotCleared.title': OD_PAST,
  'decide.v3.verdict.fitsUsesOverdraftNotCleared.body': OD_PAST,
  'decide.v3.fact.overdraft_not_cleared': OD_PAST,
  'decide.v3.fact.overdraft_cost_90d': d('D-36', 'Overdraft interest is each day’s balance below $0 times the daily rate.'),
  'decide.v3.fact.overdraft_repeat': d('D-37', 'Extra warning when the account goes below $0 before 2 of the next 3 paydays.'),
  'decide.v3.fact.no_overdraft_limit': d('D-38', 'With no overdraft recorded, say so and ask whether the account has one.'),
  'decide.v3.fact.clearing_first': d('D-38', 'Any cost-saving line is a fact, e.g. "Clearing what you owe first lowers the cost".'),
  'decide.v3.verdict.fitsByBorrowingCostsMore.chip': d('D-39a', 'Cash fits but a plan is chosen: "Fits, but borrowing costs more" with the total interest.'),
  'decide.v3.verdict.fitsByBorrowingCostsMore.body': d('D-39a', 'Cash fits but a plan is chosen: "Fits, but borrowing costs more" with the total interest.'),
  'decide.v3.verdict.fitsUnspentCostlyDebt.chip': d('D-39b', 'Amber when earlier months’ money is spent while a debt at 20% APR or more remains.'),
  'decide.v3.verdict.fitsUnspentCostlyDebt.body': d('D-39b', 'The debt’s monthly interest shown as a fact.'),
  'decide.v3.fact.debt_interest_cost': d('D-39b', 'The debt’s monthly interest shown as a fact.'),
  'decide.v3.fact.card_instead': d('D-72', 'Putting the money toward the card would cut its interest by at least 1.00 a month.'),
  'decide.v3.verdict.fitsMonthTightOnce.chip': TIGHT,
  'decide.v3.verdict.fitsUnspentTight.chip': TIGHT,
  'decide.v3.fact.tight_floor': TIGHT,
  'decide.v3.afterBuy.boughtOn': d('D-42', 'The purchase date (when it is to be bought) is stated.'),
  'decide.v3.afterBuy.boughtToday': d('D-42', 'The purchase date (when it is to be bought) is stated.'),
  'decide.v3.fact.ask_debts_not_recorded': ASK_DEBTS,
  'decide.v3.fact.ask_debts_not_recorded_loan': ASK_DEBTS,
  'decide.v3.fact.ask_debts_not_recorded_card': ASK_DEBTS,
  'decide.v3.fact.ask_debts_not_recorded_overdraft': ASK_DEBTS,
  'decide.v3.fact.earlier_money_from': EARLIER,
  'decide.v3.fact.earlier_money_from_savings': EARLIER,
  'decide.v3.fact.covered_from_savings': RUNWAY,
  'decide.v3.fact.further_shortfall_runway': RUNWAY,
  'decide.v3.fact.yearly_bill_ahead': d('D-47', 'A fact line names the coming bill and its date.'),
  'decide.v3.fact.bills_held_back': d('D-47', 'Hold back only the part the months before the due date cannot cover.'),
  'decide.v3.fact.interest_is_a_cost': BORROW,
  'decide.v3.fact.net_covers_surprises': BORROW,
  'decide.v3.fact.income_or_costs_first': BORROW,
  'decide.v3.fact.usual_month_short': DEPLETION,
  'decide.v3.fact.depletion_payment': DEPLETION,
  'decide.v3.fact.price_over_net': DEPLETION,
  'decide.v3.fact.net_lasts': DEPLETION,
  'decide.v3.fact.balanced_month_room': BALANCE,
  'decide.v3.fact.month_balance_gap': BALANCE,
  'decide.v3.fact.extra_savings_used': d('D-56', '"From your extra savings: uses $X of the $Y above your safety net’s size."'),
  'decide.v3.fact.net_two_months': d('D-56', 'A fact line that 2 months in the safety net gives more cover.'),
  'decide.v3.fact.move_money_by': d('D-58', 'The amount to move and the date it must be moved by.'),
  'decide.v3.fact.plan_makes_short': d('D-60', '"This plan would make your usual month about $X short".'),
  'decide.v3.fact.net_locked': d('D-61', 'The safety net is locked by default and left out of the answer.'),
  'decide.v3.fact.locked_goals_kept': d('D-05', 'Money saved in a locked goal is kept out of the answer, and the answer says so.'),
  'decide.v3.fact.net_and_goals_kept': d('D-06', 'A locked safety net and locked goals are named together.'),
  'decide.v3.fact.unlocked_goals_counted': d('D-22', 'Money saved in an unlocked goal counts as spare money, and the answer says so.'),
  'decide.v3.verdict.fitsUnspentExtraSavings.chip': d('D-62', 'Its own headline, "Fits from extra savings".'),
  'decide.v3.verdict.fitsUnspentExtraSavings.body': d('D-62', '"From your extra savings: uses $X of the $Y above your safety net’s size."'),
  'decide.v3.verdict.monthAlreadyShort.chip': d('D-63', 'A clear no: "No: your month is already short".'),
  'decide.v3.verdict.monthShortSmall.chip': TIERS,
  'decide.v3.verdict.monthShortModerate.chip': TIERS,
  'decide.v3.verdict.monthShortModerateExtra.chip': TIERS,
  'decide.v3.fact.month_short_fits': TIERS,
  'decide.v3.fact.money_lasts_shorter': TIERS,
  'legal.decideAnswer.caveat': DISCLAIMER,
  'legal.decideAnswer.cantSeeLink': DISCLAIMER,
  'legal.decideAnswer.footer': DISCLAIMER,
  'legal.decideAbout.what.planningInfo': d('D-64', 'The About sheet says this is information to help plan, not financial advice (the one keyed exception).'),
  'decide.v3.fact.short_plan_from_cash': d('D-68', 'One caution line: the monthly cost is more than the usual month can cover, so it is paid from money on hand.'),
  'decide.v3.fact.save_vs_borrow_ask': d('D-79', '"To compare with saving up, add [the missing figure]".'),
  'decide.v3.fact.overdraft_carried_in': d('D-86', 'Money owed from last month comes off this month’s big number.'),
  'decide.v3.tax.exampleRate': d('D-91', '"Example rate only. It is not your rate and is not saved."'),
  'decide.v3.tax.disclaimer': d('D-92', '"This is a planning estimate, not a tax figure."'),
  'decide.v3.notice.tax_not_included': d('D-20', '"Tax not included. Set your region to add it".'),
  'decide.v3.fact.debt_left_after_sale': SALE,
  'decide.v3.fact.sale_counted': SALE,
  'decide.v3.notice.unsaved_changes': d('D-113', '"Some changes are not saved yet. This answer counts them once they save."'),
  'decide.v3.verdict.monthlyShort.chip': SHORT,
  'decide.v3.afterBuy.monthOver': SHORT,
  'decide.v3.afterBuy.usualMonthOver': SHORT,
  'decide.v3.caveat.large_for_month': d('D-118', 'A big purchase costs at least one usual month’s money in.'),
  'decide.v3.caveat.close_to_line': d('D-121', '"Close to the line" shows on every tight answer.'),
  'legal.decideIntro.title': INTRO,
  'legal.decideIntro.works': INTRO,
  'legal.decideIntro.figures': INTRO,
  'legal.decideIntro.facts': INTRO,
  'legal.decideIntro.gotIt': INTRO,
  'decide.v3.fact.free_help': HELP,
  'legal.decideAbout.freeHelpTitle': HELP,
  'legal.decideAbout.freeHelp': HELP,
});

/** One example per placeholder, so a template also reads as a sentence. `count` is 1 on `_one` keys (fillSample). */
export const SAMPLE_VALUES: Readonly<Record<string, string>> = Object.freeze({
  above: '$1,200.00',
  account: 'Everyday',
  after: '$640.00',
  amount: '$250.00',
  apr: '24.9',
  balance: '$3,000.00',
  before: '$890.00',
  below: '$320.00',
  bill: 'Car insurance',
  bridge: '$600.00',
  capped: '$150.00',
  category: 'Groceries',
  computed: '$212.40',
  cost: '$4.10',
  costs: '$2,350.00',
  count: '3',
  covered: '7',
  currency: 'EUR',
  date: '15 November',
  day: '25',
  days: '9',
  debt: 'Visa card',
  dueDate: '1 March',
  envelope: 'Holiday',
  everyday: '$410.00',
  extra: '$100.00',
  figure: 'your everyday spending',
  floor: '$240.00',
  from: 'February',
  fromMonth: '$200.00',
  gap: '$180.00',
  goals: '$640.00',
  interest: '$412.00',
  largest: '$95.00',
  lastYear: 'November last year',
  leanFrom: 'January',
  leanLeft: '$60.00',
  leanTo: 'March',
  left: '$310.00',
  limit: '35',
  locked: '$2,400.00',
  lookedFor: '6',
  lowMonth: 'February',
  middle: '$2,050.00',
  money: '$1,500.00',
  moneyIn: '$2,800.00',
  month: 'November',
  monthName: 'November',
  monthly: '$85.00',
  monthlyCost: '$6.00',
  monthlyInterest: '$62.00',
  months: '4',
  monthsAfter: '3',
  more: '$412.00',
  name: 'MoneyHelper',
  net: '$1,000.00',
  of: '12',
  pay: '$2,800.00',
  payment: '$85.00',
  payments: '12',
  percent: '8.2',
  periods: '12',
  price: '$900.00',
  quoted: '$215.00',
  rate: '22',
  readyBy: 'February',
  readyMonth: 'February',
  sameMonth: 'November last year',
  saved: '$600.00',
  savings: '$2,000.00',
  setup: '$2,200.00',
  share: '38',
  short: '$150.00',
  shortAfter: '$235.00',
  shortBefore: '$150.00',
  shortfall: '$150.00',
  size: '$2,400.00',
  starter: '$1,225.00',
  suggested: '$1,180.00',
  times: '3',
  to: 'April',
  total: '$1,312.00',
  twoMonths: '$2,450.00',
  until: 'October next year',
  used: '$500.00',
  value: '40',
  zero: '$0.00',
});

export const placeholdersOf = (text: string): string[] => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1] as string);

/** The template with every blank filled from SAMPLE_VALUES (count is 1 on an i18next `_one` key). */
export function fillSample(key: string, text: string): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_m, p: string) => (p === 'count' && key.endsWith('_one') ? '1' : (SAMPLE_VALUES[p] ?? `{{${p}}}`)));
}
