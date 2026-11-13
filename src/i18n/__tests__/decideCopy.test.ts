// DCU-09 and the UI-SPEC banned list: FincWin is not a lender and the card path never reads as an offer.
import en from '../locales/en';
import { DRAFT_COPY_KEYS } from '../copyStatus';
import { UNDO_LABEL_KEYS } from '../../engine/undo/types';
import { undoLabelText } from '../undoLabel';
import { ABOUT_KEYS, AFTER_BUY_KEYS, BASIS_KEYS, BASIS_REASON_KEYS, CAVEAT_FIGURE_KEYS, CAVEAT_KEYS, CAVEAT_WRONG_FIGURE_KEY, DISCLAIMER_KEYS, FACT_ACTION_KEYS, FACT_KEYS, FOOTER_KEY, INTRO_KEYS, MISSING_KEYS, NEXT_STEP_KEYS, NOTICE_KEYS, PLAN_LABEL_KEYS, READINESS_KEYS, TAX_KEYS, VERDICT_TABLE } from '../../engine/decide/v3/copy/verdictTable';

interface Leaf {
  path: string;
  value: string;
}

function collectLeaves(node: unknown, prefix = ''): Leaf[] {
  if (typeof node === 'string') return [{ path: prefix, value: node }];
  if (node && typeof node === 'object') {
    return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
      collectLeaves(value, prefix ? `${prefix}.${key}` : key)
    );
  }
  return [];
}

const leaves = collectLeaves(en.decide, 'decide');
// 05.2 (plan 20): the shared income steps and the three Activity subtrees carry the same Decide wording rules.
const extraLeaves = [
  ...collectLeaves(en.income, 'income'),
  ...collectLeaves(en.activity.incomeCard, 'activity.incomeCard'),
  ...collectLeaves(en.activity.incomeTag, 'activity.incomeTag'),
  ...collectLeaves(en.activity.refund, 'activity.refund'),
];
const copyLeaves = [...leaves, ...extraLeaves];

