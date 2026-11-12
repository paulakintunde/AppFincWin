// 06-19 Task 2: the three record calculators and "Make this the plan". The data hooks, the shell and the router are stubbed so
// the tests read what the screens decide: the linked figures, the before -> after rows, and that nothing is written until the
// confirm button (T-06-19-01).
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { minorUnits } from '@/engine/money';
import { wrap } from '@/test/stepProps';
import { goal as goalFixture } from '@/test/pastFixtures';
import type { GoalsRead } from '@/features/grow/goals/useGoalsRead';
import type { DebtsRead } from '@/features/grow/debts/useDebtsRead';
import { DebtExtraCalculator } from '../record/DebtExtraCalculator';
import { GoalCalculator } from '../record/GoalCalculator';
import { GrowthIllustration } from '../record/GrowthIllustration';
import { useRecordLinks } from '../record/useRecordLinks';
import { CalculatorsScreen } from '../typed/CalculatorsScreen';

jest.setTimeout(60000);

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockSaveGoal = jest.fn((..._a: unknown[]) => ({ id: 'g1', stepId: 's-goal' }));
const mockSaveDebt = jest.fn((..._a: unknown[]) => ({ stepId: 's-debt' }));
const mockGoalToast = jest.fn();
const mockShowToast = jest.fn();
const mockHapticLight = jest.fn();
const mockPushOnce = jest.fn();

jest.mock('expo-router', () => ({ router: { back: () => mockBack(), push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: (...a: unknown[]) => mockPushOnce(...a) }));
jest.mock('@/shell/screen/DetailScreen', () => {
  const R = require('react');
  const { View, Text: RNText } = require('react-native');
  return {
    DetailScreen: (p: { title: string; children?: React.ReactNode }) => R.createElement(View, null, R.createElement(RNText, null, p.title), p.children),
  };
});
jest.mock('@/data/mutations/growGoals', () => ({ useSaveGoalPlan: () => ({ save: (...a: unknown[]) => mockSaveGoal(...a) }) }));
jest.mock('@/data/mutations/growDebts', () => ({ useSaveDebtPlan: () => ({ save: (...a: unknown[]) => mockSaveDebt(...a) }) }));
let mockRows: SavingsGoalRow[] = [];
let mockSeries: unknown[] = [];
jest.mock('@/data/queries/growGoals', () => ({
  useSavingsGoalRows: () => ({ data: mockRows, isError: false, refetch: jest.fn() }),
  useGoalLines: () => ({ data: [] }),
}));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: mockSeries }) }));
jest.mock('@/data/queries/accounts', () => ({
  useAccounts: () => ({ data: [{ id: 'a-chk', name: 'Everyday checking', kind: 'checking', currency: 'USD', archived_at: null }] }),
}));
jest.mock('@/data/queries/decide', () => ({ useDecideSettings: () => ({ data: { saving_floor: 15000 } }) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ homeCurrency: 'USD', showCents: false, today: '2026-10-20', userId: 'u1', householdId: 'h1', ready: true, timeZone: 'UTC' }),
}));
jest.mock('@/features/decide/screens/past/data/usePastDecisions', () => ({
  usePastContext: () => ({
    userId: 'u1',
    householdId: 'h1',
    today: '2026-10-20',
    ctx: { home: 'USD', rates: [], customs: [], today: '2026-10-20', timeZone: 'UTC' },
    whole: (m: number) => `$${Math.round(m / 100)}`,
    wholeIn: () => (m: number) => `$${Math.round(m / 100)}`,
    formatDate: (d: string) => `on ${d}`,
  }),
}));
let mockGoalsRead: GoalsRead;
jest.mock('@/features/grow/goals/useGoalsRead', () => ({ useGoalsRead: () => mockGoalsRead, toHomeOf: () => (a: number) => a }));
jest.mock('@/features/grow/goals/useGoalToast', () => ({ useGoalToast: () => (...a: unknown[]) => mockGoalToast(...a) }));
let mockDebtsRead: DebtsRead;
jest.mock('@/features/grow/debts/useDebtsRead', () => ({ useDebtsRead: () => mockDebtsRead }));
jest.mock('@/features/grow/debts/debtScreenData', () => {
  const actual = jest.requireActual('@/features/grow/debts/debtScreenData');
  return {
    ...actual,
    useDebtMonth: () => ({ usualPay: 320000, left: 42500, rule: '36', currency: 'USD' }),
    useDebtRows: () =>
      new Map([
        ['d1', { id: 'd1', name: 'Auto loan', kind: 'loan', currency: 'USD', apr: '6.9', account_id: 'a-chk', deleted_at: null }],
        ['d2', { id: 'd2', name: 'Store card', kind: 'card', currency: 'USD', apr: '21.9', account_id: 'a-chk', deleted_at: null }],
      ]),
  };
});
let mockInvesting: { model: { holdings: unknown[]; totals: { value: number }; monthlyIn: number } };
jest.mock('@/features/grow/investing/useInvestingRead', () => ({ useInvestingRead: () => mockInvesting }));
jest.mock('@/state/undoToast', () => ({ showToast: (...a: unknown[]) => mockShowToast(...a) }));
jest.mock('@/ui/haptics', () => ({
  hapticSelection: jest.fn(),
  hapticLight: () => mockHapticLight(),
  hapticWarning: jest.fn(),
  hapticSuccess: jest.fn(),
  hapticMedium: jest.fn(),
}));

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 300)); });
const typeInto = async (testID: string, text: string) => {
  await fireEvent.changeText(screen.getByTestId(testID), text);
  await settle();
};

