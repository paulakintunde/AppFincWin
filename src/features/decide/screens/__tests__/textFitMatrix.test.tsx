// 06.1-32 (UX-27, D-76): the new Decide screens at 402 and 320 dp x 1.0 and 2.0 font. Home, the three stepper steps, the answer
// frame (N02 headphones, N09 car plan), the setup checklist and safety-net settings. On every surface: no clamp on system copy, no
// fixed text height, no absolute or negative-margin wrapper around text, 44 pt targets (expectFits); amounts are never truncated
// (no numberOfLines on a money figure unless it shrinks to fit); rows grow (no fixed height on a row that holds text); and the
// verdict title drops from heading to sheetTitle above 1.3x (TITLE_DROP_SCALE).
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { TestInstance as ReactTestInstance } from 'test-renderer';
import { monthPicture, pastMonthBars, prepare, toStoredV2, type CheckV2, type MonthPicture } from '@/engine/decide/v3';
import { checkOnce, inputsOf, monthOf, v3Line, v3Series } from '@/engine/decide/v3/__tests__/helpers/fixtures';
import { minorUnits } from '@/engine/money';
import en from '@/i18n/locales/en';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { fontSize } from '@/theme/typography';
import { MATRIX, allNodes, expectFits, matrixName } from '@/test/textFitMatrix';
import { AnswerFrame } from '../answer/AnswerFrame';
import { TITLE_DROP_SCALE } from '../answer/VerdictCard';
import { ledgerRun, viewOf } from '../answer/__tests__/fixtures';
import { CostsStep } from '../check/CostsStep';
import { KindStep } from '../check/KindStep';
import { PriceStep } from '../check/PriceStep';
import { DecideHome } from '../home/DecideHome';
import { setupProgress, type SetupFacts } from '../logic/setupProgress';
import { SafetyNetSettings } from '../safetyNet/SafetyNetSettings';
import { SetupChecklist } from '../setup/SetupChecklist';

jest.setTimeout(120000);

const ID = '11111111-1111-4111-8111-111111111111';
let mockWidth = 402;
let mockScale = 1;
let mockInputs: unknown = null;
let mockPicture: MonthPicture | null = null;
let mockBars: readonly unknown[] = [];
let mockRow: { id: string; name: string; inputs: unknown; furthest_step: number } | null = null;
const mockNetRows = [{ id: 'net', name: 'Safety net', household_id: 'h1', is_safety_net: true, deleted_at: null, version: 3 }];

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), setParams: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn(), hapticLight: jest.fn(), hapticWarning: jest.fn(), hapticMedium: jest.fn() }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC' }), getDeviceRegion: () => 'US', getDeviceTimeZone: () => 'UTC' }));
// Reduce Motion on: every surface is checked in its final, settled state (D-17).
jest.mock('@/theme/motion', () => ({
  ...jest.requireActual('@/theme/motion'),
  useMotion: () => ({ reduced: true, duration: () => 0, easing: undefined }),
  useReduceMotion: () => true,
}));
jest.mock('@/shell/screen/TabRootScreen', () => {
  const R = jest.requireActual('react');
  const { View, Text: RNText } = jest.requireActual('react-native');
  return {
    TabRootScreen: (p: { title: string; eyebrow?: string; trailing?: React.ReactNode; overlay?: React.ReactNode; children?: React.ReactNode }) =>
      R.createElement(View, null, R.createElement(RNText, null, p.eyebrow), R.createElement(RNText, null, p.title), p.trailing, p.children, p.overlay),
  };
});
jest.mock('@/shell/screen/DetailScreen', () => {
  const { View } = jest.requireActual('react-native');
  return { DetailScreen: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', region: 'US', today: '2026-10-03' }),
}));
jest.mock('@/data/queries/decideV3', () => ({ useDecideV3: () => ({ status: 'ready', inputs: mockInputs, prepared: null, v3: null, refetch: jest.fn() }) }));
jest.mock('@/data/queries/decide', () => ({
  useDecideChecks: () => ({ data: mockRow === null ? [] : [mockRow], isLoading: false }),
  useDebts: () => ({ data: [] }),
}));
jest.mock('@/data/queries/categories', () => ({ useCategories: () => ({ data: [{ id: 'c-ins', name: 'Insurance' }] }) }));
jest.mock('@/data/sync/useSyncStatus', () => ({ useSyncStatus: () => ({ isOnline: true }) }));
jest.mock('@/data/mutations/decideChecks', () => ({ useSaveCheckDraft: () => ({ save: jest.fn() }) }));
jest.mock('@/data/queries/growGoals', () => ({ useSavingsGoalRows: () => ({ data: mockNetRows }) }));
jest.mock('@/features/grow/goals/useGoalsRead', () => ({
  useGoalsRead: () => ({ status: 'ready', model: { safetyNet: { size: 1_250_000_00, saved: 987_654_32 } }, refetch: jest.fn() }),
}));
jest.mock('@/features/grow/home/useGoalMoney', () => ({ useGoalMoney: () => ({ amount: (n: number) => `$${(n / 100).toLocaleString('en-US')}` }) }));
jest.mock('@/features/decide/screens/engine/useMonthPicture', () => ({ useMonthPicture: () => ({ picture: mockPicture, bars: mockBars }) }));
jest.mock('@/features/decide/screens/engine/useCheckEngine', () => ({ useCheckEngine: () => ({ evaluation: null, readyDate: () => null }) }));
jest.mock('@/features/decide/screens/home/useNewCheck', () => ({
  ...jest.requireActual('@/features/decide/screens/home/useNewCheck'),
  useNewCheck: () => ({ pending: false, start: jest.fn() }),
}));
jest.mock('@/features/decide/screens/home/useHomeCards', () => ({
  useOpenCheckRows: () => ({ rows: [], checks: [] }),
  useMoneyRules: () => ({ dsrLine: null, doc: { v: 1, rules: [] }, save: jest.fn() }),
  useRuleCrossings: () => () => [],
}));
jest.mock('@/features/decide/screens/past/data/usePastDecisions', () => ({
  usePastDecisions: () => ({ decisions: [{ id: 'd1' }, { id: 'd2' }], linesByCheck: new Map(), ctx: {} }),
  deltaFor: () => null,
  usePastContext: () => ({ userId: 'u1', householdId: 'h1' }),
}));
jest.mock('@/features/decide/hints/decideHints', () => ({ loadSetupDoneSeen: async () => true, markSetupDoneSeen: async () => undefined }));
jest.mock('@/features/decide/screens/setup/useSetupProgress', () => ({
  useSetupProgress: () => ({ items: [], doneCount: 0, next: 'pay', allDone: false, loading: false, currency: 'USD', today: '2026-10-03' }),
}));
jest.mock('@/features/decide/screens/home/SomethingChanged', () => ({ SomethingChanged: () => null }));
jest.mock('@/features/decide/screens/home/RuleEditSheet', () => ({ RuleEditSheet: () => null }));
jest.mock('@/features/decide/screens/home/AddRuleSheet', () => ({ AddRuleSheet: () => null }));
jest.mock('@/features/decide/screens/home/OpenCheckSheet', () => ({ OpenCheckSheet: () => null }));
jest.mock('@/features/decide/screens/sheets/DatePickerSheet', () => ({ DatePickerSheet: () => null }));
jest.mock('@/features/decide/screens/sheets/InstallmentPlanSheet', () => ({ InstallmentPlanSheet: () => null }));
jest.mock('@/features/decide/screens/sheets/QuickEstimateSheet', () => ({ QuickEstimateSheet: () => null }));
jest.mock('@/features/decide/screens/firstAnswer/FirstAnswerGate', () => ({
  ...jest.requireActual('@/features/decide/screens/firstAnswer/FirstAnswerGate'),
  NetQuestionSheet: () => null,
}));

