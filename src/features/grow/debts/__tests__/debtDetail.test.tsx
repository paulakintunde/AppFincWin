// 06-24 (G06, D-16): the debt detail, edit and sale sheet, moved out of debtScreens.test.tsx unchanged. Same fixtures and stubs.
// 06-36 (D-30, D-32): the detail reveal chips, the payments list and the route to the Debts segment.
// figures. The data hooks are stubbed at their edges (rows in, mutations recorded); the engine runs for real.
/* eslint-disable import/first */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fontSize } from '@/theme/typography';
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

let mockPayments: { next: unknown; paid: unknown[] } | undefined;
const mockPaymentsArgs = jest.fn();
jest.mock('@/data/queries/growDebts', () => ({
  useDebtPayments: (...a: unknown[]) => {
    mockPaymentsArgs(...a);
    return { data: mockPayments };
  },
}));
const mockOpen = jest.fn();
jest.mock('@/features/grow/goals/useGoalRecordDetail', () => ({
  useRecordLineDetail: () => ({
    partnerOf: () => null,
    accountName: (id: string | null) => (id === 'a1' ? 'Everyday checking' : null),
    open: (l: unknown) => mockOpen(l),
    element: null,
  }),
}));

const mockBack = jest.fn();
const mockNavigate = jest.fn();
const mockRemove = jest.fn((..._a: unknown[]) => 'step-removed');
jest.mock('expo-router', () => ({ router: { back: () => mockBack(), navigate: (h: unknown) => mockNavigate(h) } }));
jest.mock('@/data/mutations/debts', () => ({ useRemoveDebt: () => ({ remove: (...a: unknown[]) => mockRemove(...a) }) }));
jest.mock('@/shell/screen/DetailScreen', () => {
  const R = require('react');
  const { View, Text: RNText } = require('react-native');
  return {
    DetailScreen: (p: { title: string; right?: React.ReactNode; children?: React.ReactNode }) =>
      R.createElement(View, null, R.createElement(RNText, null, p.title), p.right, p.children),
  };
});

import { DebtDetailScreen } from '../DebtDetailScreen';
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
  mockPayments = { next: null, paid: [] };
  mockRule = '36.0000';
  jest.clearAllMocks();
  jest.useFakeTimers({ now: new Date(`${LEDGER_TODAY}T12:00:00Z`), doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
});
afterEach(() => {
  jest.useRealTimers();
});

describe('Edit a debt', () => {
  it('saving a change toasts "Debt saved" with the step to undo', async () => {
    mockRows = [AUTO];
    await wrap(<DebtDetailScreen id="auto" />);
    await fireEvent.press(screen.getByTestId('debt-edit'));
    await fireEvent.changeText(screen.getByLabelText(en.grow.debts.add.name), 'Auto loan 2');
    await fireEvent.press(screen.getAllByText(en.grow.debts.add.saveEdit).at(-1)!);
    expect(mockSaveDebt).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ stepId: 'step-add', text: { key: 'grow.debts.add.editedToast' } }));
  });
});

