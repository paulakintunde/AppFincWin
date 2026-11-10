// 06-17 (G05-G07, D-13, D-15, D-16, D-28): the Debts segment, the payoff plan, add a debt, the detail and the sale sheet, on the LEDGER
// figures. The data hooks are stubbed at their edges (rows in, mutations recorded); the engine runs for real.
/* eslint-disable import/first */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import en from '@/i18n/locales/en';
import type { DebtRow } from '@/db/debts';
import { LEDGER_TODAY, autoLoan } from '@/engine/grow/__tests__/fixtures/ledger';

jest.setTimeout(30000);

let mockRows: DebtRow[] | undefined = [];
let mockRule: string | null = '36.0000';
const mockSavePlan = jest.fn(() => ({ stepId: 'step-plan' }));
const mockSaveDebt = jest.fn(() => ({ id: 'new-debt', stepId: 'step-add' }));
const mockRecordSale = jest.fn(() => ({ stepId: 'step-sale', leftOver: 158000 }));
const mockRecordOnce = jest.fn(() => ({ stepId: 'step-once' }));
const mockToast = jest.fn();
const mockPush = jest.fn();
const mockWarn = jest.fn();
const mockLight = jest.fn();

jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/data/queries/decide', () => ({
  useDebts: () => ({ data: mockRows, isError: false, refetch: jest.fn() }),
  useDecideSettings: () => ({ data: { dsr_line: mockRule } }),
  useDecideSnapshot: () => ({ status: 'ready', result: { currency: 'USD' } }),
}));
jest.mock('@/features/decide/home/homeCardModel', () => ({ monthBreakdown: () => ({ income: 320000, result: 42500 }) }));
jest.mock('@/features/decide/past/usePastDecisions', () => ({
  usePastContext: () => ({ userId: 'u1', householdId: 'h1', today: '2026-11-05', ctx: {} }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ homeCurrency: 'USD', today: '2026-11-05', userId: 'u1', householdId: 'h1', ready: true }),
}));
jest.mock('@/data/queries/accounts', () => ({
  useAccounts: () => ({
    data: [
      { id: 'a1', name: 'Everyday checking', kind: 'checking', archived_at: null },
      { id: 'a2', name: 'Savings', kind: 'savings', archived_at: null },
    ],
  }),
}));
jest.mock('@/data/mutations/growDebts', () => {
  const actual = jest.requireActual('@/data/mutations/growDebts');
  return {
    extraStartDate: actual.extraStartDate,
    oneOffDate: actual.oneOffDate,
    useSaveDebtPlan: () => ({ save: mockSavePlan }),
    useSaveGrowDebt: () => ({ save: mockSaveDebt }),
    useRecordDebtSale: () => ({ record: mockRecordSale }),
    useRecordDebtOneOff: () => ({ record: mockRecordOnce }),
  };
});
jest.mock('@/state/undoToast', () => ({ showToast: (t: unknown) => mockToast(t) }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: (h: unknown) => mockPush(h) }));
jest.mock('@/ui/haptics', () => ({
  hapticLight: () => mockLight(),
  hapticWarning: () => mockWarn(),
  hapticSelection: jest.fn(),
}));

const mockBack = jest.fn();
const mockRemove = jest.fn((..._a: unknown[]) => 'step-removed');
jest.mock('expo-router', () => ({ router: { back: () => mockBack() } }));
jest.mock('@/data/mutations/debts', () => ({ useRemoveDebt: () => ({ remove: (...a: unknown[]) => mockRemove(...a) }) }));
jest.mock('@/shell/screen/DetailScreen', () => {
  const R = require('react');
  const { View, Text: RNText } = require('react-native');
  return {
    DetailScreen: (p: { title: string; right?: React.ReactNode; children?: React.ReactNode }) =>
      R.createElement(View, null, R.createElement(RNText, null, p.title), p.right, p.children),
  };
});

import { DebtsSegment } from '../DebtsSegment';
import { soonerText } from '../PayoffPlanCard';
/* eslint-enable import/first */