function lisbon(): SavingsGoalRow {
  return goalFixture('', {
    id: 'g1',
    name: 'Trip to Lisbon',
    kind: 'pot',
    currency: 'USD',
    target: 180_000,
    monthly_amount: 5_000,
    ready_by: null,
    opening_saved: 64_000,
    account_id: 'a-chk',
    locked: false,
    is_safety_net: false,
    bucket: null,
    check_id: null,
  });
}

function goalsRead(): GoalsRead {
  return {
    status: 'ready',
    userId: 'u1',
    householdId: 'h1',
    today: '2026-10-20',
    refetch: jest.fn(),
    model: {
      safetyNet: null,
      goals: [
        {
          id: 'g1', name: 'Trip to Lisbon', kind: 'pot', target: minorUnits(180_000), saved: minorUnits(64_000), monthlyAmount: minorUnits(5_000),
          readyBy: null, locked: false, upFrontOnly: false, linkedCheckId: null, accountId: 'a-chk', bucket: false, done: false,
        },
      ],
      totalSaved: 64_000,
      monthlyIntoGoals: 15_000,
      needsNetConfirm: false,
    },
  };
}

function debtsRead(extra = 0): DebtsRead {
  return {
    status: 'ready',
    userId: 'u1',
    householdId: 'h1',
    today: '2026-11-06',
    refetch: jest.fn(),
    model: {
      debts: [
        {
          id: 'd1', name: 'Auto loan', kind: 'loan', currency: 'USD', minimumEstimated: false, startedBalance: null, extra, order: null, inPlan: true,
          point: { balance: 842_000, minimum: 31_200, dueDay: 15, paidInFull: false, paidOff: false, apr: null, payoffDate: null, totalInterest: null },
        },
      ],
      paidInFull: [],
      planCurrency: 'USD',
      extra,
      savedOrder: null,
      oneDebt: true,
      plan: null,
      focus: null,
    },
  } as unknown as DebtsRead;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRows = [lisbon()];
  mockSeries = [];
  mockGoalsRead = goalsRead();
  mockDebtsRead = debtsRead();
  mockInvesting = { model: { holdings: [], totals: { value: 0 }, monthlyIn: 0 } };
});