describe('Debt detail (G06)', () => {
  beforeEach(() => {
    mockRows = [AUTO];
  });

  it('shows the LEDGER Auto loan', async () => {
    await wrap(<DebtDetailScreen id="auto" />);
    // T1: the amount in display with "owed" muted beside it; the pair reads as one.
    expect(screen.getByText('$8,420')).toBeTruthy();
    expect(screen.getByText(en.grow.debts.detail.owedSuffix)).toBeTruthy();
    expect(screen.getByTestId('debt-owed').props.accessibilityLabel).toBe('$8,420 owed');
    expect(screen.getByText('Started at $14,500 · 42% paid')).toBeTruthy();
    expect(screen.getByText('6.9% a year')).toBeTruthy();
    expect(screen.getByText('$312 on the 15th · Manual')).toBeTruthy();
    expect(screen.getByText('Apr 2029 on this payment')).toBeTruthy();
    expect(screen.getByText('about $760')).toBeTruthy();
    expect(screen.getByText(en.grow.debts.footer)).toBeTruthy();
  });

  it('T2: the start line hides when the start is not above the balance', async () => {
    mockRows = [{ ...AUTO, started_balance: 250000, balance: 2500000 }];
    await wrap(<DebtDetailScreen id="auto" />);
    expect(screen.queryByText(/Started at/)).toBeNull();
  });

  it('T5: fact rows sit tight with hairlines between them; the header Edit uses the label role', async () => {
    await wrap(<DebtDetailScreen id="auto" />);
    const facts = screen.getByTestId('debt-facts');
    expect(StyleSheet.flatten(facts.props.style).gap).toBe(0);
    const rows = facts.children as unknown as { props: { style: object } }[];
    const border = (i: number) => (StyleSheet.flatten(rows[i]!.props.style) as { borderTopWidth?: number }).borderTopWidth;
    expect(border(0)).toBeUndefined();
    expect(border(1)).toBe(StyleSheet.hairlineWidth);
    const edit = screen.getByText(en.grow.goals.detail.edit);
    expect(StyleSheet.flatten(edit.props.style).fontSize).toBe(fontSize.label);
  });

  it('D-30: the reveal chips, +$50 open first, read the engine figures', async () => {
    await wrap(<DebtDetailScreen id="auto" />);
    for (const c of ['+$25', '+$50', '+$100', '$1,000 once']) expect(screen.getByText(c)).toBeTruthy();
    expect(screen.getByText('Debt-free by Dec 2028 · 4 months sooner')).toBeTruthy();
    expect(screen.getByText('Interest about $640 · about $110 less')).toBeTruthy();
    expect(screen.getByTestId('debt-reveal').props.accessibilityLabel).toBe(
      'Debt-free by Dec 2028, 4 months sooner. Interest about $640, about $110 less.'
    );
    await fireEvent.press(screen.getByText('$1,000 once'));
    expect(screen.getByText('Interest about $580 · about $170 less')).toBeTruthy();
    expect(screen.queryByText(/Interest about \$640/)).toBeNull();
  });

  it('CRUD #10: "Change in the payoff plan" opens Grow on the Debts segment', async () => {
    await wrap(<DebtDetailScreen id="auto" />);
    await fireEvent.press(screen.getByTestId('debt-change-plan'));
    expect(mockNavigate).toHaveBeenCalledWith('/(tabs)/grow?segment=debts');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('D-32: payments list the next expected line, then paid lines with their source; each opens the record', async () => {
    const WITH_SERIES = { ...AUTO, series_id: 's1', extra_series_id: 'x1', account_id: 'a1' };
    mockRows = [WITH_SERIES];
    const tx = (id: string, local_date: string, over: Record<string, unknown> = {}) => ({
      id,
      local_date,
      account_id: 'a1',
      original_amount: -31200,
      original_currency: 'USD',
      recurring_series_id: 's1',
      debt_id: null,
      ...over,
    });
    const next = tx('n1', '2026-11-15', { status: 'pending' });
    const paid = [
      tx('p1', '2026-10-20', { recurring_series_id: null, debt_id: 'auto', original_amount: -100000 }),
      tx('p2', '2026-10-15', { recurring_series_id: 'x1', original_amount: -5000 }),
      tx('p3', '2026-10-15'),
    ];
    mockPayments = { next, paid };
    await wrap(<DebtDetailScreen id="auto" />);
    expect(mockPaymentsArgs).toHaveBeenCalledWith(expect.objectContaining({ id: 'auto' }), '2026-11-05');
    expect(screen.getByText('Nov 15')).toBeTruthy();
    expect(screen.getByText(en.grow.goals.detail.expected)).toBeTruthy();
    expect(screen.getByText('One-off · from Everyday checking')).toBeTruthy();
    expect(screen.getByText('Extra · from Everyday checking')).toBeTruthy();
    expect(screen.getAllByText('From Everyday checking').length).toBe(2);
    expect(screen.getByText('$1,000')).toBeTruthy();
    await fireEvent.press(screen.getByText('One-off · from Everyday checking'));
    expect(mockOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }));
    await fireEvent.press(screen.getByText('Nov 15'));
    expect(mockOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'n1' }));
    await fireEvent.press(screen.getByText(en.grow.debts.detail.seeAllInActivity));
    expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/activity', params: { debt: 'auto' } }); // 06-37 D-38: filtered to this debt
  });

  it('D-32: a manual debt with nothing recorded shows its next due payment as Expected', async () => {
    await wrap(<DebtDetailScreen id="auto" />);
    expect(screen.getByText('Nov 15')).toBeTruthy();
    expect(screen.getByText(en.grow.goals.detail.expected)).toBeTruthy();
    expect(screen.queryByText(en.grow.debts.detail.paymentsEmpty)).toBeNull();
  });

  it('D-32: no payments and nothing due says so', async () => {
    mockRows = [{ ...AUTO, due_day: null }];
    await wrap(<DebtDetailScreen id="auto" />);
    expect(screen.getByText(en.grow.debts.detail.paymentsEmpty)).toBeTruthy();
    expect(screen.getByText(en.grow.debts.detail.seeAllInActivity)).toBeTruthy();
  });

  it('06-19: "Try other amounts" opens the extra-payment calculator for a debt with a rate', async () => {
    await wrap(<DebtDetailScreen id="auto" />);
    await fireEvent.press(screen.getByTestId('debt-try-other'));
    expect(mockPush).toHaveBeenCalledWith('/grow/calculators/debt/auto');
  });

  it('Remove asks first, then stops Decide counting the debt', async () => {
    await wrap(<DebtDetailScreen id="auto" />);
    await fireEvent.press(screen.getByTestId('debt-remove'));
    expect(screen.getByText('Remove Auto loan?')).toBeTruthy();
    expect(screen.getByText(en.grow.debts.detail.removeBody)).toBeTruthy();
    expect(mockRemove).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText(en.grow.debts.detail.removeConfirm));
    // A real removal (soft delete), not "paid off": the row and the user, nothing else.
    expect(mockRemove).toHaveBeenCalledWith(expect.objectContaining({ id: 'auto' }), 'u1');
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ kind: 'destructive', stepId: 'step-removed', text: { key: 'grow.debts.detail.removedToast', params: { name: 'Auto loan' } } }));
  });

  it('a debt that is not there says so with a way back', async () => {
    await wrap(<DebtDetailScreen id="nope" />);
    expect(screen.getByTestId('grow-debt-missing')).toBeTruthy();
    expect(screen.getByText('Debt not found')).toBeTruthy();
  });
});

