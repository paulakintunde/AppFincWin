// DCU-09 and the UI-SPEC banned list: FincWin is not a lender and the card path never reads as an offer.
import en from '../locales/en';
import { DRAFT_COPY_KEYS } from '../copyStatus';
import { UNDO_LABEL_KEYS } from '../../engine/undo/types';
import { undoLabelText } from '../undoLabel';
import { FACT_KEYS, FOOTER_KEY, MISSING_KEYS, NOTICE_KEYS, READINESS_KEYS, VERDICT_TABLE } from '../../engine/decide/v3/copy/verdictTable';

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
  'decide.quick.payWith', // field caption: "Pay with" Cash / Credit
  'decide.quick.error.retry', // button
  'decide.flow.retry', // button
  'decide.rough.save', // button
  'decide.setup.debtSheet.save', // button (05.2-38)
  'decide.lines.save', // button
  'decide.flow.saveClose', // button
  'decide.flow.commit.wait', // button: "Save the plan" commits the Wait decision the user chose
  'decide.scope.save', // button
  'decide.lineEditor.save', // button
  'decide.depth.changes.save', // button
  'decide.depth.cardMin.save', // button
  'decide.onboarding.skip', // button: skip this onboarding step
  'decide.onboarding.checkTitle', // invites the user to try the check itself, not a purchase
  'decide.delete.keep', // dialog choice: keep the record instead of deleting it
  'decide.verdict.key.putInCaption', // field caption: the key figure "Put in a month" (investing amount)
  'decide.pots.sheet.save', // button: "Save pot" (05-131, R18.7); "Try again" reuses decide.flow.retry
  // 05.2 (plan 20): setup controls and UI-SPEC titles that open with a verb. Each names an action in the app, not advice about money.
  'decide.setup.shell.skip', // button: skip this step
  'decide.accountUse.save', // button: "Save account use"
  'decide.accountUse.keep', // button: "Keep as is"
  'decide.emergencySheet.save', // button: "Save emergency fund"
  'decide.settings.save', // button: "Save answer"
  'decide.settings.keep', // button: "Keep as is"
  'decide.settings.resetKeep', // dialog choice: "Keep it" (cancels the reset)
  'decide.unspentSheet.keepAsIs', // button
  'decide.unspentSheet.keepRolled', // button: "Keep {{amount}}" (keeps the rolled-forward figure)
  'decide.unspentSheet.saveFigure', // button
  'decide.setup.loans.kindBnpl', // loan kind name: "Buy now, pay later"
  'decide.setup.saving.optionFixedDesc', // UI-SPEC wording describing what a Fixed saving is: "Keep it going, like a bill."
  'decide.setupPage.labelArrivals', // readout label: "Pay arrivals saved" (a noun phrase)
  'income.method.optionSteady', // choice-card title: "Pay myself a steady amount."
  'activity.incomeTag.save', // button: "Save income type"
  'activity.refund.emptyBody', // empty-search hint, UI-SPEC wording: "Try a payee name or an amount."
]);
// 2026-10-23 walkthrough: sentences, hints and placeholders are declarative ("A price comes first"), never an order to the
// user ("Add a price to continue", "Type the rate"). Buttons, dialog titles and field captions that name an action in the
// app are listed by key; any other string that opens with an instruction verb fails.
const INSTRUCTION_LEAD = /^(Add|Type|Choose|Pick|Enter|Switch|Move|Tap|Change (it|any|the))\b/;
const CONTROL_LABELS = new Set([
  'decide.home.noFigures.addRough', // button
  'decide.setup.debtSheet.titleAdd', // sheet title (05.2-38), same wording as loans.addCaption
  'decide.lineEditor.titleAdjust', // sheet title
  'decide.lineEditor.titleRunning', // sheet title
  'decide.lineEditor.titleReplaces', // sheet title
  'decide.lineEditor.titleSetback', // sheet title
  'decide.lineEditor.titleFee', // sheet title
  'decide.past.pickTitle', // sheet title
  'decide.depth.changes.addTitle', // sheet title
  'decide.section.optSwitchWait', // button
  'decide.flow.commit.none', // disabled primary button label
  'decide.hint.foldTap', // reveal hint named in UI-SPEC as a control
  // 05-110 (R17.6): UI controls on the keyed list; none is a prescription about money
  'decide.home.field.check', // button: "Check it"
  'decide.home.field.full', // text link: "Full check"
  'decide.home.field.fullA11y', // the same link's accessibility label
  'decide.home.problems.failedAction', // action: "Review changes"
  'decide.home.problems.conflictAction', // action: "Review edits"
  'decide.home.problems.noMonth.action', // action: "Add rough figures"
  'decide.home.unavailable.addRough', // button: "Add rough figures"
  'decide.home.rows.changesAdd', // row that adds a change: "Add a change coming up"
  'decide.home.problems.rate.action', // action: "Exchange rates"
  'decide.home.problems.stale.action', // action: "Exchange rates"
  'decide.home.problems.cardMin.action', // action: "Card minimum payment"
  // 05-131 (R18.7): the Pots screen controls
  'decide.pots.emptyAction', // button: "Add a pot"
  'decide.pots.addA11y', // accessibility label of the "+ Pot" link: "Add a pot"
  // 05.2 (plan 20): setup controls, captions and UI-SPEC sentences. Every one is a button, link, caption or step intro named in
  // 05.2-UI-SPEC.md; none tells the user what to do with money.
  'decide.setup.regular.addTitle', // sheet title
  'decide.setup.regular.emptyBody', // empty-state body, UI-SPEC wording
  'decide.setup.loans.addCaption', // field caption: "Add a loan or card"
  'decide.setup.saving.readinessNoGoal', // readiness line, UI-SPEC wording
  'decide.setup.saving.readinessNoMonthly', // readiness line, UI-SPEC wording
  'decide.setup.everyday.changeIt', // button: "Change it"
  'decide.setup.unusual.intro', // step intro, UI-SPEC wording
  'decide.setup.accountUse.choose', // answer line on an unanswered row, UI-SPEC wording
  'decide.setup.emergency.chooseAccount', // row value: "Choose an account"
  'income.paid.intro', // step intro: "Choose all that apply."
  'income.method.intro', // step intro: "Pick the one that fits you. Nothing is chosen for you."
  'income.other.intro', // step intro: "Choose all that apply, or None."
]);
const BANNED = [/\badvice\b/i, /\badvis/i, /recommend/i, /you should/i, /we suggest/i, /best option/i, /guaranteed/i, /\bapproved\b/i, /pre-approved/i, /\boffer/i, /apply for/i, /\blender\b/i, /loan offer/i, /interest-free/i];