/** Pay 3,000 a month, rent 1,200 and everyday spending: three full months, so home has a usual and a low month. */
function homeFixture() {
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

const stepperInputs = { currency: 'USD', region: 'US', regionSubdivision: 'CA', series: [], debts: [] };
const seed = (name: string, check: CheckV2 = checkOnce(120_000)): void => {
  mockRow = { id: ID, name, inputs: toStoredV2(check), furthest_step: 1 };
};

const TODAY = '2026-11-20';
const SOME: SetupFacts = {
  hasPay: true, payAmountMinor: 1_234_567_89, payDay: 25,
  billsRightAnswered: true, billsCount: 12, billsMonthlyMinor: 98_765_43,
  debts: [{ name: 'Visa card with a long issuer name', dueDay: null }], noDebtsAnswered: false,
  netSizeMinor: null, netNotSetAnswered: true,
  rulesOn: 3, noRulesAnswered: false,
  lastMonthComplete: false, newestEntryThisMonth: null, accountsAllHaveUse: false, recordsUpTo: '2026-11-15',
  readinessOpen: 0, readinessFirst: null,
};

const METRICS = (width: number) => ({ frame: { x: 0, y: 0, width, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } });
async function at(m: { width: number; scale: number }, ui: React.ReactElement) {
  mockWidth = m.width;
  mockScale = m.scale;
  return render(ui, {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <SafeAreaProvider initialMetrics={METRICS(m.width)}>
        <ThemeProvider>
          <FontScaleProvider value={m.scale}>{children}</FontScaleProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    ),
  });
}

const flat = (n: ReactTestInstance): Record<string, unknown> => {
  const s = n.props.style;
  return (StyleSheet.flatten(typeof s === 'function' ? s({ pressed: false }) : s) ?? {}) as Record<string, unknown>;
};
const textOf = (n: ReactTestInstance): string => {
  const parts: string[] = [];
  const visit = (c: ReactTestInstance | string): void => {
    if (typeof c === 'string') parts.push(c);
    else c.children.forEach(visit);
  };
  n.children.forEach(visit);
  return parts.join('');
};
const MONEY = /[$€£]\s?\d|\d[\d,]*\.\d{2}/;