describe('Close the loan from a sale (D-16)', () => {
  beforeEach(() => {
    mockRows = [AUTO];
  });

  async function openSale() {
    await wrap(<DebtDetailScreen id="auto" />);
    await fireEvent.press(screen.getByTestId('debt-sold'));
  }

  it('prefills the balance and previews what is left over', async () => {
    await openSale();
    await fireEvent.changeText(screen.getByLabelText(en.grow.debts.sale.soldFor), '10000');
    expect(screen.getByText('The $8,420 is paid off and $1,580 is left over')).toBeTruthy();
    expect(screen.getByText('Left over goes to: Everyday checking')).toBeTruthy();
  });

  it('paying off with less leaves the rest owed', async () => {
    await openSale();
    await fireEvent.changeText(screen.getByLabelText(en.grow.debts.sale.soldFor), '5000');
    await fireEvent.changeText(screen.getByLabelText(en.grow.debts.sale.paidOffWith), '5000');
    expect(screen.getByText('$3,420 is still owed')).toBeTruthy();
  });

  it('more than the balance is refused before saving', async () => {
    await openSale();
    await fireEvent.changeText(screen.getByLabelText(en.grow.debts.sale.soldFor), '10000');
    await fireEvent.changeText(screen.getByLabelText(en.grow.debts.sale.paidOffWith), '9000');
    expect(screen.getByText('That’s more than the $8,420 still owed.')).toBeTruthy();
    await fireEvent.press(screen.getByText(en.grow.debts.sale.save));
    expect(mockRecordSale).not.toHaveBeenCalled();
  });

  it('"Record the sale" makes one useRecordDebtSale call with both line names and a toast with Undo', async () => {
    await openSale();
    await fireEvent.changeText(screen.getByLabelText(en.grow.debts.sale.soldFor), '10000');
    await fireEvent.press(screen.getByText(en.grow.debts.sale.save));
    expect(mockRecordSale).toHaveBeenCalledTimes(1);
    expect(mockRecordSale).toHaveBeenCalledWith(
      expect.objectContaining({
        soldFor: 1000000,
        paidToLoan: 842000,
        saleAccountId: 'a1',
        paymentAccountId: 'a1',
        saleName: 'Auto loan sold',
        paymentName: 'Auto loan final payment',
        date: '2026-11-05',
      }),
    );
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ stepId: 'step-sale', text: { key: 'grow.debts.sale.toast' } }));
  });
});

void act;