const debt = (over: Partial<DebtRow> & { id: string; name: string }): DebtRow => ({
  household_id: 'h1',
  account_id: null,
  check_id: null,
  series_id: null,
  kind: 'loan',
  currency: 'USD',
  balance: 0,
  apr: null,
  minimum_payment: 0,
  secured: false,
  term_months: null,
  start_date: null,
  min_percent: null,
  min_interest_added: null,
  min_floor: null,
  paid_in_full: false,
  pays_in_full: null,
  paid_off_on: null,
  due_day: null,
  started_balance: null,
  payoff_order: null,
  payoff_extra: 0,
  extra_series_id: null,
  is_housing: false,
  is_sample: false,
  deleted_at: null,
  version: 1,
  updated_by: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...over,
});

const AUTO = debt({
  id: 'auto',
  name: 'Auto loan',
  balance: autoLoan.balance,
  apr: autoLoan.apr,
  minimum_payment: autoLoan.payment,
  due_day: autoLoan.dueDay,
  started_balance: autoLoan.startedBalance,
});
const VISA = debt({ id: 'visa', name: 'Visa card', kind: 'card', balance: 38000, pays_in_full: 'yes' });

async function wrap(ui: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } }}>
      <ThemeProvider>
        <FontScaleProvider value={1}>{ui}</FontScaleProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  mockRows = [AUTO, VISA];
  mockRule = '36.0000';
  jest.clearAllMocks();
  jest.useFakeTimers({ now: new Date(`${LEDGER_TODAY}T12:00:00Z`), doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
});
afterEach(() => {
  jest.useRealTimers();
});

describe('Debts segment (G05)', () => {
  it('shows the hero, the line card and the rows on the LEDGER', async () => {
    await wrap(<DebtsSegment />);
    expect(screen.getByText(en.grow.debts.heroLabel)).toBeTruthy();
    expect(screen.getAllByText('$8,420')).toHaveLength(2); // hero and the Auto loan row
    expect(screen.getByText('Paid off by Apr 2029 on the minimum.')).toBeTruthy();
    expect(screen.getByText('Debt payments · 10% of pay. Your rule is at most 36%.')).toBeTruthy();
    expect(screen.queryByText(en.grow.debts.add.overBadge)).toBeNull();
    expect(screen.getByText('Auto loan')).toBeTruthy();
    expect(screen.getByText('6.9% · $312 a month · due the 15th')).toBeTruthy();
    expect(screen.getByText(en.grow.debts.paidInFullSection)).toBeTruthy();
    expect(screen.getByText('Visa card')).toBeTruthy();
    expect(screen.getByText(en.grow.debts.paidInFullRow)).toBeTruthy();
  });

  it('a debt with no due day reads rate and payment a month, with no due day', async () => {
    mockRows = [debt({ id: 'nodue', name: 'Family loan', balance: 100000, apr: '3', minimum_payment: 5000, due_day: null, started_balance: 100000 })];
    await wrap(<DebtsSegment />);
    expect(screen.getByText('3% · $50 a month')).toBeTruthy();
  });

  it('a debt row opens its detail', async () => {
    await wrap(<DebtsSegment />);
    await fireEvent.press(screen.getByTestId('grow-debt-row-auto'));
    expect(mockPush).toHaveBeenCalledWith('/grow/debt/auto');
  });

  it('empty: a card with Add a debt that opens the sheet', async () => {
    mockRows = [];
    await wrap(<DebtsSegment />);
    expect(screen.getByText(en.grow.debts.emptyTitle)).toBeTruthy();
    await fireEvent.press(screen.getByText(en.grow.debts.emptyAction));
    expect(screen.getByLabelText(en.grow.debts.add.name)).toBeTruthy();
  });

  it('the FAB can open the sheet through addOpen', async () => {
    const closed = jest.fn();
    await wrap(<DebtsSegment addOpen onAddClosed={closed} />);
    expect(screen.getByLabelText(en.grow.debts.add.name)).toBeTruthy();
  });
});

const STORE = debt({ id: 'card', name: 'Store card', kind: 'card', balance: 90000, apr: '21.9', minimum_payment: 4000, due_day: 3, pays_in_full: 'no' });
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const FORBIDDEN = /recommend|advice|should|best|better|optimal/i;

function allText(): string {
  return JSON.stringify(screen.toJSON());
}

