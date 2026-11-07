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
jest.mock('@/data/mutations/growDebts', () => ({
  useSaveDebtPlan: () => ({ save: mockSavePlan }),
  useSaveGrowDebt: () => ({ save: mockSaveDebt }),
  useRecordDebtSale: () => ({ record: mockRecordSale }),
}));
jest.mock('@/state/undoToast', () => ({ showToast: (t: unknown) => mockToast(t) }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: (h: unknown) => mockPush(h) }));
jest.mock('@/ui/haptics', () => ({
  hapticLight: () => mockLight(),
  hapticWarning: () => mockWarn(),
  hapticSelection: jest.fn(),
}));

import { DebtsSegment } from '../DebtsSegment';
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

  it('a debt row opens its detail', async () => {
    await wrap(<DebtsSegment />);
    await fireEvent.press(screen.getByTestId('grow-debt-row-auto'));
    expect(mockPush).toHaveBeenCalledWith('/grow/debt/auto');
  });

  it('neither payoff order is chosen before a tap, and the choice is the user’s', async () => {
    await wrap(<DebtsSegment />);
    expect(screen.getByTestId('payoff-order-rate').props.accessibilityState.selected).toBe(false);
    expect(screen.getByTestId('payoff-order-balance').props.accessibilityState.selected).toBe(false);
    expect(screen.getByText(en.grow.debts.orderRate)).toBeTruthy();
    expect(screen.getByText(en.grow.debts.orderBalance)).toBeTruthy();
    expect(screen.getByText('The choice is yours.')).toBeTruthy();
  });

  it('one debt: both orders are disabled and the card says they are the same', async () => {
    await wrap(<DebtsSegment />);
    expect(screen.getByTestId('payoff-order-rate').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText(en.grow.debts.oneDebt)).toBeTruthy();
  });

  it('two debts: each column has its own date and a first-cleared line, and a tap marks only that one', async () => {
    mockRows = [AUTO, debt({ id: 'card', name: 'Store card', kind: 'card', balance: 90000, apr: '21.9', minimum_payment: 4000, due_day: 3, pays_in_full: 'no' })];
    await wrap(<DebtsSegment />);
    expect(screen.getAllByText(en.grow.debts.firstCleared)).toHaveLength(2);
    await fireEvent.press(screen.getByTestId('payoff-order-balance'));
    expect(screen.getByTestId('payoff-order-balance').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('payoff-order-rate').props.accessibilityState.selected).toBe(false);
  });

  it('shows the three scenarios with the LEDGER figures, rounded to the nearest ten', async () => {
    await wrap(<DebtsSegment />);
    expect(screen.getByText('Minimum only')).toBeTruthy();
    expect(screen.getByText('Apr 2029 · about $760 interest')).toBeTruthy();
    expect(screen.getByText('$50 extra a month')).toBeTruthy();
    expect(screen.getByText('Dec 2028 · about $640 interest · 4 months sooner')).toBeTruthy();
    expect(screen.getByText('$1,000 once, today')).toBeTruthy();
    expect(screen.getByText('Dec 2028 · about $580 interest')).toBeTruthy();
    expect(screen.getByText('Extra money for debt comes out of what is left each month ($425). Decide counts it.')).toBeTruthy();
  });

  it('the stepper moves in $25 steps and reads as adjustable, with no haptic', async () => {
    await wrap(<DebtsSegment />);
    const stepper = screen.getByTestId('grow-stepper');
    expect(stepper.props.accessibilityLabel).toMatch(/^Extra each month, .*50.*, adjustable$/);
    await fireEvent.press(screen.getByTestId('grow-stepper-plus'));
    expect(screen.getByText('$75 extra a month')).toBeTruthy();
    expect(mockLight).not.toHaveBeenCalled();
  });

  it('"Use $50 extra" saves the plan with the user’s order (none yet), a light haptic and a toast with Undo', async () => {
    await wrap(<DebtsSegment />);
    await fireEvent.press(screen.getByText('Use $50 extra'));
    expect(mockSavePlan).toHaveBeenCalledTimes(1);
    expect(mockSavePlan).toHaveBeenCalledWith(expect.objectContaining({ extra: 5000, order: null, paidFromAccountId: 'a1' }));
    expect(mockLight).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ stepId: 'step-plan', text: { key: 'grow.debts.planSavedToast', params: { amount: '$50' } } }),
    );
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

void act;