describe('GoalCalculator (GC02, D-17)', () => {
  it('starts on the current plan: no Make this the plan, a quiet plan-now line', async () => {
    await wrap(<GoalCalculator id="g1" />);
    expect(screen.getByTestId('pair-first-input').props.value).toBe('50.00');
    expect(screen.getByTestId('pair-second-input').props.value).toBe('10/2028');
    expect(screen.getByTestId('goal-calc-plan-now')).toBeTruthy();
    expect(screen.queryByText('Make this the plan')).toBeNull();
  });

  it('Each month follows Reaches by: $82.86 reaches Dec 2027, and the other way round', async () => {
    await wrap(<GoalCalculator id="g1" />);
    await typeInto('pair-first-input', '82.86');
    expect(screen.getByTestId('pair-second-input').props.value).toBe('12/2027');
    await typeInto('pair-second-input', '10/2028');
    expect(screen.getByTestId('pair-first-input').props.value).toBe('48.34');
  });

  it('shows what changes each month, and the line note only below the saving line', async () => {
    await wrap(<GoalCalculator id="g1" />);
    await typeInto('pair-first-input', '25');
    expect(screen.getByTestId('goal-calc-line-note')).toBeTruthy();
    expect(screen.getByText('$125.00')).toBeTruthy();
    await typeInto('pair-first-input', '82.86');
    expect(screen.queryByTestId('goal-calc-line-note')).toBeNull();
    expect(screen.getByText('$182.86')).toBeTruthy();
    expect(screen.getByText('$392.14')).toBeTruthy();
  });

  it('Not now and the backdrop save nothing; confirm saves once with the new amount and goes back', async () => {
    await wrap(<GoalCalculator id="g1" />);
    await typeInto('pair-first-input', '82.86');
    await fireEvent.press(screen.getByText('Make this the plan'));
    expect(screen.getByText('Nothing changes until you confirm.')).toBeTruthy();
    expect(screen.getByTestId('change-row-monthly')).toBeTruthy();
    await fireEvent.press(screen.getByText('Not now'));
    expect(mockSaveGoal).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Make this the plan'));
    await fireEvent.press(screen.getByTestId('sheet-backdrop', { hidden: true }));
    expect(mockSaveGoal).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Make this the plan'));
    const confirmButtons = screen.getAllByText('Make this the plan');
    await fireEvent.press(confirmButtons[confirmButtons.length - 1]!);
    expect(mockSaveGoal).toHaveBeenCalledTimes(1);
    const call = mockSaveGoal.mock.calls[0]![0] as { ownerId: string; fields: Record<string, unknown>; series: unknown };
    expect(call.ownerId).toBe('u1');
    expect(call.fields).toEqual({ monthly_amount: 8286 });
    expect(call.series).toBeNull();
    expect(mockHapticLight).toHaveBeenCalledTimes(1);
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockGoalToast).toHaveBeenCalledWith(expect.objectContaining({ key: 'grow.calc.goal.planSavedToast', stepId: 's-goal', undoLabel: 'goalPlanChanged' }));
  });

  it('a date pick also saves ready_by (the last day of that month)', async () => {
    await wrap(<GoalCalculator id="g1" />);
    await typeInto('pair-second-input', '12/2027');
    await fireEvent.press(screen.getByText('Make this the plan'));
    const buttons = screen.getAllByText('Make this the plan');
    await fireEvent.press(buttons[buttons.length - 1]!);
    expect((mockSaveGoal.mock.calls[0]![0] as { fields: Record<string, unknown> }).fields).toEqual({ monthly_amount: 8286, ready_by: '2027-12-31' });
  });

  it('a goal without a target has no calculator', async () => {
    mockRows = [{ ...lisbon(), target: null }];
    await wrap(<GoalCalculator id="g1" />);
    expect(screen.queryByTestId('pair-first-input')).toBeNull();
  });
});