describe('Payoff plan card (D-30, Option B)', () => {
  it('leads with the minimum date; one debt shows the greyed order switch and one note, with no columns', async () => {
    await wrap(<DebtsSegment />);
    expect(screen.getByText('Debt-free by Apr 2029 on the minimum.')).toBeTruthy();
    expect(screen.getByTestId('payoff-order-rate').props.accessibilityState).toEqual({ selected: false, disabled: true });
    expect(screen.getByTestId('payoff-order-balance').props.accessibilityState).toEqual({ selected: false, disabled: true });
    expect(screen.getByText(en.grow.debts.oneDebt)).toBeTruthy();
    expect(screen.queryByText(en.grow.debts.choiceIsYours)).toBeNull();
    expect(screen.queryByText(en.grow.debts.firstCleared)).toBeNull();
  });

  it('three rows; Extra each month opens first with the stepper and the date and interest against the minimum', async () => {
    await wrap(<DebtsSegment />);
    expect(screen.getByText('Minimum only')).toBeTruthy();
    expect(screen.getByText('Debt-free by Apr 2029 · about $760 interest')).toBeTruthy();
    expect(screen.getAllByText('Extra each month')).toHaveLength(2); // the row and the stepper's label
    expect(screen.getByTestId('grow-stepper')).toBeTruthy();
    expect(screen.getByText('Dec 2028')).toBeTruthy();
    expect(screen.getByText('4 months sooner')).toBeTruthy();
    expect(screen.getByText('was Apr 2029')).toBeTruthy();
    expect(screen.getByText('about $640')).toBeTruthy();
    expect(screen.getByText('was $760')).toBeTruthy();
    expect(screen.getByText('about $110 less')).toBeTruthy();
    expect(screen.getByText('Once, today')).toBeTruthy();
    expect(screen.getByText('Debt-free by Dec 2028 · about $580 interest')).toBeTruthy();
    expect(screen.getByText('Extra money for debt comes out of what is left each month ($425). Decide counts it.')).toBeTruthy();
    expect(screen.getByTestId('payoff-scenario-extra').props.accessibilityLabel).toBe(
      'Extra each month. Debt-free by December 2028, 4 months sooner. Interest about $640, about $110 less.',
    );
  });

  it('one row open at a time: tapping Once opens it with chips and closes Extra each month', async () => {
    await wrap(<DebtsSegment />);
    await fireEvent.press(screen.getByTestId('payoff-scenario-once'));
    expect(screen.getByTestId('payoff-scenario-once').props.accessibilityState).toEqual({ selected: true, expanded: true });
    expect(screen.getByTestId('payoff-scenario-extra').props.accessibilityState).toEqual({ selected: false, expanded: false });
    expect(screen.queryByTestId('grow-stepper')).toBeNull();
    expect(screen.getAllByTestId('payoff-reveal')).toHaveLength(1);
    for (const chip of ['$500', '$1,000', '$2,500', en.grow.debts.onceTypeChip]) expect(screen.getByText(chip)).toBeTruthy();
    expect(screen.getByText('about $580')).toBeTruthy();
    expect(screen.getByText('about $170 less')).toBeTruthy();
    expect(button('Use $1,000 once on Nov 5').props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(screen.getByText(en.grow.debts.onceTypeChip));
    expect(screen.getByLabelText(en.grow.debts.onceAmountLabel)).toBeTruthy();
  });

  it('the stepper moves in $25 steps, reads as adjustable, has no haptic, and the button follows it with its start date', async () => {
    await wrap(<DebtsSegment />);
    expect(button('Use $50 extra from Nov 15')).toBeTruthy();
    const stepper = screen.getByTestId('grow-stepper');
    expect(stepper.props.accessibilityLabel).toMatch(/^Extra each month, .*50.*, adjustable$/);
    await fireEvent.press(screen.getByTestId('grow-stepper-plus'));
    expect(button('Use $75 extra from Nov 15')).toBeTruthy();
    expect(mockLight).not.toHaveBeenCalled();
  });

  it('Minimum only with no saved extra: the minimum is the plan, and there is no button', async () => {
    await wrap(<DebtsSegment />);
    await fireEvent.press(screen.getByTestId('payoff-scenario-minimum'));
    expect(screen.getByText(en.grow.debts.minimumIsPlan)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Use / })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Stop / })).toBeNull();
  });

  it('with a saved extra: Minimum only, or the stepper at $0, offers Stop the extra from its date', async () => {
    mockRows = [{ ...AUTO, payoff_extra: 2500 }, VISA];
    await wrap(<DebtsSegment />);
    await fireEvent.press(screen.getByTestId('grow-stepper-minus'));
    expect(button('Stop the extra from Nov 15')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('payoff-scenario-minimum'));
    expect(button('Stop the extra from Nov 15')).toBeTruthy();
  });

  it('a one-off above what is owed is off, with a note', async () => {
    mockRows = [debt({ id: 'small', name: 'Phone loan', balance: 80000, apr: '5', minimum_payment: 5000, due_day: 10, started_balance: 80000 })];
    await wrap(<DebtsSegment />);
    await fireEvent.press(screen.getByTestId('payoff-scenario-once'));
    expect(screen.getByText('$1,000 is more than the $800 owed on Phone loan.')).toBeTruthy();
    expect(button('Use $1,000 once on Nov 5').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByText('$500'));
    expect(button('Use $500 once on Nov 5').props.accessibilityState.disabled).toBe(false);
  });

  it('two debts: equal columns follow the stepper, none is picked, the rows ask for an order and the button is off', async () => {
    mockRows = [AUTO, STORE];
    await wrap(<DebtsSegment />);
    expect(screen.getByTestId('payoff-order-rate').props.accessibilityState.selected).toBe(false);
    expect(screen.getByTestId('payoff-order-balance').props.accessibilityState.selected).toBe(false);
    expect(screen.getByText(en.grow.debts.choiceIsYours)).toBeTruthy();
    expect(screen.getAllByText(en.grow.debts.firstCleared)).toHaveLength(2);
    expect(screen.getByText(en.grow.debts.pickOrderFirst)).toBeTruthy();
    expect(screen.queryByTestId('payoff-reveal')).toBeNull();
    expect(button(/^Use \$50 extra from /).props.accessibilityState.disabled).toBe(true);
    const before = allText();
    for (let i = 0; i < 4; i += 1) await fireEvent.press(screen.getByTestId('grow-stepper-plus'));
    expect(allText()).not.toBe(before); // the columns follow the stepper
    await fireEvent.press(screen.getByTestId('payoff-order-balance'));
    expect(screen.getByTestId('payoff-order-balance').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('payoff-order-rate').props.accessibilityState.selected).toBe(false);
    expect(screen.queryByText(en.grow.debts.pickOrderFirst)).toBeNull();
    expect(screen.getByTestId('payoff-reveal')).toBeTruthy();
  });

  it('two debts, Once: names the debt the one-off goes to first', async () => {
    mockRows = [AUTO, STORE];
    await wrap(<DebtsSegment />);
    await fireEvent.press(screen.getByTestId('payoff-order-rate'));
    await fireEvent.press(screen.getByTestId('payoff-scenario-once'));
    expect(screen.getByText('It goes to Store card first.')).toBeTruthy();
  });

  it('no wording ranks an order or a scenario', async () => {
    mockRows = [AUTO, STORE];
    await wrap(<DebtsSegment />);
    expect(allText()).not.toMatch(FORBIDDEN);
    await fireEvent.press(screen.getByTestId('payoff-order-rate'));
    await fireEvent.press(screen.getByTestId('payoff-scenario-once'));
    expect(allText()).not.toMatch(FORBIDDEN);
  });

  it('sooner reads in years from two years up', () => {
    const table = en.grow.debts as unknown as Record<string, string>;
    const t = (key: string, o?: Record<string, string | number>): string => {
      const leaf = key.split('.').pop() as string;
      const pick = o?.count === undefined ? table[leaf] : table[`${leaf}_${o.count === 1 ? 'one' : 'other'}`];
      return (pick ?? leaf).replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(o?.[k] ?? ''));
    };
    expect(soonerText(t, 48)).toBe('4 years sooner');
    expect(soonerText(t, 38)).toBe('3 years 2 months sooner');
    expect(soonerText(t, 11)).toBe('11 months sooner');
    expect(soonerText(t, 1)).toBe('1 month sooner');
    expect(soonerText(t, 0)).toBe('Same as the minimum');
    expect(soonerText(t, null)).toBeNull();
  });
});