// Demo-scale values (05-18 demo: income $4,400 a month, car loan over 48 months). Four-digit amounts are the widest a
// demo month shows; `already` < `short` by meaning ("already X short. This makes it Y"); 'average' is the longer basis
// word; 100 months against the 60-month maximum credit horizon is the longest past-horizon pair the demo can produce.
const DEMO_VALUES: Record<string, string> = { amount: '$1,234', short: '$1,234', already: '$412', left: '$1,234', pct: '41%', basis: 'average', count: '100', horizon: '60', payment: '$302.08' }; // payment: a demo-scale monthly payment with cents (D-54)
const TITLE_CAP = 64; // UI-SPEC: title at most 3 heading lines at 402 ("about 64 characters")
const REASON_CAP = 44; // UI-SPEC: each suppression reason <= 44 characters, one meta line
const QUICK_NEW_CAP = 64;
// UI-SPEC conflict (05-02 revision): titleInvBoth is 65 characters before its amount, so no amount fits 64.
// The string is locked, so it is capped at 72 here and its three-line fit is checked on device in 05-26.
const TITLE_CAP_EXCEPTIONS: Record<string, number> = { 'decide.verdict.titleInvBoth': 72 };

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

  it('D-95 the R17 controls are on the keyed list and read as the spec words them', () => {
    const words: Record<string, string> = {
      'decide.home.field.check': 'Check it', 'decide.home.field.full': 'Full check', 'decide.home.problems.failedAction': 'Review changes',
      'decide.home.problems.conflictAction': 'Review edits', 'decide.home.unavailable.addRough': 'Add rough figures',
      'decide.home.problems.rate.action': 'Exchange rates', 'decide.home.problems.cardMin.action': 'Card minimum payment',
    };
    for (const [path, text] of Object.entries(words)) {
      expect(get(path)).toBe(text);
      expect(CONTROL_LABELS.has(path)).toBe(true);
    }
    const home = leaves.filter((l) => l.path.startsWith('decide.home.') && !CONTROL_LABELS.has(l.path));
    expect(home.filter((l) => INSTRUCTION_LEAD.test(l.value) || IMPERATIVE_LEAD.test(l.value)).map((l) => l.path)).toEqual([]);
  });

  it('names no tab that does not exist (Grow)', () => {
    expect(leaves.filter((l) => /\bGrow\b/.test(l.value)).map((l) => l.path)).toEqual([]);
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

  it('uses the word lend only in the not-a-lender footers', () => {
    // decide.setup.summary.footer is the Summary footer worded by the owner (05.2-UI-SPEC decision 2); it denies lending.
    expect(copyLeaves.filter((l) => /lend/i.test(l.value)).map((l) => l.path).sort()).toEqual(['decide.flow.notLender', 'decide.setup.summary.footer']);
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

describe('decide copy length caps', () => {
  const titles = leaves.filter((l) => l.path.startsWith('decide.verdict.title'));
  const reasons = leaves.filter((l) => l.path.startsWith('decide.alt.reason'));

  it('has no exception beyond titleInvBoth', () => {
    expect(Object.keys(TITLE_CAP_EXCEPTIONS)).toEqual(['decide.verdict.titleInvBoth']);
  });

  it.each(titles)('verdict title fits three lines: $path', ({ path, value }) => {
    expect(interpolate(value).length).toBeLessThanOrEqual(TITLE_CAP_EXCEPTIONS[path] ?? TITLE_CAP);
  });

  it.each(reasons)('alternatives reason fits one line: $path', ({ value }) => {
    expect(interpolate(value).length).toBeLessThanOrEqual(REASON_CAP);
  });

  it.each(leaves.filter((l) => l.path.startsWith('decide.verdict.missing.')))('missing title fits: $path', ({ value }) => {
    expect(interpolate(value).length).toBeLessThanOrEqual(TITLE_CAP);
  });

  it('missing-rate title fits with two currencies', () => {
    expect(interpolate(get('decide.missingRate.title'), { currency: 'EUR, GBP' }).length).toBeLessThanOrEqual(TITLE_CAP);
  });

  it.each(['cashDip', 'cashDipHard', 'creditCashDip', 'creditCashDipHard'])('quick line %s fits', (key) => {
    expect(interpolate(get(`decide.quick.line.${key}`)).length).toBeLessThanOrEqual(QUICK_NEW_CAP);
  });
});

describe('decide depth copy (05-31, DCU-09)', () => {
  const depth = leaves.filter((l) => l.path.startsWith('decide.depth.'));
  const INVESTING_BANNED = ['invest now', 'start investing', 'best rate', 'you will earn', 'you should invest'];

  it('has depth leaves', () => {
    expect(depth.length).toBeGreaterThan(150);
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
    expect(withForecast.length).toBeGreaterThan(0);
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

  it('keeps the combined-check line within the verdict body cap at nine checks', () => {
    expect(interpolate(get('decide.depth.combined.differs_other'), { count: '9' }).length).toBeLessThanOrEqual(64);
  });

  it('starts every cushion reason with because', () => {
    const because = depth.filter((l) => l.path.startsWith('decide.depth.cushion.because.'));
    expect(because.length).toBe(4);
    for (const l of because) expect(l.value.startsWith('because')).toBe(true);
  });
});

describe('decide v3 verdict copy (05.1-23, I22, I26)', () => {
  const v3 = leaves.filter((l) => l.path.startsWith('decide.v3.'));
  const V3_BANNED = [/\bshould\b/i, /\bapprove/i, /\bdecline/i, /\bgo ahead\b/i, /\byou can\b/i, /\bsafe\b/i, /\bfree\b/i, /\bbest\b/i, /\bbetter\b/i, /\bworth it\b/i, /\bwill run out\b/i];
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
      // Context variants chosen by the UI (05.1-33): not engine codes, so no table maps them.
      'decide.v3.notice.income_from_expected_confirmed',
      'decide.v3.notice.income_from_expected_last_year',
      'decide.v3.notice.income_from_expected_low',
      'decide.v3.missing.account_use_question_fund',
      // Variants chosen by the UI (05.1-40)
      'decide.v3.fact.emergency_used_rebuild',
      'decide.v3.fact.line_crossed_percent',
      'decide.v3.fact.line_crossed_money',
      'decide.v3.fact.line_crossed_tenths',
      'decide.v3.notice.month_heading_short_category',
      FOOTER_KEY,
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

  it('v3 4.6 forecasts say could, based on your records or on track', () => {
    const forecastBodies = ['fitsMonth', 'fitsMonthLowMonth', 'fitsUnspentLowMonth', 'notYetPayday', 'notYetNotCovered', 'monthlyShort', 'emergencyUse'];
    for (const name of forecastBodies) {
      expect(get(`decide.v3.verdict.${name}.body`)).toMatch(/\bcould\b|based on your records|on track/i);
    }
  });

  it('v3 verdict titles fit three lines', () => {
    for (const l of v3.filter((x) => /^decide\.v3\.verdict\.\w+\.title$/.test(x.path))) {
      expect(interpolate(l.value, V3_DEMO).length).toBeLessThanOrEqual(TITLE_CAP);
    }
  });

  it('v3 leaves are draft copy and the footer reads as the owner worded it', () => {
    const drafts = new Set<string>(DRAFT_COPY_KEYS);
    expect(v3.filter((l) => !drafts.has(l.path)).map((l) => l.path)).toEqual([]);
    expect(drafts.has('legal.decideFooter')).toBe(true);
    expect(en.legal.decideFooter).toBe('Worked out from your own records and what you told us. FincWin is a record-keeping and planning tool.');
    expect(en.legal.decideFooter).not.toMatch(/\badvice\b|recommend|you should/i);
  });

  it('D-30 and D-32 notices exist', () => {
    expect(get('decide.v3.notice.unspent_drifted')).toContain('{{suggested}}');
    expect(get('decide.v3.notice.from_your_figures')).toBe('Worked out from the figures you gave.');
  });
});

describe('05.2 undo labels (DSU-21, DCU-09)', () => {
  const expected: Record<string, string> = {
    setupStepSaved: '{{name}}', setupReset: 'reset of Decide setup', incomeSetupSaved: 'income setup',
    unspentConfirmed: 'unspent money', unspentCleared: 'unspent money', emergencySaved: 'emergency fund',
    emergencyRemoved: 'emergency fund', accountUseSaved: 'account use', paymentMarkedRegular: 'regular payment',
    paymentDismissed: 'regular payment', savingRaised: 'regular saving', incomeTypeSaved: 'income type',
    incomeTagged: 'income type', refundLinked: 'refund link', refundUnlinked: 'refund link',
    answerSaved: 'answer', answerRemoved: 'answer', refineSnoozed: 'check-in',
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
  const r18 = leaves.filter(
    (l) =>
      /^decide\.(pots|housing|verdict\.tco|verdict\.invested)\./.test(l.path) ||
      /^decide\.warn\.housing/.test(l.path) ||
      /^decide\.info\.(netFreeCashFlow|pots|totalCost|housingLine|investedInstead)\./.test(l.path) ||
      /^decide\.(home\.hero\.sub(Worst|Average|Tightest|Figures|Switched)|home\.monthDetails\.|lines\.housing\.|verdict\.titleHousing)/.test(l.path)
  );

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

  it('DCU-09 the R18 strings pass the guard apart from Save pot on the keyed list', () => {
    expect(r18.length).toBeGreaterThan(100);
    expect(get('decide.pots.sheet.save')).toBe('Save pot');
    expect(ACTION_LABELS.has('decide.pots.sheet.save')).toBe(true);
    expect(get('decide.pots.emptyAction')).toBe('Add a pot');
    expect(get('decide.pots.addA11y')).toBe('Add a pot');
    expect(CONTROL_LABELS.has('decide.pots.emptyAction') && CONTROL_LABELS.has('decide.pots.addA11y')).toBe(true);
    // "Try again" reuses the shared retry key: no pots retry key exists
    expect(() => get('decide.pots.retry')).toThrow();
    const bad = r18.filter(
      (l) =>
        BANNED.some((re) => re.test(l.value)) ||
        REASSURING.some((re) => re.test(l.value)) ||
        (!ACTION_LABELS.has(l.path) && IMPERATIVE_LEAD.test(l.value)) ||
        (!CONTROL_LABELS.has(l.path) && INSTRUCTION_LEAD.test(l.value))
    );
    expect(bad.map((l) => l.path)).toEqual([]);
    for (const l of r18) expect(l.value).not.toMatch(/\b(lender|you should|advice|recommend)/i);
  });

  it('DCU-09 Invested instead is not an imperative lead', () => {
    const row = get('decide.verdict.invested.year_other');
    expect(row.startsWith('Invested instead:')).toBe(true);
    expect(row).not.toMatch(IMPERATIVE_LEAD);
    expect('Invest the difference').toMatch(IMPERATIVE_LEAD);
  });
});