// WR-D04 / WR-B09: reassurance about the future ("safe to plan on") is advice in another form; the record states what
// the figures are and what the check does with them.
const REASSURING = [/\bsafe to\b/i, /\bdon[’']t worry\b/i, /\bnothing to worry\b/i, /\bno problem\b/i, /\bgo for it\b/i, /\byou can afford\b/i, /\bworth it\b/i, /\byou[’']re fine\b/i, /\byou[’']ll be fine\b/i, /\bsafely\b/i];
// WR-D04: copy that describes money never opens with an order to spend, save, buy or borrow. Option titles read as
// states ("Saving first, then buying"), not instructions.
const IMPERATIVE_LEAD = /^(Spend|Save|Try|Keep|Buy|Borrow|Skip|Put|Cut|Pay|Invest|Sell|Stop)\b/;
// Controls and field labels name an action the user takes in the app (a button, a dialog choice, a field caption); they
// are not a prescription about money. Each one is listed by key so a new descriptive string cannot slip through.
const ACTION_LABELS = new Set([
  'income.pay.defaultName', // the noun "Pay": the name a new pay series gets (05.2-49), not an instruction
  'decide.delete.keep', // dialog choice: keep the record instead of deleting it
  // 05.2 (plan 20): setup controls and UI-SPEC titles that open with a verb. Each names an action in the app, not advice about money.
  'decide.accountUse.save', // button: "Save account use"
  'decide.accountUse.keep', // button: "Keep as is"
  'income.method.optionSteady', // choice-card title: "Pay myself a steady amount."
  'activity.incomeTag.save', // button: "Save income type"
  'activity.refund.emptyBody', // empty-search hint, UI-SPEC wording: "Try a payee name or an amount."
  // 06.1-05 (D-18): decide.screens buttons, item and rule names and toasts that open with one of these verbs. Each names an
  // action in the app or a rule the user set, not advice about money.
  'decide.screens.common.saveAndClose', // button
  'decide.screens.common.error.retry', // button: "Try the check again" (N23)
  'decide.screens.common.error.retryA11y', // the same button’s accessibility label
  'decide.screens.home.examples.title', // heading of the example chips: "Try an example"
  'decide.screens.sheetsHome.rulesCard.keepAtLeast', // rule name: "Keep at least {{amount}} left each month"
  'decide.screens.sheetsHome.rulesCard.changedSub', // row subline naming what can change: "Pay, a bill or a one-off cost"
  'decide.screens.sheetsHome.openCheck.saveForIt', // action row
  'decide.screens.sheetsHome.rule.save', // button
  'decide.screens.sheetsHome.rule.keep.title', // rule name (sheet title)
  'decide.screens.sheetsHome.rule.keep.field', // field caption: the rule name
  'decide.screens.sheetsHome.addRule.keep', // rule kind name
  'decide.screens.sheetsHome.changed.save', // button
  'decide.screens.answer.options.later', // option chip: "Buy later" (equal-weight option, UX-10)
  'decide.screens.answer.worked.payAndBills', // source row name: "Pay and bills"
  'decide.screens.answerDetail.later.title', // sheet title: "Buy later"
  'decide.screens.answerActions.bar.saveForIt', // action bar button
  'decide.screens.setup.items.pay', // setup item name: "Pay and payday"
  'decide.screens.setupPayBills.pay.title', // setup item name: "Pay and payday"
  'decide.screens.setupPayBills.pay.countSteady', // choice title, same wording as income.method.optionSteady
  'decide.screens.setupPayBills.pay.save', // button
  'decide.screens.setupPayBills.payEdit.save', // button
  'decide.screens.setupPayBills.payEdit.toast', // toast naming what was saved: "Pay saved: ..."
  'decide.screens.setupPayBills.bills.save', // button
  'decide.screens.setupPayBills.billEdit.save', // button
  'decide.screens.setupOthers.debts.save', // button
  'decide.screens.setupOthers.net.save', // button
  'decide.screens.setupOthers.rules.keepAtLeast', // rule name
  'decide.screens.setupOthers.rules.save', // button
  'decide.screens.setupOthers.records.save', // button
  'decide.screens.setupOthers.records.quickSave', // 06.1-65 button: "Save estimates" on quick estimates opened from Records
  'decide.screens.sheetsInput.quick.save', // button
  'decide.screens.sheetsInput.plan.save', // button
  'decide.screens.sheetsInput.often.save', // button
  'decide.screens.sheetsCosts.sale.save', // button
  'decide.screens.safetyNet.unlock.keep', // dialog choice: "Keep it locked"
  'decide.screens.safetyNet.firstAnswer.save', // button
]);
// 2026-10-23 walkthrough: sentences, hints and placeholders are declarative ("A price comes first"), never an order to the
// user ("Add a price to continue", "Type the rate"). Buttons, dialog titles and field captions that name an action in the
// app are listed by key; any other string that opens with an instruction verb fails.
const INSTRUCTION_LEAD = /^(Add|Type|Choose|Pick|Enter|Switch|Move|Tap|Change (it|any|the))\b/;
const CONTROL_LABELS = new Set([
  'decide.hint.foldTap', // reveal hint named in UI-SPEC as a control
  // 05-110 (R17.6): UI controls on the keyed list; none is a prescription about money
  'decide.v3.factAction.addLimit', // 05.4 FIN-03 (D-38): answer button to "Does Main have an overdraft?"
  'decide.v3.factAction.addIt', // 05.4 D-43 (05.4-20): answer button to "No loan, card, other debt or overdraft is recorded. Do you have any?"
  // 05.2 (plan 20): setup controls, captions and UI-SPEC sentences. Every one is a button, link, caption or step intro named in
  // 05.2-UI-SPEC.md; none tells the user what to do with money.
  'decide.setup.accountUse.choose', // answer line on an unanswered row, UI-SPEC wording
  'income.paid.intro', // step intro: "Choose all that apply."
  'income.method.intro', // step intro: "Pick the one that fits you. Nothing is chosen for you."
  'income.other.intro', // step intro: "Choose all that apply, or None."
  // 06.1-05 (D-18): decide.screens buttons, links, sheet titles and accessibility labels (06.1-UI-SPEC Copywriting Contract).
  'decide.screens.common.pickDate', // choice and sheet opener: "Pick a date"
  'decide.screens.home.moreDetails.tileExpenseA11y', // tile accessibility label
  'decide.screens.home.moreDetails.tileLoanA11y', // tile accessibility label
  'decide.screens.home.moreDetails.tileSavingsA11y', // tile accessibility label
  'decide.screens.home.moreDetails.tileIncomeA11y', // tile accessibility label
  'decide.screens.sheetsHome.openChecks.addPurchaseA11y', // link accessibility label
  'decide.screens.sheetsHome.openCheck.choosePay', // action row
  'decide.screens.sheetsHome.addRule.title', // sheet title
  'decide.screens.sheetsHome.addRule.add', // button
  'decide.screens.stepper.kind.addOwn', // tile title
  'decide.screens.answerDetail.stops.add', // button
  'decide.screens.answerActions.goal.changeAmount', // link
  'decide.screens.answerActions.bought.title', // sheet title
  'decide.screens.answerActions.bought.add', // button
  'decide.screens.answerActions.bought.addBill', // button
  'decide.screens.answerActions.runningCost.add', // button
  'decide.screens.setupPayBills.otherIncome.title', // sheet title
  'decide.screens.setupPayBills.otherIncome.add', // button
  'decide.screens.setupPayBills.billAdd.title', // sheet title
  'decide.screens.setupPayBills.billAdd.add', // button
  'decide.screens.setupOthers.net.changeSize', // link
  'decide.screens.setupOthers.records.addSince', // link to Activity quick add
  'decide.screens.setupOthers.records.addAsYouGo', // button
  'decide.screens.sheetsInput.date.title', // sheet title
  'decide.screens.sheetsInput.quick.add', // button
  'decide.screens.sheetsInput.quick.expense.title', // sheet title
  'decide.screens.sheetsInput.quick.loan.title', // sheet title
  'decide.screens.sheetsInput.quick.savings.title', // sheet title
  'decide.screens.sheetsInput.quick.income.title', // sheet title
  'decide.screens.sheetsCosts.own.running.title', // sheet title
  'decide.screens.sheetsCosts.own.running.add', // button
  'decide.screens.sheetsCosts.own.stop.title', // sheet title
  'decide.screens.sheetsCosts.own.stop.add', // button
  'decide.screens.sheetsCosts.own.oneOff.title', // sheet title
  'decide.screens.sheetsCosts.own.oneOff.add', // button
  'decide.screens.sheetsCosts.own.kind.title', // sheet title
  'decide.screens.sheetsCosts.own.kind.add', // button
  'decide.screens.sheetsCosts.own.addItem', // button
  'decide.screens.safetyNet.settings.changeSize', // link
]);
// 05.4-37: the 05.4 copy rules for decide.v3 (and the D-64 legal keys). Each entry names its rule.
const V3_COMPLIANCE: readonly RegExp[] = [
  /\bsuggestion/i, // CMP-F25
  /\b(rough|fair|firm)\b/i, // D-31: no Rough / Fair / Firm
  /\bmost dealers\b/i, // CMP-F08: an unsourced claim
  /\boverspent\b/i, // UX-08, D-116: "short"
  /\bunspent\b/i, // UX-17, D-56: "spare money"
  /\broom\b/i, // UX-17, D-117: no exception
  /\bband \d+\b/i, // UX-18
  /\bB\d\b/, // UX-18
  /\basks about\b/i, // UX-18
  /\b(sure|certain|accurate)\b/i, // CMP-F12: never more confident than the answer
  /\brecommend/i, // D-92 and the copy rule
  /\bbest to\b/i,
  /\byou should\b/i,
  /\badvice\b/i, // D-92: the one exception is D-64's About-sheet sentence (legal.decideAbout.what.planningInfo), outside decide.v3
  /\bemergency fund\b/i, // D-35: one name, "safety net"
  /\bliab(le|ility)\b/i, // D-64 (2): the liability sentence is in the Terms of Use only
  /\bnot responsible\b/i, // D-64 (2)
  /\bworks for (most|nearly|almost)\b/i, // D-64: never a success rate
  /\b\d+ ?% of (people|users|the time)\b/i, // D-64: never a success rate
];
// D-35 / round 1b (owner override of Theme G UX-37 / CMP-F13): the months line sits only inside these two net facts.
const MONTHS_LINE = /\b\d+(\s+to\s+\d+)?\s+months?\s+is\s+(a start|common)\b/i;
const MONTHS_LINE_KEYS: ReadonlySet<string> = new Set(['decide.v3.fact.net_none_start', 'decide.v3.fact.net_progress']);
const BANNED = [/\badvice\b/i,/\badvis/i, /recommend/i, /you should/i, /we suggest/i, /best option/i, /guaranteed/i, /\bapproved\b/i, /pre-approved/i, /\boffer/i, /apply for/i, /\blender\b/i, /loan offer/i, /interest-free/i];

// Demo-scale values (05-18 demo: income $4,400 a month, car loan over 48 months). Four-digit amounts are the widest a
// demo month shows; `already` < `short` by meaning ("already X short. This makes it Y"); 'average' is the longer basis
// word; 100 months against the 60-month maximum credit horizon is the longest past-horizon pair the demo can produce.
const DEMO_VALUES: Record<string, string> = { amount: '$1,234', short: '$1,234', already: '$412', left: '$1,234', pct: '41%', basis: 'average', count: '100', horizon: '60', payment: '$302.08' }; // payment: a demo-scale monthly payment with cents (D-54)
const TITLE_CAP = 64; // UI-SPEC: title at most 3 heading lines at 402 ("about 64 characters")

function interpolate(value: string, overrides: Record<string, string> = {}): string {
  return value.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => overrides[name] ?? DEMO_VALUES[name] ?? 'X');
}

function get(path: string): string {
  const found = copyLeaves.find((l) => l.path === path);
  if (!found) throw new Error(`no decide leaf ${path}`);
  return found.value;
}

describe('decide copy (DCU-09)', () => {
  it('has leaves', () => {
    expect(leaves.length).toBeGreaterThan(300);
  });

  it.each(copyLeaves)('uses no banned word: $path', ({ value }) => {
    for (const re of BANNED) expect(value).not.toMatch(re);
  });

  // 05.4-25 (owner, 2026-11-04, D-92): the CMP-F24 tax disclaimer carries no "advice"; the copy guards keep no exception for it.
  it('the CMP-F24 tax disclaimer is worded as the owner set it, with no keyed exception', () => {
    expect(get('decide.v3.tax.disclaimer')).toBe('This is a planning estimate, not a tax figure.');
  });

  it.each(copyLeaves)('does not reassure about the future: $path', ({ value }) => {
    for (const re of REASSURING) expect(value).not.toMatch(re);
  });

  it.each(copyLeaves.filter((l) => !ACTION_LABELS.has(l.path)))('does not open with an order about money: $path', ({ value }) => {
    expect(value).not.toMatch(IMPERATIVE_LEAD);
  });

  it('2026-10-23: no sentence, hint or placeholder opens with an instruction verb', () => {
    const offenders = copyLeaves.filter((l) => !CONTROL_LABELS.has(l.path) && INSTRUCTION_LEAD.test(l.value)).map((l) => l.path);
    expect(offenders).toEqual([]);
    for (const old of ['Add a price to continue.', 'Type the rate you were quoted', 'Choose the card this goes on first.', 'Switch one on to see it hit your cash.']) {
      expect(old).toMatch(INSTRUCTION_LEAD);
    }
  });

  it('names Grow only in the new Decide screens and where a setup step points to it (06.1 D-06, 06-20)', () => {
    // 06.1 D-06: the new Decide screens ship in one release with Grow, so decide.screens.* may name it; 06-20: the tab exists now.
    expect(
      leaves
        .filter((l) => /\bGrow\b/.test(l.value) && !l.path.startsWith('decide.screens.') && !l.path.startsWith('decide.setup.growLink.'))
        .map((l) => l.path),
    ).toEqual([]);
  });

  // 06.1-37 (T-06.1-37-01): a stale exemption must not hide a banned word, so every exemption names a leaf that exists.
  it('exemption root exists: every ACTION_LABELS and CONTROL_LABELS entry names a catalogue leaf', () => {
    const paths = new Set(copyLeaves.map((l) => l.path));
    expect([...ACTION_LABELS, ...CONTROL_LABELS].filter((p) => !paths.has(p))).toEqual([]);
  });

  it('every listed action label exists and still opens with its verb (WR-D04)', () => {
    for (const path of ACTION_LABELS) expect(get(path)).toMatch(IMPERATIVE_LEAD);
  });

  it('the guard catches the wording WR-D04 and WR-B09 replaced', () => {
    for (const old of ['The average is safe to plan on.']) expect(REASSURING.some((re) => re.test(old))).toBe(true);
    for (const old of ['Spend less, keep the rest working', 'Save first, then buy', 'Try on credit', 'Skip it entirely', 'Buy at month 3, then keep the $1 a month', 'Put it on a card']) {
      expect(old).toMatch(IMPERATIVE_LEAD);
    }
  });

  it('uses the word lend nowhere in the decide.* copy (the not-a-lender footer lives under legal.*)', () => {
    expect(copyLeaves.filter((l) => /lend/i.test(l.value)).map((l) => l.path).sort()).toEqual([]);
  });

  it.each(copyLeaves)('uses no straight apostrophe: $path', ({ value }) => {
    expect(value).not.toContain("'");
  });

  it('marks every decide leaf as draft copy', () => {
    const drafts = new Set<string>(DRAFT_COPY_KEYS);
    expect(copyLeaves.filter((l) => !drafts.has(l.path)).map((l) => l.path)).toEqual([]);
  });

  it('keeps notification copy free of placeholders (lock-screen privacy, D-10)', () => {
    for (const key of ['title', 'body', 'coolingTitle', 'coolingBody']) {
      expect(get(`decide.notify.${key}`)).not.toContain('{{');
    }
  });
});

describe('decide depth copy (05-31, DCU-09)', () => {
  const depth = leaves.filter((l) => l.path.startsWith('decide.depth.'));
  const INVESTING_BANNED = ['invest now', 'start investing', 'best rate', 'you will earn', 'you should invest'];

  it('has depth leaves', () => {
    expect(depth.length).toBeGreaterThan(0);
  });

  it.each(depth)('depth leaf passes the banned list: $path', ({ value }) => {
    for (const re of BANNED) expect(value).not.toMatch(re);
  });

  it('never promises or pushes investing', () => {
    for (const l of leaves) {
      for (const phrase of INVESTING_BANNED) expect(l.value.toLowerCase()).not.toContain(phrase);
    }
  });

  it('uses forecast only as "not a forecast"', () => {
    const withForecast = leaves.filter((l) => /forecast/i.test(l.value));
    for (const l of withForecast) expect(l.value.toLowerCase()).toContain('not a forecast');
  });

  it('marks every depth leaf and the record one-off keys as draft copy', () => {
    const drafts = new Set<string>(DRAFT_COPY_KEYS);
    const required = [
      ...depth.map((l) => l.path),
      'record.sheet.toggle.oneOff',
      'record.sheet.note.oneOff',
      'activity.detail.oneOff',
      'activity.detail.oneOffValue',
    ];
    expect(required.filter((p) => !drafts.has(p))).toEqual([]);
  });

});

describe('decide v3 verdict copy (05.1-23, I22, I26)', () => {
  const v3 = leaves.filter((l) => l.path.startsWith('decide.v3.'));
  const V3_BANNED = [/\bshould\b/i, /\bapprove/i, /\bdecline/i, /\bgo ahead\b/i, /\byou can\b/i, /\bsafe\b/i, /\bfree\b/i, /\bbest\b/i, /\bbetter\b/i, /\bworth it\b/i, /\bwill run out\b/i, ...V3_COMPLIANCE];
  // Demo-scale values for the v3 placeholders, kept apart from DEMO_VALUES so the existing length checks are unchanged.
  const V3_DEMO: Record<string, string> = { month: 'September', lowMonth: 'February', fromMonth: '$1,234', after: '$1,234', date: '12 Sep', months: '14', readyMonth: 'March 2027', monthly: '$1,234', used: '$1,234', suggested: '$1,234', days: '45', line: 'housing' };

  function resolve(path: string): string | undefined {
    let node: unknown = en;
    for (const part of path.split('.')) {
      if (!node || typeof node !== 'object') return undefined;
      node = (node as Record<string, unknown>)[part];
    }
    return typeof node === 'string' ? node : undefined;
  }

  it('I22 every v3 key exists', () => {
    const keys = [
      ...Object.values(VERDICT_TABLE).flatMap((r) => [r.chipKey, r.titleKey, r.bodyKey]),
      ...Object.values(NOTICE_KEYS),
      ...Object.values(FACT_KEYS),
      ...Object.values(MISSING_KEYS),
      ...Object.values(READINESS_KEYS),
      ...Object.values(BASIS_KEYS),
      ...Object.values(BASIS_REASON_KEYS),
      ...Object.values(NEXT_STEP_KEYS),
      // Context variants chosen by the UI (05.1-33): not engine codes, so no table maps them.
      'decide.v3.notice.income_from_expected_confirmed',
      'decide.v3.notice.income_from_expected_last_year',
      'decide.v3.notice.income_from_expected_low',
      'decide.v3.missing.account_use_question_fund',
      // Variants chosen by the UI (05.1-40)
      // 05.4 FIN-02: the wait line names a month when no payday clears the dip
      'decide.v3.fact.wait_keeps_net_month',
      'decide.v3.fact.line_crossed_percent',
      'decide.v3.fact.line_crossed_money',
      'decide.v3.fact.line_crossed_tenths',
      'decide.v3.notice.month_heading_short_category',
      // 05.4 FIN-03: variants chosen by the UI (no rate set, no days below 0 without the purchase, no pay in the 90 days)
      'decide.v3.fact.overdraft_use_no_rate',
      'decide.v3.fact.overdraft_without_purchase_above',
      'decide.v3.fact.overdraft_not_cleared_no_pay',
      // 05.4 D-43 (05.4-20): the ask names only what is not recorded (the fact's kind picks the variant)
      'decide.v3.fact.ask_debts_not_recorded_loan',
      'decide.v3.fact.ask_debts_not_recorded_card',
      'decide.v3.fact.ask_debts_not_recorded_overdraft',
      'decide.v3.fact.ask_debts_not_recorded_loan_card',
      'decide.v3.fact.ask_debts_not_recorded_loan_overdraft',
      'decide.v3.fact.ask_debts_not_recorded_card_overdraft',
      // 05.4 FIN-07 / D-40 (05.4-21): the tight floor is the user's own line (basis 'user_line')
      'decide.v3.fact.tight_floor_user_line',
      // 05.4 FIN-05: the save-or-borrow line, by kind (cash fits, net, overdraft, no date)
      'decide.v3.fact.save_vs_borrow_cash_fits',
      'decide.v3.fact.save_vs_borrow_with_net',
      'decide.v3.fact.save_vs_borrow_with_overdraft',
      'decide.v3.fact.save_vs_borrow_no_date',
      'decide.v3.fact.save_vs_borrow_ask', // 05.4 D-79
      'decide.v3.fact.lean_bridge_net', // 05.4 FIN-08: the low months dip into the safety net (source 'net')
      'decide.v3.fact.lean_bridge_long', // 06.1 FIN-22: a plan over 12 payments (owner 2026-11-12)
      'decide.v3.fact.lean_bridge_net_long', // 06.1 FIN-22: the same, from the safety net
      'decide.v3.fact.rate_convention_effective_eu', // 06.1 FIN-23: area 'eu'
      'decide.v3.fact.overdraft_repeat_no_rate',
      'decide.v3.fact.other_account_overdrawn_no_rate',
      'decide.v3.fact.earlier_money_from_savings', // 05.4 D-44 (05.4-24): where 'savings'
      ...Object.values(AFTER_BUY_KEYS), // 05.4 FIN-09 (05.4-24)
      ...Object.values(TAX_KEYS), // 05.4 FIN-27 (CMP-F24, D-21)
      ...Object.values(FACT_ACTION_KEYS).flatMap((a) => Object.values(a)),
      FOOTER_KEY,
      ...Object.values(CAVEAT_KEYS), // 05.4-37 D-64 (4)
      ...Object.values(CAVEAT_FIGURE_KEYS), // D-64 (5)
      CAVEAT_WRONG_FIGURE_KEY,
      ...Object.values(PLAN_LABEL_KEYS), // 05.4-38 CMP-F07, CMP-F11
    ];
    expect(keys.filter((k) => resolve(k) === undefined)).toEqual([]);
    // and the other way: every v3 leaf is reachable from a table
    const reachable = new Set<string>(keys);
    expect(v3.filter((l) => !reachable.has(l.path)).map((l) => l.path)).toEqual([]);
  });

  it('I26 v3 banned words', () => {
    expect(v3.length).toBeGreaterThan(40);
    for (const l of v3) for (const re of V3_BANNED) expect({ path: l.path, hit: re.test(l.value) }).toEqual({ path: l.path, hit: false });
  });

  it('05.4-37 the months line sits only inside the two net facts (D-35, round 1b)', () => {
    expect(v3.filter((l) => MONTHS_LINE.test(l.value) && !MONTHS_LINE_KEYS.has(l.path)).map((l) => l.path)).toEqual([]);
    for (const k of MONTHS_LINE_KEYS) expect({ k, line: MONTHS_LINE.test(get(k)) }).toEqual({ k, line: true });
  });

  it('05.4-37 the guard catches the words 05.4 replaced', () => {
    const old = [
      'Overspent each month', 'Fits from unspent money', 'Your emergency fund is untouched.', 'This answer is less certain because',
      'leaves room for a new payment', 'Band 7', 'B7 applies', 'Asks about debts', 'a suggestion', 'Rough', 'most dealers cap card payments',
      'FincWin accepts no liability', 'We are not responsible for', 'Works for most people.', '90% of users', 'We recommend this', 'best to wait',
    ];
    for (const o of old) expect({ o, hit: V3_COMPLIANCE.some((re) => re.test(o)) }).toEqual({ o, hit: true });
    expect(MONTHS_LINE.test('1 month is a start; 3 to 6 months is common.')).toBe(true);
  });

  it('D-116 / D-56 / D-35 v3 says short, spare money and safety net', () => {
    expect(get('decide.v3.verdict.monthlyShort.chip')).toBe('Short each month');
    expect(get('decide.v3.verdict.fitsUnspent.chip')).toBe('Fits from spare money');
    expect(v3.filter((l) => /overspent|unspent|emergency fund/i.test(l.value)).map((l) => l.path)).toEqual([]);
  });

  it('D-117 the two balancing lines read as the owner set them', () => {
    expect(get('decide.v3.fact.balanced_month_room')).toMatch(/^A usual month that balances leaves money for a new payment\./);
    expect(get('decide.v3.fact.month_balance_gap')).toMatch(/and then a new payment would fit\.$/);
  });

  it('v3 4.6 forecasts say could, based on your records or on track', () => {
    const forecastBodies = ['fitsMonth', 'fitsMonthLowMonth', 'fitsUnspentLowMonth', 'notYetPayday', 'notYetNotCovered', 'monthlyShort', 'fitsUsesNet'];
    for (const name of forecastBodies) {
      expect(get(`decide.v3.verdict.${name}.body`)).toMatch(/\bcould\b|based on your records|on track/i);
    }
  });

  it('v3 verdict titles fit three lines', () => {
    for (const l of v3.filter((x) => /^decide\.v3\.verdict\.\w+\.title$/.test(x.path))) {
      expect(interpolate(l.value, V3_DEMO).length).toBeLessThanOrEqual(TITLE_CAP);
    }
  });

  it('v3 leaves are draft copy and the D-64 lines read as the owner worded them', () => {
    const drafts = new Set<string>(DRAFT_COPY_KEYS);
    expect(v3.filter((l) => !drafts.has(l.path)).map((l) => l.path)).toEqual([]);
    expect(en.legal.decideAnswer.caveat).toBe('Worked out only from what’s recorded here. The choice is yours.');
    expect(en.legal.decideAnswer.cantSeeLink).toBe('What this can’t see');
    expect(en.legal.decideAnswer.footer).toBe('FincWin is a planning tool, not a lender.');
    expect(en.legal.decideAbout.what.planningInfo).toBe('This is information to help you plan, not financial advice.');
    expect(FOOTER_KEY).toBe('legal.decideAnswer.footer');
    expect('decideFooter' in en.legal).toBe(false); // retired by D-64
  });

  it('05.4-23 FIN-08 / CMP-F01: Only on your answer says the records do not show it; Not yet and the runway lines never say never', () => {
    expect(get('decide.v3.verdict.fitsOnYourAnswer.chip')).toBe('Only on your answer');
    expect(get('decide.v3.verdict.fitsOnYourAnswer.body')).toMatch(/records do not show this/);
    const paths = ['notYetNotCovered', 'notYetPayday'].flatMap((n) => ['chip', 'title', 'body'].map((p) => `decide.v3.verdict.${n}.${p}`));
    paths.push('decide.v3.fact.covered_from_savings', 'decide.v3.fact.further_shortfall_runway', 'decide.v3.notice.pay_gap');
    for (const p of paths) expect({ p, never: /\bnever\b/i.test(get(p)) }).toEqual({ p, never: false });
  });

  it('D-30 and D-32 notices exist', () => {
    expect(get('decide.v3.notice.unspent_drifted')).toContain('{{suggested}}');
    expect(get('decide.v3.notice.from_your_figures')).toBe('Worked out from the figures you gave.');
  });
});

// 06.1-05 (D-18, CMP-F12): the new Decide screen strings. Whole-word matches, so "insurance" never trips "sure".
describe('decide.screens copy (06.1, D-18, D-19)', () => {
  const screens = leaves.filter((l) => l.path.startsWith('decide.screens.'));
  const SCREENS_BANNED: readonly RegExp[] = [
    /\b(sure|surer|certain|accurate)\b/i, // CMP-F12: never more confident than the answer ("Give it more to go on", not "surer")
    /\badvi(ce|ser|sor)\b/i,
    /\brecommend/i,
    /\byou should\b/i,
    /\b(better|best|optimal)\b/i,
    /\boverspent\b/i, // D-116: "short"
    /\bunspent\b/i, // D-56: "spare money"
    /\bworst month\b/i, // the engine word is "Low month"
    /\bemergency fund\b/i, // D-35: "safety net"
    /\bspare cash\b|\bsavings pot\b/i, // D-56: "spare money", "extra savings"
    /\bband \d+\b|\basks about\b/i, // UX-18
    /\bfree\b/i, // D-122: "at no cost"
    /\blines? you will not cross\b/i, // D-19: "Your money rules"
    /\bhousehold\b|\bshared costs\b/i, // D-03: no household copy in 06.1
  ];

  it('has the screen leaves', () => {
    expect(screens.length).toBeGreaterThan(500);
  });

  it('no screen string uses a banned word', () => {
    const bad: string[] = [];
    for (const l of screens) for (const re of SCREENS_BANNED) if (re.test(l.value)) bad.push(`${l.path}: ${re.source}`);
    expect(bad).toEqual([]);
  });

  it('the banned list matches whole words only', () => {
    for (const ok of ['Insurance', 'Car insurance · monthly', 'Measured', 'Assured payments', 'Uncertainty']) {
      expect({ ok, hit: SCREENS_BANNED.some((re) => re.test(ok)) }).toEqual({ ok, hit: false });
    }
    for (const bad of ['Make it surer', 'Not sure', 'less certain', 'accurate', 'not a lender or adviser', 'We recommend', 'you should', 'the best option', 'Worst month', 'Overspent', 'Free help']) {
      expect({ bad, hit: SCREENS_BANNED.some((re) => re.test(bad)) }).toEqual({ bad, hit: true });
    }
  });

  it('D-19 the card and item 5 are "Your money rules", and the home note reads as the UI-SPEC sets it', () => {
    expect(get('decide.screens.sheetsHome.rulesCard.title')).toBe('Your money rules');
    expect(get('decide.screens.setup.items.rules')).toBe('Your money rules');
    expect(get('decide.screens.setup.status.rulesDone_other')).toBe('Done · {{count}} rules');
    expect(get('decide.screens.stepper.homeNote')).toBe('Home checks come later. Pick another kind for now.');
    expect(get('decide.screens.common.error.message')).toBe('Couldn’t work this out right now. Your records are safe. Try the check again.');
  });

  it('D-18 no screen key repeats the footer: answers use legal.decideAnswer.footer', () => {
    expect(screens.filter((l) => /planning tool|lend|credit/i.test(l.value)).map((l) => l.path)).toEqual([]);
  });

  it('every screen button named in the UI-SPEC is verb + noun, never a bare Save or Add', () => {
    expect(screens.filter((l) => /^(Save|Add)$/.test(l.value)).map((l) => l.path)).toEqual([]);
  });
});

// 05.4-37 D-64 / D-120: the disclaimer, the About sheet and the intro card sit outside en.decide but follow every Decide guard.
describe('Decide legal keys (D-64, D-120, D-92)', () => {
  const legalLeaves = collectLeaves(en.legal, 'legal').filter((l) => l.path.startsWith('legal.decide'));
  const V3_VOICE = [/\bshould\b/i, /\bapprove/i, /\bdecline/i, /\bgo ahead\b/i, /\byou can\b/i, /\bsafe\b/i, /\bfree\b/i, /\bbest\b/i, /\bbetter\b/i, /\bworth it\b/i, /\bwill run out\b/i, ...V3_COMPLIANCE];
  // Exactly two keyed exceptions, each with its decision.
  const EXCEPTIONS: Readonly<Record<string, RegExp>> = {
    'legal.decideAnswer.footer': /\blender\b/i, // D-64 (1): "FincWin is a planning tool, not a lender."
    'legal.decideAbout.what.planningInfo': /\badvice\b/i, // D-64 (3), D-92: the one "advice" exception in the guard
  };
  const allowed = (path: string, re: RegExp): boolean => EXCEPTIONS[path]?.source === re.source;

  it('has the D-64 and D-120 leaves', () => {
    expect(legalLeaves.length).toBe(3 + 24 + 2 + 5); // + 2: the About sheet's money-help heading and line (05.4-38, D-122)
  });

  it('every leaf passes BANNED and the v3 voice list, apart from the two named exceptions', () => {
    const bad: string[] = [];
    for (const l of legalLeaves) for (const re of [...BANNED, ...V3_VOICE]) if (re.test(l.value) && !allowed(l.path, re)) bad.push(`${l.path}: ${re.source}`);
    expect(bad).toEqual([]);
    expect(Object.keys(EXCEPTIONS).sort()).toEqual(['legal.decideAbout.what.planningInfo', 'legal.decideAnswer.footer']);
    for (const [path, re] of Object.entries(EXCEPTIONS)) expect({ path, hit: re.test(String(path.split('.').reduce<unknown>((n, p) => (n as Record<string, unknown>)[p], en))) }).toEqual({ path, hit: true });
  });

  it('"advice" appears in exactly one string across Decide copy (D-92)', () => {
    const all = [...copyLeaves, ...legalLeaves];
    expect(all.filter((l) => /\badvice\b/i.test(l.value)).map((l) => l.path)).toEqual(['legal.decideAbout.what.planningInfo']);
  });

  it('does not reassure, order or instruct, and uses typographic apostrophes', () => {
    const bad = legalLeaves.filter(
      (l) =>
        REASSURING.some((re) => re.test(l.value)) ||
        (!ACTION_LABELS.has(l.path) && IMPERATIVE_LEAD.test(l.value)) ||
        (!CONTROL_LABELS.has(l.path) && INSTRUCTION_LEAD.test(l.value)) ||
        l.value.includes("'")
    );
    expect(bad.map((l) => l.path)).toEqual([]);
  });

  it('uses the word lend only in the footer and the What FincWin is line', () => {
    expect(legalLeaves.filter((l) => /lend/i.test(l.value)).map((l) => l.path).sort()).toEqual(['legal.decideAbout.what.tool', 'legal.decideAnswer.footer']);
  });

  it('every legal leaf is draft copy and every table key resolves', () => {
    const drafts = new Set<string>(DRAFT_COPY_KEYS);
    expect(legalLeaves.filter((l) => !drafts.has(l.path)).map((l) => l.path)).toEqual([]);
    const keys = [
      ...Object.values(DISCLAIMER_KEYS),
      ...Object.values(ABOUT_KEYS).flat(),
      ...Object.values(INTRO_KEYS).flat(),
    ];
    const paths = new Set(legalLeaves.map((l) => l.path));
    expect(keys.filter((k) => !paths.has(k))).toEqual([]);
    expect([...paths].filter((p) => !keys.includes(p as never))).toEqual([]);
  });
});

describe('05.2 undo labels (DSU-21, DCU-09)', () => {
  const expected: Record<string, string> = {
    setupStepSaved: 'Saved · {{name}}', setupReset: 'Decide setup reset', incomeSetupSaved: 'Income setup saved',
    unspentConfirmed: 'Unspent money confirmed', unspentCleared: 'Unspent money cleared', emergencySaved: 'Emergency fund saved',
    emergencyRemoved: 'Emergency fund removed', accountUseSaved: 'Account use saved', paymentMarkedRegular: 'Marked regular · {{name}}',
    paymentDismissed: 'Marked not regular · {{name}}', paymentRestored: 'Not regular cleared · {{name}}', savingRaised: 'Regular saving raised',
    incomeTypeSaved: 'Income type saved', incomeTagged: 'Income tagged', refundLinked: 'Refund linked', refundUnlinked: 'Refund unlinked',
    answerSaved: 'Answer saved', answerRemoved: 'Answer removed', refineSnoozed: 'Check-in snoozed',
  };

  it('every 05.2 step has a key and its English text', () => {
    for (const [key, text] of Object.entries(expected)) {
      expect((UNDO_LABEL_KEYS as readonly string[]).includes(key)).toBe(true);
      expect((en.undo.label as Record<string, string>)[key]).toBe(text);
    }
  });

  it('the unnamed setup step has a fallback', () => {
    expect(undoLabelText('setupStepSaved', {})).toEqual({ key: 'undo.labelUnnamed.setupStepSaved', params: {} });
  });

  it('the strings pass the banned-word guard', () => {
    for (const text of Object.values(expected)) {
      expect(text).not.toMatch(/advice|recommend|you should/i);
    }
  });
});

describe('R18 money concepts copy (05-131, DCU-09)', () => {
  it('D-101 the pot and housing undo labels exist and resolve', () => {
    const expected: Record<string, string> = {
      potAdded: 'Pot added', potEdited: 'Pot edited', potDeleted: 'Pot deleted', potDone: 'Pot marked done', potReopened: 'Pot reopened',
      debtHousingChanged: 'Housing setting changed',
    };
    for (const [key, text] of Object.entries(expected)) {
      expect((UNDO_LABEL_KEYS as readonly string[]).includes(key)).toBe(true);
      expect((en.undo.label as Record<string, string>)[key]).toBe(text);
      expect(undoLabelText(key, {})).toEqual({ key: `undo.label.${key}`, params: {} });
    }
  });

});