/** Amounts are whole: a money figure carries no line clamp unless it shrinks to fit (D-76 rule N). */
function expectAmountsWhole(): void {
  const clipped = allNodes()
    .filter((n) => n.type === 'Text' && MONEY.test(textOf(n)) && n.props.numberOfLines !== undefined && n.props.adjustsFontSizeToFit !== true)
    .map(textOf);
  expect(clipped).toEqual([]);
}

/** Rows grow: no host view that holds text declares a fixed height (minHeight is the floor, never a ceiling). */
function expectRowsGrow(): void {
  const fixed = allNodes()
    .filter((n) => n.type === 'View' && typeof flat(n).height === 'number' && allNodes().some((t) => t.type === 'Text' && isInside(t, n)))
    .map((n) => `${String(n.props.testID ?? 'view')}: ${textOf(n).slice(0, 40)}`);
  expect(fixed).toEqual([]);
}
const isInside = (child: ReactTestInstance, parent: ReactTestInstance): boolean => {
  for (let p = child.parent; p; p = p.parent) if (p === parent) return true;
  return false;
};

function expectSurfaceFits(): void {
  expectFits({ clamped: [] });
  expectAmountsWhole();
  expectRowsGrow();
}

beforeEach(() => {
  const { inputs, prepared } = homeFixture();
  mockInputs = inputs;
  mockPicture = monthPicture(prepared);
  mockBars = pastMonthBars(prepared);
  mockRow = null;
});

describe.each(MATRIX)('Decide screens at $width dp x $scale', (m) => {
  it(`home fits (${matrixName(m)})`, async () => {
    await at(m, <DecideHome />);
    expect(screen.getByText(en.decide.screens.home.title)).toBeTruthy();
    expect(screen.getByTestId('check-card')).toBeTruthy();
    expectSurfaceFits();
  });

  it(`stepper step 1, kind, fits (${matrixName(m)})`, async () => {
    mockInputs = stepperInputs;
    seed('Something big');
    await at(m, <KindStep id={ID} />);
    expect(await screen.findByText(en.decide.screens.stepper.kind.title)).toBeTruthy();
    expectSurfaceFits();
  });

  it(`stepper step 2, price, fits (${matrixName(m)})`, async () => {
    mockInputs = stepperInputs;
    seed('Used car', checkOnce(9_876_543_21));
    await at(m, <PriceStep id={ID} />);
    expect(await screen.findByText(en.decide.screens.stepper.price.title)).toBeTruthy();
    expectSurfaceFits();
  });

  it(`stepper step 3, running costs, fits (${matrixName(m)})`, async () => {
    mockInputs = stepperInputs;
    seed('Used car');
    await at(m, <CostsStep id={ID} />);
    expect(await screen.findByLabelText('Insurance')).toBeTruthy();
    expectSurfaceFits();
  });

  it.each(['N02', 'N09'] as const)(`answer frame %s fits, verdict title role by scale (${matrixName(m)})`, async (s) => {
    const r = ledgerRun(s);
    await at(
      m,
      <AnswerFrame
        check={viewOf(r)}
        evaluation={r.evaluation}
        said={{ currency: r.inputs.currency, today: r.inputs.asOf }}
        onAction={() => undefined}
        onOption={() => undefined}
        onCantSee={() => undefined}
      />,
    );
    expect(screen.getByTestId('answer-footer')).toBeTruthy();
    expectSurfaceFits();
    // the title is the first Text under the verdict after the badge; it drops to sheetTitle above 1.3x
    const verdict = screen.getByTestId('answer-verdict');
    const badge = screen.getByTestId('answer-verdict-badge');
    const title = allNodes().filter((n) => n.type === 'Text' && isInside(n, verdict) && !isInside(n, badge))[0]!;
    const size = Number(flat(title).fontSize);
    const role = m.scale > TITLE_DROP_SCALE ? fontSize.sheetTitle : fontSize.heading;
    expect(textOf(title).length).toBeGreaterThan(0);
    expect(size).toBe(role * m.scale);
  });

  it(`setup checklist fits (${matrixName(m)})`, async () => {
    await at(m, <SetupChecklist progress={setupProgress(SOME, TODAY)} currency="USD" onOpen={() => undefined} onBack={() => undefined} />);
    expect(screen.getByText(en.decide.screens.setup.checklist.title)).toBeTruthy();
    for (const id of ['pay', 'bills', 'debts', 'net', 'rules', 'records']) expect(screen.getByTestId(`setup-row-${id}`)).toBeTruthy();
    expectSurfaceFits();
  });

  it(`safety-net settings fit (${matrixName(m)})`, async () => {
    await at(m, <SafetyNetSettings net={{ mutate: () => null } as never} answer={jest.fn() as never} />);
    expect(screen.getByTestId('net-word')).toBeTruthy();
    expect(screen.getByText(en.decide.screens.safetyNet.settings.lockSwitch)).toBeTruthy();
    expectSurfaceFits();
  });
});