describe('DebtExtraCalculator (GC04, D-18)', () => {
  it('none: Apr 2029 with 30 payments and a plan-now line', async () => {
    await wrap(<DebtExtraCalculator id="d1" />);
    expect(screen.getAllByText('Apr 2029').length).toBeGreaterThan(0);
    expect(screen.getByText(/30 payments on \$312\.00/)).toBeTruthy();
    expect(screen.getByTestId('debt-calc-plan-now')).toBeTruthy();
  });

  it('+$50: Dec 2028, 26 payments of $362, $111.45 saved, then confirm saves once through useSaveDebtPlan', async () => {
    await wrap(<DebtExtraCalculator id="d1" />);
    await fireEvent.press(screen.getByText('+$50'));
    expect(screen.getAllByText('Dec 2028').length).toBeGreaterThan(0);
    expect(screen.getByText(/26 payments of \$362\.00, 4 months sooner than Apr 2029\./)).toBeTruthy();
    expect(screen.getByText('$111.45')).toBeTruthy();
    expect(screen.getByText('11%')).toBeTruthy();
    expect(screen.getByText('With one debt, both orders give the same result. They differ when there is more than one debt.')).toBeTruthy();

    await fireEvent.press(screen.getByText('Make this the plan'));
    await fireEvent.press(screen.getByText('Not now'));
    expect(mockSaveDebt).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Make this the plan'));
    const buttons = screen.getAllByText('Make this the plan');
    await fireEvent.press(buttons[buttons.length - 1]!);
    expect(mockSaveDebt).toHaveBeenCalledTimes(1);
    const call = mockSaveDebt.mock.calls[0]![0] as { extra: number; paidFromAccountId: string };
    expect(call.extra).toBe(5000);
    expect(call.paidFromAccountId).toBe('a-chk');
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockShowToast).toHaveBeenCalledWith(expect.objectContaining({ stepId: 's-debt' }));
  });

  it('links to the payoff calculator for more debts', async () => {
    await wrap(<DebtExtraCalculator id="d1" />);
    await fireEvent.press(screen.getByText('Try it with more debts'));
    expect(mockPushOnce).toHaveBeenCalledWith('/grow/calculators/payoff');
  });
});

describe('GrowthIllustration (GC05, D-19)', () => {
  it('always shows the badge and the footer, and starts at 4%', async () => {
    await wrap(<GrowthIllustration start="769000" monthly="20000" />);
    expect(screen.getByText('Illustration, not a forecast')).toBeTruthy();
    expect(screen.getByText('$40,914.44')).toBeTruthy();
    expect(screen.getByText('An illustration from the values you typed. FincWin holds no investments and makes no forecast.')).toBeTruthy();
    expect(screen.getByText(/Real returns rise and fall, and some years go below zero\./)).toBeTruthy();
  });

  it('rate chips swap the figures: 2% and 6% reproduce the ledger', async () => {
    await wrap(<GrowthIllustration start="769000" monthly="20000" />);
    await fireEvent.press(screen.getByText('2%'));
    expect(screen.getByText('$35,935.02')).toBeTruthy();
    await fireEvent.press(screen.getByText('6%'));
    expect(screen.getByText('$46,766.98')).toBeTruthy();
    expect(screen.getByText('$32,775.89')).toBeTruthy();
  });

  it('takes the rate from the link', async () => {
    await wrap(<GrowthIllustration start="769000" monthly="20000" rate="4.5" />);
    expect(screen.getByText('4.5%')).toBeTruthy();
    expect(screen.getByText(/After 10 years at 4.5% a year/)).toBeTruthy();
  });

  it('GRW-10: the starting value carries its own as-of date, not today', async () => {
    await wrap(<GrowthIllustration start="769000" monthly="20000" asOf="2026-09-14" />);
    expect(screen.getByText(/as of on 2026-09-14/)).toBeTruthy();
    expect(screen.queryByText(/as of on 2026-10-20/)).toBeNull();
  });

  it('GRW-10: a future date falls back to today', async () => {
    await wrap(<GrowthIllustration start="769000" monthly="20000" asOf="2027-01-01" />);
    expect(screen.getByText(/as of on 2026-10-20/)).toBeTruthy();
  });

  it('GRW-10: a malformed date falls back to today', async () => {
    await wrap(<GrowthIllustration start="769000" monthly="20000" asOf="nope" />);
    expect(screen.getByText(/as of on 2026-10-20/)).toBeTruthy();
  });
});

function RecordsPage() {
  return <CalculatorsScreen recordLinks={useRecordLinks()} />;
}