async function openAdd() {
  await wrap(<DebtsSegment addOpen />);
}

describe('Add a debt (G07, D-15, D-28)', () => {
  beforeEach(() => {
    mockRows = [AUTO];
  });

  it('a card asks first whether it is paid in full, and shows nothing else until answered', async () => {
    await openAdd();
    await fireEvent.press(screen.getByText(en.grow.debts.add.typeCard));
    expect(screen.getByText(en.grow.debts.add.fullQuestion)).toBeTruthy();
    expect(screen.getByTestId('add-debt-full-yes').props.accessibilityState.selected).toBe(false);
    expect(screen.queryByLabelText(en.grow.debts.add.name)).toBeNull();
    expect(screen.queryByText(en.grow.debts.add.save)).toBeNull();
  });

  it('Yes: only the statement due day (and an optional balance), no rate or minimum', async () => {
    await openAdd();
    await fireEvent.press(screen.getByText(en.grow.debts.add.typeCard));
    await fireEvent.press(screen.getByTestId('add-debt-full-yes'));
    expect(screen.getByLabelText(en.grow.debts.add.statementDay)).toBeTruthy();
    expect(screen.getByLabelText(en.grow.debts.add.balanceOptional)).toBeTruthy();
    expect(screen.queryByLabelText(en.grow.debts.add.rate)).toBeNull();
    expect(screen.queryByLabelText(en.grow.debts.add.minimum)).toBeNull();
    await fireEvent.changeText(screen.getByLabelText(en.grow.debts.add.name), 'Visa card');
    await fireEvent.press(screen.getByText(en.grow.debts.add.save));
    expect(mockSaveDebt).toHaveBeenCalledWith(
      expect.objectContaining({ fields: expect.objectContaining({ kind: 'card', pays_in_full: 'yes', minimum_payment: 0, apr: null }) }),
    );
  });

  it('No: a blank minimum shows the estimate to replace (D-28)', async () => {
    await openAdd();
    await fireEvent.press(screen.getByText(en.grow.debts.add.typeCard));
    await fireEvent.press(screen.getByTestId('add-debt-full-no'));
    await fireEvent.changeText(screen.getByLabelText(en.grow.debts.add.owedNow), '4200');
    await fireEvent.changeText(screen.getByLabelText(en.grow.debts.add.rate), '21.9');
    expect(screen.getByTestId('add-debt-estimate').props.children).toBe('Estimated minimum $118.65. Type the statement minimum to replace it.');
    await fireEvent.changeText(screen.getByLabelText(en.grow.debts.add.minimum), '150');
    expect(screen.queryByTestId('add-debt-estimate')).toBeNull();
  });

  it('shows the live line, and crossing the rule shows Over your rule with one warning haptic; save still works', async () => {
    await openAdd();
    await fireEvent.changeText(screen.getByLabelText(en.grow.debts.add.name), 'Furniture loan');
    await fireEvent.changeText(screen.getByLabelText(en.grow.debts.add.owedNow), '9000');
    await fireEvent.changeText(screen.getByLabelText(en.grow.debts.add.minimum), '200');
    expect(screen.getByText('Debt payments would be 16% of pay. Your rule is at most 36%.')).toBeTruthy();
    expect(screen.queryByText(en.grow.debts.add.overBadge)).toBeNull();
    expect(mockWarn).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText(en.grow.debts.add.minimum), '1200');
    expect(screen.getByText(en.grow.debts.add.overBadge)).toBeTruthy();
    expect(screen.getByText('This brings debt payments to 47% of pay; your rule is 36%.')).toBeTruthy();
    expect(mockWarn).toHaveBeenCalledTimes(1);
    await fireEvent.changeText(screen.getByLabelText(en.grow.debts.add.minimum), '1300');
    expect(mockWarn).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText(en.grow.debts.add.save));
    expect(mockSaveDebt).toHaveBeenCalledTimes(1);
    expect(mockLight).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ stepId: 'step-add', text: { key: 'grow.debts.add.addedToast' } }));
    expect(mockPush).toHaveBeenCalledWith('/grow/debt/new-debt');
  });
});

void act;
