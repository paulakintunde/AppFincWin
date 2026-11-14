// 06.1-59 (G-10, owner decision 4, T-06.1-59-01/02): the one-line budget on Decide home. For each card, at most one sentence shows
// before any Why? or More is opened. A sentence is text that ends in ".", "?" or "!" and is not a title (header), a control's own
// words (button, link, radio), a figure, or the legal line. Then every Why?/More is opened and each moved sentence must show: no
// fact is removed, only moved one tap away. The legal line is never behind a disclosure.
import React from 'react';
import { fireEvent, screen, within } from '@testing-library/react-native';
import type { TestInstance as ReactTestInstance } from 'test-renderer';
import { judgeCheck, monthPicture, pastMonthBars, prepare, toStoredV2, type CheckV2, type MonthPicture, type ReadinessItem } from '@/engine/decide/v3';
import { checkOnce, checkPlan, inputsOf, monthOf, v3Line, v3Series } from '@/engine/decide/v3/__tests__/helpers/fixtures';
import { minorUnits } from '@/engine/money';
import { home } from '@/i18n/locales/decideScreens/home';
import { setup } from '@/i18n/locales/decideScreens/setup';
import { sheetsHome } from '@/i18n/locales/decideScreens/sheetsHome';
import { answer } from '@/i18n/locales/decideScreens/answer';
import { sheetsInput } from '@/i18n/locales/decideScreens/sheetsInput';
import { stepper } from '@/i18n/locales/decideScreens/stepper';
import { wrap } from '@/test/stepProps';
import { safetyNet } from '@/i18n/locales/decideScreens/safetyNet';
import { setupOthers } from '@/i18n/locales/decideScreens/setupOthers';
import { CostsStep } from '../check/CostsStep';
import { SafetyNetSettings } from '../safetyNet/SafetyNetSettings';
import { QuickEstimatesScreen } from '../setup/QuickEstimatesScreen';
import { RecordsSetup } from '../setup/items/RecordsSetup';
import { PriceStep } from '../check/PriceStep';
import { DecideHome } from '../home/DecideHome';
import { NotReadyCard } from '../answer/StatusCards';
import { readinessFixRows } from '../logic/readinessFixes';
import { setupProgress, type SetupFacts } from '../logic/setupProgress';
import { resetSetupBannerSession, SetupBanner } from '../setup/SetupBanner';

jest.setTimeout(60000);

let mockProgress: unknown = null;
let mockPicture: MonthPicture | null = null;
let mockBars: ReturnType<typeof pastMonthBars> = [];
let mockInputs: unknown = null;
const mockPush = jest.fn();

jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn(), hapticLight: jest.fn(), hapticWarning: jest.fn() }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC' }) }));
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    useRouter: () => ({ push: mockPush, setParams: jest.fn() }),
    useLocalSearchParams: () => ({}),
    useIsFocused: () => true,
    // 06.1-60: the stepper steps navigate through `router` and register Back while focused.
    router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: () => true, dismissTo: jest.fn() },
    useFocusEffect: (cb: () => void | (() => void)) => useEffect(cb, [cb]),
  };
});
jest.mock('@/shell/fab/FabProvider', () => ({ useHideFab: () => undefined }));
jest.mock('@/shell/screen/TabRootScreen', () => {
  const R = jest.requireActual('react');
  const { View, Text: RNText } = jest.requireActual('react-native');
  return {
    TabRootScreen: (p: { title: string; children?: React.ReactNode; overlay?: React.ReactNode }) =>
      R.createElement(View, null, R.createElement(RNText, { accessibilityRole: 'header' }, p.title), p.children, p.overlay),
  };
});
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', region: 'US', today: '2026-10-03' }),
}));
// 06.1-79 (DS-10): home's months count reads the evaluation the answer's basis line reads.
let mockV3Evaluation: unknown = null;
jest.mock('@/data/queries/decideV3', () => ({ useDecideV3: () => ({ status: 'ready', inputs: mockInputs, evaluation: mockV3Evaluation, refetch: jest.fn() }) }));
jest.mock('@/data/queries/categories', () => ({ useCategories: () => ({ data: [] }) }));
jest.mock('@/data/sync/useIsOnline', () => ({ useIsOnline: () => true }));
jest.mock('../engine/useMonthPicture', () => ({ useMonthPicture: () => ({ picture: mockPicture, bars: mockBars }) }));
jest.mock('../home/useNewCheck', () => ({ ...jest.requireActual('../home/useNewCheck'), useNewCheck: () => ({ pending: false, start: jest.fn() }) }));
jest.mock('../home/useHomeCards', () => ({
  useOpenCheckRows: () => ({ rows: [], checks: [] }),
  useMoneyRules: () => ({ dsrLine: null, doc: { v: 1, rules: [] }, save: jest.fn() }),
  useRuleCrossings: () => () => [],
}));
jest.mock('../past/data/usePastDecisions', () => ({
  usePastDecisions: () => ({ decisions: [], linesByCheck: new Map(), ctx: {} }),
  deltaFor: () => null,
  usePastContext: () => ({ userId: 'u1', householdId: 'h1' }), // 06.1-60: safety-net settings
}));
jest.mock('@/features/decide/hints/decideHints', () => ({ loadSetupDoneSeen: async () => true, markSetupDoneSeen: async () => undefined }));
let mockSetupFacts: SetupFacts | null = null;
jest.mock('../setup/useSetupProgress', () => ({
  useSetupProgress: () => mockProgress,
  // 06.1-60: Records reads the same facts.
  useSetupFacts: () => ({ loading: mockSetupFacts === null, facts: mockSetupFacts, currency: 'USD', today: '2026-11-20', retry: jest.fn() }),
}));
jest.mock('../home/SomethingChanged', () => ({ SomethingChanged: () => null }));
jest.mock('../home/RuleEditSheet', () => ({ RuleEditSheet: () => null }));
jest.mock('../home/AddRuleSheet', () => ({ AddRuleSheet: () => null }));
jest.mock('../home/OpenCheckSheet', () => ({ OpenCheckSheet: () => null }));
jest.mock('../sheets/DatePickerSheet', () => ({ DatePickerSheet: () => null }));
jest.mock('../sheets/InstallmentPlanSheet', () => ({ InstallmentPlanSheet: () => null }));
// 06.1-60: the stepper steps read their stored check and the engine at the query/mutation edge.
let mockStepRow: { id: string; name: string; inputs: unknown; furthest_step: number } | null = null;
let mockEvaluation: unknown = null;
jest.mock('@/data/queries/decide', () => ({
  useDecideChecks: () => ({ data: mockStepRow === null ? [] : [mockStepRow], isLoading: false }),
  useDebts: () => ({ data: [] }),
  useDecideSettings: () => ({ data: null }),
}));
// 06.1-60: Records, quick estimates and safety-net settings, mocked at the query/mutation edge as their own suites do.
let mockGoalRows: unknown[] = [];
jest.mock('@/data/queries/growGoals', () => ({ useSavingsGoalRows: () => ({ data: mockGoalRows }) }));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [] }) }));
jest.mock('@/data/queries/decideAnswers', () => ({ useDecideAnswers: () => ({ data: [] }) }));
jest.mock('@/data/mutations/decideAnswers', () => ({ useSaveDecideAnswer: () => ({ save: jest.fn() }), useRemoveDecideAnswer: () => ({ remove: jest.fn() }) }));
jest.mock('@/data/mutations/accountUse', () => ({ useSaveAccountUse: () => ({ save: jest.fn() }) }));
jest.mock('@/data/mutations/decideSetup', () => ({ useSaveSetupStep: () => ({ save: jest.fn() }) }));
jest.mock('@tanstack/react-query', () => ({ ...jest.requireActual('@tanstack/react-query'), useQueryClient: () => ({ getQueriesData: () => [] }) }));
jest.mock('@/features/grow/goals/useGoalsRead', () => ({
  useGoalsRead: () => ({ status: 'ready', model: { safetyNet: { size: 230000, saved: 130000 } }, refetch: jest.fn() }),
}));
jest.mock('@/features/grow/home/useGoalMoney', () => ({ useGoalMoney: () => ({ amount: (n: number) => `$${n / 100}` }) }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
jest.mock('@/features/record/accounts/AccountUseSheet', () => ({ AccountUseSheet: () => null }));
jest.mock('../sheets/EnvelopeAccountSheet', () => ({ EnvelopeAccountSheet: () => null }));
jest.mock('@/shell/screen/DetailScreen', () => {
  const R = jest.requireActual('react');
  const { View, Text: RNText } = jest.requireActual('react-native');
  return {
    DetailScreen: (p: { title: string; children?: React.ReactNode }) =>
      R.createElement(View, { testID: 'detail-screen' }, R.createElement(RNText, { accessibilityRole: 'header' }, p.title), p.children),
  };
});
jest.mock('@/data/mutations/decideChecks', () => ({
  useSaveCheckDraft: () => ({ save: jest.fn() }),
  useCreateCheck: () => ({ create: jest.fn(), pendingIds: [], pendingRows: [] }),
}));
jest.mock('../engine/useCheckEngine', () => ({ useCheckEngine: () => ({ evaluation: mockEvaluation, readyDate: () => null }) }));
jest.mock('../sheets/QuickEstimateSheet', () => ({ QuickEstimateSheet: () => null }));

const LEGAL = 'FincWin is a planning tool, not a lender.';
/** Words that belong to a control or a title, not to the card's running text. */
const LABEL_ROLES = new Set(['button', 'link', 'radio', 'header', 'tab', 'checkbox', 'switch']);

function textOf(n: ReactTestInstance): string {
  return n.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
}

/** The sentences drawn under `root`, outside titles and control labels, without the legal line. */
function sentencesIn(root: ReactTestInstance): string[] {
  const out: string[] = [];
  const walk = (n: ReactTestInstance, skip: boolean): void => {
    const role: unknown = n.props?.accessibilityRole;
    const inLabel = skip || (typeof role === 'string' && LABEL_ROLES.has(role));
    if (n.type === 'Text') {
      if (!inLabel) out.push(...textOf(n).split(/(?<=[.?!])\s+/).map((s) => s.trim()).filter((s) => /[.?!]$/.test(s)));
      return;
    }
    for (const c of n.children) if (typeof c !== 'string') walk(c, inLabel);
  };
  walk(root, false);
  return out.filter((s) => !LEGAL.includes(s));
}

const sentences = (testID: string): string[] => sentencesIn(screen.getByTestId(testID));

/** Pay 3,000 a month, rent 1,200 and everyday spending over three full months (the decideHome fixture). */
function engineFixture() {
  const months = ['2026-07', '2026-08', '2026-09'].map((m) =>
    monthOf(m, [
      v3Line({ id: `p-${m}`, date: `${m}-25`, amount: 300_000, role: 'income', seriesId: 'pay' }),
      v3Line({ id: `r-${m}`, date: `${m}-10`, amount: 120_000, role: 'spending', seriesId: 'rent' }),
      v3Line({ id: `e-${m}`, date: `${m}-12`, amount: m === '2026-08' ? 200_000 : 100_000 }),
    ]),
  );
  const inputs = inputsOf({
    months: [...months, monthOf('2026-10', [], { full: false })],
    series: [
      v3Series({ id: 'pay', role: 'pay', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-01-25', amount: 300_000 }),
      v3Series({ id: 'rent', role: 'bill', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-01-10', amount: 120_000 }),
    ],
    balance: minorUnits(400_000),
    recordsAsOf: '2026-10-01',
  });
  return { inputs, prepared: prepare(inputs) };
}

const TODAY = '2026-11-20';
const NONE: SetupFacts = {
  hasPay: false, payAmountMinor: null, payDay: null,
  billsRightAnswered: false, billsCount: 0, billsMonthlyMinor: 0,
  debts: [], noDebtsAnswered: false,
  netSizeMinor: null, netNotSetAnswered: false,
  rulesOn: 0, noRulesAnswered: false,
  lastMonthComplete: false, newestEntryThisMonth: null, accountsAllHaveUse: false, recordsUpTo: '2026-11-15',
  readinessOpen: 0, readinessFirst: null,
};
const FOUR: SetupFacts = {
  ...NONE, hasPay: true, payAmountMinor: 250000, payDay: 25, billsRightAnswered: true, billsCount: 3, billsMonthlyMinor: 120000,
  netNotSetAnswered: true, rulesOn: 2, debts: [{ name: 'Visa card', dueDay: null }],
};
const ALL: SetupFacts = {
  ...NONE, hasPay: true, payAmountMinor: 250000, payDay: 25, billsRightAnswered: true, noDebtsAnswered: true, netNotSetAnswered: true,
  noRulesAnswered: true, lastMonthComplete: true, accountsAllHaveUse: true, newestEntryThisMonth: TODAY,
};
const itemName = (id: string): string => ({ pay: 'Pay and payday', bills: 'Regular bills', debts: 'Debts', net: 'Safety net', rules: 'Your money rules', records: 'Records' })[id] ?? id;

beforeEach(() => {
  jest.clearAllMocks();
  resetSetupBannerSession();
  mockProgress = { items: [], doneCount: 0, next: 'pay', allDone: false, loading: false, currency: 'USD', today: '2026-10-03' };
  mockStepRow = null;
  mockEvaluation = null;
  mockSetupFacts = null;
  mockGoalRows = [];
  const { inputs, prepared } = engineFixture();
  mockInputs = inputs;
  mockV3Evaluation = judgeCheck(prepared, checkOnce(10_000));
  mockPicture = monthPicture(prepared);
  mockBars = pastMonthBars(prepared);
});

async function renderHome(): Promise<void> {
  await wrap(<DecideHome />);
  await screen.findByTestId('home-header');
}

describe('one short line per card on Decide home (06.1-59, G-10)', () => {
  it('header: the title stays; the subtitle opens under Why?', async () => {
    await renderHome();
    expect(screen.getByText(home.title)).toBeTruthy();
    expect(sentences('home-header')).toEqual([]);
    expect(screen.queryByText(home.subtitle)).toBeNull();
    await fireEvent.press(screen.getByTestId('home-why'));
    expect(within(screen.getByTestId('home-header')).getByText(home.subtitle)).toBeTruthy();
  });

  it('setup banner: one sentence in each state; the started row names the next item on its tap', async () => {
    const onStart = jest.fn();
    const ui = (facts: SetupFacts) => <SetupBanner progress={setupProgress(facts, TODAY)} onStart={onStart} onCheckFirst={jest.fn()} setupDoneSeen={false} itemName={itemName} />;

    // New: the title, one sentence, and the second sentence behind Why?.
    const view = await wrap(ui(NONE));
    expect(sentences('setup-banner-new')).toHaveLength(1);
    expect(screen.queryByText(setup.banner.newWhy)).toBeNull();
    await fireEvent.press(screen.getByTestId('setup-banner-why'));
    expect(screen.getByText(setup.banner.newWhy)).toBeTruthy();

    // Started: "Decide setup · 4 of 6 done" and the bar; no "Next …" line. The tap opens the next item; the spoken label names it.
    await view.rerender(ui(FOUR));
    expect(sentences('setup-banner-row')).toEqual([]);
    expect(screen.getByText('Decide setup · 4 of 6 done')).toBeTruthy();
    expect(screen.queryByText(/^Next:/)).toBeNull();
    expect(screen.getByTestId('setup-banner-row').props.accessibilityLabel).toContain('Next: Debts');
    await fireEvent.press(screen.getByTestId('setup-banner-row'));
    expect(onStart).toHaveBeenCalledWith('debts');
  });

  it('setup banner done note: a title over one sentence', async () => {
    await wrap(<SetupBanner progress={setupProgress(ALL, TODAY)} onStart={jest.fn()} onCheckFirst={jest.fn()} setupDoneSeen={false} itemName={itemName} />);
    expect(sentences('setup-banner-done')).toEqual([setup.banner.doneSub]);
  });

  it('check card price: "Tax not added" stays; the reason opens under Why?', async () => {
    await renderHome();
    expect(screen.getByTestId('check-tax-note')).toHaveTextContent(home.check.taxNotIncluded);
    expect(sentences('check-price-group').length).toBeLessThanOrEqual(1);
    expect(screen.queryByText(home.check.taxWhy)).toBeNull();
    await fireEvent.press(screen.getByTestId('check-tax-why'));
    expect(within(screen.getByTestId('check-price-group')).getByText(home.check.taxWhy)).toBeTruthy();
  });

  it('Your month: the headline stays; the explainer, the records row and the usual/low switch open under More', async () => {
    await renderHome();
    expect(sentences('your-month-card').length).toBeLessThanOrEqual(1);
    expect(screen.getByTestId('month-lead')).toBeTruthy();
    expect(screen.queryByText(home.month.explainUsual)).toBeNull();
    expect(screen.queryByTestId('month-records')).toBeNull();
    expect(screen.queryByTestId('month-basis')).toBeNull();
    await fireEvent.press(screen.getByTestId('month-more'));
    const card = within(screen.getByTestId('your-month-card'));
    expect(card.getByText(home.month.explainUsual)).toBeTruthy();
    expect(card.getByText(/^Records up to /)).toBeTruthy();
    expect(card.getByText(home.month.usual)).toBeTruthy();
    expect(card.getByText(home.month.low)).toBeTruthy();
  });

  it('Your money rules: the title stays; the intro opens under Why?', async () => {
    await renderHome();
    expect(sentences('money-rules-card')).toEqual([]);
    expect(within(screen.getByTestId('money-rules-card')).getByText(sheetsHome.rulesCard.title)).toBeTruthy();
    expect(screen.queryByText(sheetsHome.rulesCard.sub)).toBeNull();
    await fireEvent.press(screen.getByTestId('money-rules-why'));
    expect(within(screen.getByTestId('money-rules-card')).getByText(sheetsHome.rulesCard.sub)).toBeTruthy();
  });

  it('footer: the legal line always shows; the sources sentence is in the "How this was worked out" sheet', async () => {
    await renderHome();
    expect(sentences('home-footer')).toEqual([]);
    expect(within(screen.getByTestId('home-footer')).getByText(LEGAL)).toBeTruthy();
    expect(screen.queryByText(/^Answers use /)).toBeNull();
    await fireEvent.press(screen.getByTestId('home-footer-worked'));
    const note = await screen.findByTestId('worked-note');
    expect(note).toHaveTextContent(`${home.footerRecords} ${home.footerUpdates}`);
    expect(screen.getAllByText(answer.worked.title).length).toBe(2); // the footer row and the sheet's title
    // the legal line is still on the home under the open sheet
    expect(within(screen.getByTestId('home-footer')).getByText(LEGAL)).toBeTruthy();
  });

  it('Not ready card: one sentence in view; "More may follow" opens under its More row (06.1-67)', async () => {
    const item: ReadinessItem = {
      kind: 'bill', code: 'past_month_missing', month: '2026-10', seriesId: 's-net', envelopeId: null, lineId: 'l-net', name: 'Netflix',
      amount: minorUnits(1199), date: '2026-10-03',
    } as ReadinessItem;
    await wrap(
      <NotReadyCard
        rows={readinessFixRows([item], '2026-11-05')}
        canUseEstimates={false}
        asOf="2026-11-05"
        money={(m: number) => `$${(m / 100).toFixed(2)}`}
        date={(d: string) => d}
        monthName={(ym: string) => ym}
        onFix={jest.fn()}
        onChoice={jest.fn()}
        onFinishSetup={jest.fn()}
        onFromEstimates={jest.fn()}
      />,
    );
    await screen.findByTestId('answer-not-ready');
    const shown = sentences('answer-not-ready');
    expect(shown.length).toBeLessThanOrEqual(1);
    expect(shown[0]).toMatch(/^First: Netflix/);
    expect(shown).not.toContain(answer.notReady.moreMayFollow);
    await fireEvent.press(screen.getByTestId('answer-not-ready-more'));
    expect(await screen.findByText(answer.notReady.moreMayFollow)).toBeTruthy();
  });
});

// 06.1-60 (G-10 part 2, owner decision 4): the rest of section D. Same rule: at most one sentence before anything is opened, then
// every moved sentence shows once its Why?/More is opened. NeedLines (plan 52) explain a disabled button and stay in view; they are
// not card prose, so they are left out of the count.
const STEP_ID = '11111111-1111-4111-8111-111111111111';
const isNeedLine = (n: ReactTestInstance): boolean => typeof n.props?.testID === 'string' && /need/.test(n.props.testID as string);

/** sentencesIn, leaving out NeedLines. */
function proseIn(root: ReactTestInstance): string[] {
  const found: ReactTestInstance[] = [];
  const walk = (n: ReactTestInstance): void => {
    if (isNeedLine(n)) found.push(n);
    for (const c of n.children) if (typeof c !== 'string') walk(c);
  };
  walk(root);
  const needs = found.flatMap((n) => textOf(n).split(/(?<=[.?!])\s+/).map((x) => x.trim()));
  return sentencesIn(root).filter((x) => !needs.includes(x));
}
const prose = (testID: string): string[] => proseIn(screen.getByTestId(testID));

function seedStep(name: string, check: CheckV2): void {
  mockStepRow = { id: STEP_ID, name, inputs: toStoredV2(check), furthest_step: 3 };
  mockInputs = { currency: 'USD', region: 'US', regionSubdivision: 'CA', series: [], debts: [] };
}

describe('one short line on the big-buy path (06.1-60, G-10 part 2)', () => {
  it('PriceStep: "Price and how you pay" stays; the reason, the tax sub-lines and "The answer shows both…" open under Why?', async () => {
    seedStep('Laptop', checkOnce(120_000));
    await wrap(<PriceStep id={STEP_ID} />);
    expect(await screen.findByText(stepper.price.title)).toBeTruthy();
    // The pay card's own question is the one sentence left in view.
    expect(prose('step-frame')).toEqual([stepper.price.howPay]);
    for (const moved of [stepper.price.why, stepper.price.includesTaxSub, stepper.price.taxCheck, stepper.price.howPaySub]) expect(screen.queryByText(moved)).toBeNull();
    await fireEvent.press(screen.getByTestId('step-why'));
    expect(screen.getByText(stepper.price.why)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('tax-why'));
    expect(within(screen.getByTestId('price-card')).getByText(stepper.price.includesTaxSub)).toBeTruthy();
    expect(within(screen.getByTestId('price-card')).getByText(stepper.price.taxCheck)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('pay-why'));
    expect(within(screen.getByTestId('pay-card')).getByText(stepper.price.howPaySub)).toBeTruthy();
    expect(screen.getByText(LEGAL)).toBeTruthy();
  });

  it('PriceStep on a plan: the up-front note opens under Why?; a NeedLine stays in view and is not counted', async () => {
    seedStep('Laptop', checkPlan(0));
    await wrap(<PriceStep id={STEP_ID} />);
    await fireEvent(await screen.findByLabelText(stepper.price.price), 'blur');
    expect(screen.getByTestId('price-need')).toBeTruthy();
    expect(prose('step-frame')).toEqual([stepper.price.howPay]);
    expect(screen.queryByText(stepper.price.planUpFrontNote)).toBeNull();
    await fireEvent.press(screen.getByTestId('up-front-why'));
    expect(within(screen.getByTestId('up-front-card')).getByText(stepper.price.planUpFrontNote)).toBeTruthy();
  });

  it('CostsStep: "About … a month" with the usual-to-usual line in view; the three notes open under one More; the legend shows once', async () => {
    seedStep('Used car', checkOnce(600_000));
    mockEvaluation = { purchase: null, result: { afterBuy: { usualMonth: minorUnits(30_000) } } };
    await wrap(<CostsStep id={STEP_ID} />);
    const total = await screen.findByTestId('costs-total');
    expect(within(total).getByText(/^About \$[\d,]+ a month$/)).toBeTruthy();
    const after = textOf(within(total).getByTestId('costs-total-after'));
    // The kept second line (06.1-55's usual-to-usual figures) is the only running text in view.
    expect(prose('step-frame')).toEqual(after.split(/(?<=[.?!])\s+/));
    for (const moved of [stepper.running.sub, stepper.running.totalQuick, stepper.running.yearlyNote, stepper.running.why]) expect(screen.queryByText(moved)).toBeNull();
    await fireEvent.press(screen.getByTestId('costs-more'));
    for (const moved of [stepper.running.sub, stepper.running.totalQuick, stepper.running.yearlyNote]) expect(within(total).getByText(moved)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('step-why'));
    expect(screen.getByText(stepper.running.why)).toBeTruthy();
    expect(screen.getAllByText(/Insurance \d+%/, { includeHiddenElements: true })).toHaveLength(1);
  });

  it('InstallmentPlanSheet: the result line stays; each field helper opens under its Why?; interest and APR under More', async () => {
    const { InstallmentPlanSheet: PlanSheet } = jest.requireActual<typeof import('../sheets/InstallmentPlanSheet')>('../sheets/InstallmentPlanSheet');
    await wrap(
      <PlanSheet visible check={checkOnce(100_000)} currency="USD" today="2026-11-11" itemKind="laptop" formatMoney={(n: number) => `$${n / 100}`} formatDate={(d: string) => d} onPickDate={jest.fn()} onUse={jest.fn()} onDismiss={jest.fn()} />,
    );
    await fireEvent.press(await screen.findByLabelText('12 months'));
    const sheet = screen.getByTestId('sheet-container');
    expect(within(sheet).getByText(/a month for 12 months$/)).toBeTruthy();
    expect(proseIn(sheet)).toEqual([]);
    const moved: [string, string][] = [
      ['plan-why', sheetsInput.plan.sub],
      ['plan-borrowed-why', sheetsInput.plan.borrowedSub],
      ['plan-rate-why', 'Example rate only. It is not your rate and is not saved.'],
      ['plan-fees-why', 'Fees vary by provider.'],
      ['plan-quoted-why', sheetsInput.plan.quotedNote],
    ];
    for (const [, text] of moved) expect(screen.queryByText(text)).toBeNull();
    for (const [id, text] of moved) {
      await fireEvent.press(screen.getByTestId(id));
      expect(screen.getByText(text)).toBeTruthy();
    }
    expect(screen.queryByText(/^This plan costs about /)).toBeNull();
    await fireEvent.press(screen.getByTestId('plan-result-more'));
    expect(screen.getByText(/^This plan costs about .* in interest/)).toBeTruthy();
    expect(screen.getByText('This is FincWin’s estimate, not the APR on your agreement.')).toBeTruthy();
    expect(screen.getByTestId('rate-example-tag')).toBeTruthy();
    expect(within(sheet).getByText(LEGAL)).toBeTruthy();
  });
});

describe('one short line on quick estimates, safety net settings and Records (06.1-60, G-10 part 2)', () => {
  it('QuickEstimatesScreen: the headline and the three questions stay; "Round numbers are fine." is the hint; the rest opens under Why?', async () => {
    await wrap(<QuickEstimatesScreen currency="USD" today="2026-11-20" stored={null} onDone={jest.fn()} />);
    expect(screen.getByTestId('quick-headline')).toHaveTextContent(setup.quick.title);
    // The three questions are the fields' own labels: they stay by design and are not card prose.
    const questions: string[] = [setup.quick.income, setup.quick.bills, setup.quick.everyday];
    for (const q of questions) expect(screen.getByText(q)).toBeTruthy();
    expect(prose('detail-screen').filter((x) => !questions.includes(x))).toEqual([setup.quick.hint]);
    expect(screen.queryByText(setup.quick.sub)).toBeNull();
    expect(screen.queryByText(setup.quick.foot)).toBeNull();
    await fireEvent.press(screen.getByTestId('quick-why'));
    expect(screen.getByText(setup.quick.sub)).toBeTruthy();
    expect(screen.getByText(setup.quick.foot)).toBeTruthy();
    expect(screen.getByTestId('quick-footer')).toHaveTextContent(LEGAL);
  });

  it('SafetyNetSettings: "$1300 in it now · Locked" in view; the lock sentences and the unlock paragraph open under "What unlocking does"', async () => {
    mockGoalRows = [{ id: 'g-net', is_safety_net: true, deleted_at: null, decide_may_use: false }];
    await wrap(<SafetyNetSettings net={{ mutate: jest.fn() } as never} answer={jest.fn() as never} />);
    expect(screen.getByTestId('net-word')).toHaveTextContent(safetyNet.settings.locked);
    expect(screen.getByTestId('net-figure').props.accessibilityLabel).toBe('$1300 in it now');
    expect(screen.getByTestId('net-legend-goal')).toHaveTextContent('Goal $2300, set in Grow');
    expect(prose('detail-screen')).toEqual([]);
    const moved: string[] = [safetyNet.settings.lockSub, safetyNet.settings.beforeBody, safetyNet.settings.beforeLockAgain];
    for (const m of [...moved, safetyNet.settings.sub]) expect(screen.queryByText(m)).toBeNull();
    await fireEvent.press(screen.getByText(safetyNet.settings.whatUnlocking));
    for (const m of moved) expect(screen.getByText(m)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('net-why'));
    expect(screen.getByText(safetyNet.settings.sub)).toBeTruthy();
  });

  it('RecordsSetup: "October not complete · this month up to date" in view; the reasons and the months count open under More', async () => {
    mockSetupFacts = { ...NONE, lastMonthComplete: false, newestEntryThisMonth: '2026-11-18', accountsAllHaveUse: true, recordsUpTo: '2026-11-18' };
    await wrap(<RecordsSetup writes={{ skipLine: jest.fn(), setEnvelopeAccount: jest.fn(), clearEnvelopeAccount: jest.fn() } as never} />);
    expect(screen.getByTestId('records-summary')).toHaveTextContent('October not complete · this month up to date');
    // The question that leads into "Import a statement" is the one sentence left in view.
    expect(prose('setup-item-frame')).toEqual([setupOthers.records.moreMonthsQ]);
    expect(screen.queryByText(setupOthers.records.why)).toBeNull();
    expect(screen.queryByText(setupOthers.records.openNote)).toBeNull();
    expect(screen.queryByText('Not all of October is in your records yet.')).toBeNull();
    await fireEvent.press(screen.getByTestId('item-why'));
    expect(screen.getByText(setupOthers.records.why)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('records-more'));
    expect(screen.getByText('Not all of October is in your records yet.')).toBeTruthy();
    expect(screen.getByText('Up to date: entries to Nov 18, 2026')).toBeTruthy();
    expect(screen.getByText(setupOthers.records.openNote)).toBeTruthy();
    expect(screen.getByTestId('months-so-far')).toBeTruthy();
    expect(screen.getByTestId('check-accounts')).toBeTruthy(); // the accounts stay one row (06.1-58)
  });
});