describe('Calculators page, With your records (06-19)', () => {
  it('is absent when there are no records', async () => {
    mockGoalsRead = { ...goalsRead(), model: { ...goalsRead().model, goals: [] } };
    mockDebtsRead = { ...debtsRead(), model: { ...debtsRead().model, debts: [] } };
    await wrap(<RecordsPage />);
    expect(screen.queryByText('With your records')).toBeNull();
  });

  it('lists a link for each record that exists and opens the right calculator', async () => {
    const d = debtsRead();
    d.model.debts[0]!.point = { ...d.model.debts[0]!.point, apr: 69_000_000_000n } as never;
    mockDebtsRead = d;
    mockInvesting = { model: { holdings: [{ id: 'h1', asOf: '2026-10-01' }, { id: 'h2', asOf: '2026-09-14' }], totals: { value: 769_000 }, monthlyIn: 20_000 } };
    await wrap(<RecordsPage />);
    expect(screen.getByText('With your records')).toBeTruthy();
    await fireEvent.press(screen.getByText('Trip to Lisbon'));
    await fireEvent.press(screen.getByText('Auto loan, extra payments'));
    expect(screen.getByText(/as of Sep 14 ·/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Investing, growth illustration'));
    expect(mockPushOnce.mock.calls.map((c) => c[0])).toEqual([
      '/grow/calculators/goal/g1',
      '/grow/calculators/debt/d1',
      { pathname: '/grow/calculators/illustration', params: { start: '769000', monthly: '20000', asOf: '2026-09-14' } },
    ]);
  });

  it('leaves out a debt with no rate', async () => {
    await wrap(<RecordsPage />);
    expect(screen.getByText('With your records')).toBeTruthy();
    expect(screen.queryByText('Auto loan, extra payments')).toBeNull();
  });
});

describe('Phase 6 review fixes (P3)', () => {
  const lowPayment = (): DebtsRead => {
    const d = debtsRead();
    d.model.debts[0]!.point = { ...d.model.debts[0]!.point, minimum: 4_000 } as never;
    return d;
  };

  it('P3-WR-14: a payment below the interest says the debt does not clear, and a clearing extra still shows its result', async () => {
    mockDebtsRead = lowPayment();
    await wrap(<DebtExtraCalculator id="d1" />);
    expect(screen.getByTestId('debt-calc-never-clears').props.children).toBe('At the current payment this debt does not clear.');
    await fireEvent.press(screen.getByText('+$25'));
    expect(screen.getByText(/payments of \$65\.00\. The current payment alone does not clear it\./)).toBeTruthy();
    expect(screen.queryByTestId('debt-calc-never-clears')).toBeNull();
  });

  it('P3-IN-01: no duplicate order cards for one debt', async () => {
    await wrap(<DebtExtraCalculator id="d1" />);
    expect(screen.queryByTestId('debt-calc-order-rate')).toBeNull();
    expect(screen.queryByTestId('debt-calc-order-balance')).toBeNull();
  });

  it('P3-WR-02 / WR-03: confirm saves once; the server stops the extra another debt carries in the same step', async () => {
    const d = debtsRead();
    d.model.debts.push({ ...d.model.debts[0]!, id: 'd2', name: 'Store card', extra: 2500 } as never);
    mockDebtsRead = d;
    await wrap(<DebtExtraCalculator id="d1" />);
    await fireEvent.press(screen.getByText('+$50'));
    await fireEvent.press(screen.getByText('Make this the plan'));
    const buttons = screen.getAllByText('Make this the plan');
    await fireEvent.press(buttons[buttons.length - 1]!);
    await fireEvent.press(buttons[buttons.length - 1]!);
    const calls = mockSaveDebt.mock.calls.map((c) => c[0] as { debt: { id: string }; extra: number });
    expect(calls.map((c) => [c.debt.id, c.extra])).toEqual([
      ['d1', 5000],
    ]);
  });

  it('P3-WR-12: a goal that arrives after the first render still fills in Each month', async () => {
    mockGoalsRead = { ...goalsRead(), status: 'loading', model: { ...goalsRead().model, goals: [] } };
    const view = await wrap(<GoalCalculator id="g1" />);
    expect(screen.getByTestId('goal-calc-loading')).toBeTruthy();
    mockGoalsRead = goalsRead();
    await view.rerender(<GoalCalculator id="g1" />);
    expect(screen.getByTestId('pair-first-input').props.value).toBe('50.00');
    await settle();
    expect(screen.getByTestId('goal-calc-plan-now')).toBeTruthy();
  });

  it('P3-WR-13: a goal kept in another currency gets no calculator link', async () => {
    mockRows = [{ ...lisbon(), currency: 'EUR' }];
    await wrap(<RecordsPage />);
    expect(screen.queryByText('Trip to Lisbon')).toBeNull();
  });
});
