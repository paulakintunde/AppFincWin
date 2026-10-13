import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { TransactionRow } from '@/db/rows';
import { getToast, resetToastForTests } from '@/state/undoToast';
import { TransactionSheet } from '../TransactionSheet';

jest.mock('@/features/record/accounts/AccountSheet', () => ({ AccountSheet: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.setTimeout(30000);

const mockAdd = jest.fn(() => 'new-id');
const mockAddRule = jest.fn((..._a: unknown[]) => ({ id: 'rule-1', stepId: 'rule-step' }));
const mockHapticLight = jest.fn();

const DINING = { id: 'd1', builtin_key: null, name: 'Dining', color_key: 'teal', is_system: false, archived_at: null };

jest.mock('@/ui/haptics', () => ({
  ...jest.requireActual('@/ui/haptics'),
  hapticLight: () => mockHapticLight(),
}));
jest.mock('@/data/mutations/categoryRules', () => ({ useAddRule: () => ({ add: mockAddRule }) }));
jest.mock('@/features/record/useGuessContext', () => {
  const value = {
    guess: {
      keywordRules: [],
      learned: new Map(),
      builtinIds: new Map([['Income', 'i1']]),
      personalRules: [{ keywordNorm: 'tesco', categoryId: 'g1' }],
      sharedRules: [],
    },
    rules: [],
    resolved: { personal: [{ keywordNorm: 'tesco', categoryId: 'g1' }], shared: [], byRuleId: new Map(), unresolvedIds: new Set() },
    memberCategories: [],
    rulesStatus: 'ready',
  };
  return { useGuessContext: () => value };
});
jest.mock('@/data/mutations/transactions', () => ({
  useAddTransaction: () => ({ add: mockAdd }),
  useEditTransaction: () => ({ edit: jest.fn(() => true) }),
  useDeleteTransaction: () => ({ remove: jest.fn(() => 'del-step') }),
  useMarkPaid: () => ({ markPaid: jest.fn(() => 'paid-step') }),
  useSkipOccurrence: () => ({ skip: jest.fn(() => 'skip-step') }),
}));
jest.mock('@/data/mutations/transfers', () => ({
  useAddTransfer: () => ({ add: jest.fn(() => ({ transferId: 'tr1', stepId: 'tr-step' })) }),
  useEditTransfer: () => ({ edit: jest.fn(() => 'tre-step') }),
  useDeleteTransfer: () => ({ remove: jest.fn(() => 'trd-step') }),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../useCapCrossing', () => ({ useCapCrossing: () => ({ check: () => false }) }));
jest.mock('@/data/queries/fxLatest', () => ({ useFxLatest: () => ({ data: [] }) }));
jest.mock('@/data/queries/moneyPrefs', () => ({ useMoneyPrefs: () => ({ prefs: { lead_figure: 'home' } }) }));
jest.mock('@/features/record/categories/useCategoryMonthUsage', () => ({ useCategoryMonthUsage: () => ({ usage: new Map(), isLoading: false }) }));
jest.mock('@/data/mutations/undoCapture', () => ({ newStepId: () => 'step-1' }));
jest.mock('@/data/mutations/bulkAdd', () => ({ useBulkAdd: () => ({ save: jest.fn(() => 'bulk-step') }) }));
jest.mock('@/data/mutations/recurringSeries', () => ({
  ...jest.requireActual('@/data/mutations/recurringSeries'),
  useCreateSeries: () => ({ create: jest.fn(() => 'series-step') }),
  useEditSeriesFrom: () => ({ editFrom: jest.fn(() => 'sedit-step') }),
  useEndSeries: () => ({ end: jest.fn(() => 'send-step') }),
}));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: [] }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'series-1' }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/data/queries/accounts', () => ({
  useAccounts: () => ({
    data: [
      { id: 'a1', name: 'Current', currency: 'GBP', archived_at: null },
      { id: 'a2', name: 'Savings', currency: 'GBP', archived_at: null },
    ],
  }),
}));
jest.mock('@/data/queries/categories', () => {
  const list = [
    { id: 'g1', builtin_key: null, name: 'Groceries', color_key: 'teal', is_system: false, archived_at: null },
    { id: 'd1', builtin_key: null, name: 'Dining', color_key: 'teal', is_system: false, archived_at: null },
    { id: 'i1', builtin_key: 'Income', name: 'Income', color_key: 'teal', is_system: true, archived_at: null },
  ];
  return {
    useCategoryLookup: () => ({
      active: list,
      byId: new Map(list.map((c) => [c.id, c])),
      transferCategoryId: 'tc',
    }),
  };
});
jest.mock('@/data/queries/currencyOptions', () => ({
  useCurrencyOptions: () => ({
    options: [{ code: 'GBP', name: 'Pound', symbol: '£', exponent: 2, kind: 'iso', rateDate: null }],
    loading: false,
  }),
}));
jest.mock('@/data/queries/activity', () => ({
  useTransferLegs: () => ({ legs: [], isLoading: false, isPending: false, fetchStatus: 'idle', isError: false, isSuccess: true }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({
    ready: true,
    userId: 'u1',
    householdId: 'h1',
    homeCurrency: 'GBP',
    showCents: true,
    region: 'GB',
    timeZone: 'Europe/London',
    today: '2026-09-25',
  }),
}));

function row(over: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: 't1',
    household_id: 'h1',
    account_id: 'a1',
    original_amount: -1250,
    original_currency: 'GBP',
    home_currency: 'GBP',
    local_date: '2026-09-20',
    name: 'Coffee',
    category_id: null,
    payment_type: 'card',
    status: 'paid',
    note: null,
    version: 3,
    transfer_id: null,
    rate_source: 'same-currency',
    rate_date: null,
    rate_pending: false,
    ...over,
  } as TransactionRow;
}

async function open(mode: React.ComponentProps<typeof TransactionSheet>['mode']) {
  return render(
    <ThemeProvider>
      <TransactionSheet visible mode={mode} onClose={jest.fn()} />
    </ThemeProvider>
  );
}
type Out = Awaited<ReturnType<typeof open>>;

async function typeName(out: Out, text: string) {
  await fireEvent.changeText(out.getByLabelText('What is it for?'), text);
  await act(async () => {
    jest.advanceTimersByTime(260);
  });
}

async function pick(out: Out, name: string) {
  await fireEvent.press(out.getByLabelText(/^Category/));
  await fireEvent.press(out.getByText(name));
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  resetToastForTests();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('TransactionSheet: category suggestion and rule offer (REC-27)', () => {
  it('fills the category from the description after the debounce and labels it Suggested', async () => {
    const out = await open({ kind: 'new', direction: 'out' });
    await fireEvent.changeText(out.getByLabelText('What is it for?'), 'Tesco');
    expect(out.queryByText('Suggested')).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(260);
    });
    expect(out.getByText('Groceries')).toBeTruthy();
    expect(out.getByText('Suggested')).toBeTruthy();
    expect(out.getByLabelText('Category, Groceries, suggested from the description')).toBeTruthy();
  });

  it('returns to Uncategorised when the guess disappears', async () => {
    const out = await open({ kind: 'new', direction: 'out' });
    await typeName(out, 'Tesco');
    await typeName(out, 'Tescx');
    expect(out.getByText('Uncategorised')).toBeTruthy();
    expect(out.queryByText('Suggested')).toBeNull();
  });

  it('never changes a hand-picked category', async () => {
    const out = await open({ kind: 'new', direction: 'out' });
    await pick(out, 'Dining');
    await typeName(out, 'Tesco');
    expect(out.queryByText('Suggested')).toBeNull();
    expect(out.getByText('Dining')).toBeTruthy();
  });

  it('offers a rule after correcting a suggestion and creates a Just me rule on accept', async () => {
    const out = await open({ kind: 'new', direction: 'out' });
    await typeName(out, 'Tesco');
    await pick(out, 'Dining');
    expect(out.getByText('Always use Dining for “Tesco”?')).toBeTruthy();
    await fireEvent.press(out.getByText('Make it a rule'));
    expect(mockAddRule).toHaveBeenCalledTimes(1);
    expect(mockAddRule).toHaveBeenCalledWith({
      ownerId: 'u1',
      householdId: 'h1',
      scope: 'personal',
      keyword: 'Tesco',
      category: DINING,
    });
    expect(getToast()?.text).toEqual({ key: 'undo.label.ruleAdded', params: { name: 'Tesco' } });
    expect(mockHapticLight).toHaveBeenCalled();
    expect(out.queryByText('Make it a rule')).toBeNull();
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('Not now hides the offer and stores nothing', async () => {
    const out = await open({ kind: 'new', direction: 'out' });
    await typeName(out, 'Tesco');
    await pick(out, 'Dining');
    await fireEvent.press(out.getByText('Not now'));
    expect(out.queryByText('Make it a rule')).toBeNull();
    expect(mockAddRule).not.toHaveBeenCalled();
  });

  it('another pick hides the offer', async () => {
    const out = await open({ kind: 'new', direction: 'out' });
    await typeName(out, 'Tesco');
    await pick(out, 'Dining');
    expect(out.getByText('Make it a rule')).toBeTruthy();
    await pick(out, 'Groceries');
    expect(out.queryByText('Make it a rule')).toBeNull();
    expect(mockAddRule).not.toHaveBeenCalled();
  });

  it('saving hides the offer and stores no rule', async () => {
    const out = await open({ kind: 'new', direction: 'out' });
    await typeName(out, 'Tesco');
    await pick(out, 'Dining');
    await fireEvent.press(out.getByText('Save expense'));
    expect(out.queryByText('Make it a rule')).toBeNull();
    expect(mockAddRule).not.toHaveBeenCalled();
  });

  it('suggests Income for money in with no other match', async () => {
    const out = await open({ kind: 'new', direction: 'in' });
    await typeName(out, 'Bonus payment');
    expect(out.getByText('Suggested')).toBeTruthy();
    expect(out.getByLabelText('Category, Income, suggested from the description')).toBeTruthy();
  });

  it('does not guess for a transfer', async () => {
    const out = await open({ kind: 'new', direction: 'out' });
    await fireEvent.press(out.getByText('Transfer'));
    expect(out.queryByText('Suggested')).toBeNull();
    expect(out.queryByText('Make it a rule')).toBeNull();
  });

  it('keeps the stored category of an edited row', async () => {
    const out = await open({ kind: 'edit', row: row({ category_id: 'd1', name: 'Coffee' }) });
    await typeName(out, 'Tesco');
    expect(out.queryByText('Suggested')).toBeNull();
    expect(out.getByText('Dining')).toBeTruthy();
  });

  it('guesses for an edited row with no category', async () => {
    const out = await open({ kind: 'edit', row: row({ category_id: null, name: 'Coffee' }) });
    await typeName(out, 'Tesco');
    expect(out.getByText('Suggested')).toBeTruthy();
    expect(out.getByText('Groceries')).toBeTruthy();
  });
});
