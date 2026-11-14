// 06.1-59 (G-10, owner decision 4, T-06.1-59-01/02): the one-line budget on Decide home. For each card, at most one sentence shows
// before any Why? or More is opened. A sentence is text that ends in ".", "?" or "!" and is not a title (header), a control's own
// words (button, link, radio), a figure, or the legal line. Then every Why?/More is opened and each moved sentence must show: no
// fact is removed, only moved one tap away. The legal line is never behind a disclosure.
import React from 'react';
import { fireEvent, screen, within } from '@testing-library/react-native';
import type { TestInstance as ReactTestInstance } from 'test-renderer';
import { monthPicture, pastMonthBars, prepare, type MonthPicture, type ReadinessItem } from '@/engine/decide/v3';
import { inputsOf, monthOf, v3Line, v3Series } from '@/engine/decide/v3/__tests__/helpers/fixtures';
import { minorUnits } from '@/engine/money';
import { home } from '@/i18n/locales/decideScreens/home';
import { setup } from '@/i18n/locales/decideScreens/setup';
import { sheetsHome } from '@/i18n/locales/decideScreens/sheetsHome';
import { answer } from '@/i18n/locales/decideScreens/answer';
import { wrap } from '@/test/stepProps';
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
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, setParams: jest.fn() }), useLocalSearchParams: () => ({}), useIsFocused: () => true }));
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
jest.mock('@/data/queries/decideV3', () => ({ useDecideV3: () => ({ status: 'ready', inputs: mockInputs, refetch: jest.fn() }) }));
jest.mock('@/data/queries/categories', () => ({ useCategories: () => ({ data: [] }) }));
jest.mock('@/data/sync/useIsOnline', () => ({ useIsOnline: () => true }));
jest.mock('../engine/useMonthPicture', () => ({ useMonthPicture: () => ({ picture: mockPicture, bars: mockBars }) }));
jest.mock('../home/useNewCheck', () => ({ ...jest.requireActual('../home/useNewCheck'), useNewCheck: () => ({ pending: false, start: jest.fn() }) }));
jest.mock('../home/useHomeCards', () => ({
  useOpenCheckRows: () => ({ rows: [], checks: [] }),
  useMoneyRules: () => ({ dsrLine: null, doc: { v: 1, rules: [] }, save: jest.fn() }),
  useRuleCrossings: () => () => [],
}));
jest.mock('../past/data/usePastDecisions', () => ({ usePastDecisions: () => ({ decisions: [], linesByCheck: new Map(), ctx: {} }), deltaFor: () => null }));
jest.mock('@/features/decide/hints/decideHints', () => ({ loadSetupDoneSeen: async () => true, markSetupDoneSeen: async () => undefined }));
jest.mock('../setup/useSetupProgress', () => ({ useSetupProgress: () => mockProgress }));
jest.mock('../home/SomethingChanged', () => ({ SomethingChanged: () => null }));
jest.mock('../home/RuleEditSheet', () => ({ RuleEditSheet: () => null }));
jest.mock('../home/AddRuleSheet', () => ({ AddRuleSheet: () => null }));
jest.mock('../home/OpenCheckSheet', () => ({ OpenCheckSheet: () => null }));
jest.mock('../sheets/DatePickerSheet', () => ({ DatePickerSheet: () => null }));
jest.mock('../sheets/InstallmentPlanSheet', () => ({ InstallmentPlanSheet: () => null }));
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
  const { inputs, prepared } = engineFixture();
  mockInputs = inputs;
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
    expect(note).toHaveTextContent(`Answers use 3 months of pay and 6 spending entries. ${home.footerUpdates}`);
    expect(screen.getAllByText(answer.worked.title).length).toBe(2); // the footer row and the sheet's title
    // the legal line is still on the home under the open sheet
    expect(within(screen.getByTestId('home-footer')).getByText(LEGAL)).toBeTruthy();
  });

  it('Not ready card: one sentence in view, apart from the "More may follow" caveat routed to the answer plan (06.1-67)', async () => {
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
    // 06.1-68 owns StatusCards.tsx in this wave; moving this caveat behind More is routed to 06.1-67 (H-6, the answer's short
    // line first). When it moves, this exception goes and the card must still read as one sentence.
    const ROUTED_TO_67: readonly string[] = [answer.notReady.moreMayFollow];
    const shown = sentences('answer-not-ready');
    expect(shown.filter((s) => !ROUTED_TO_67.includes(s)).length).toBeLessThanOrEqual(1);
    expect(shown[0]).toMatch(/^First: Netflix/);
  });
});
