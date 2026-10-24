// 02.3 D-13: "Add account" at the end of every entry-sheet account picker; the new account comes
// back selected on the side that asked, with nothing typed lost.
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { TransactionSheet } from '../TransactionSheet';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.setTimeout(30000);

type SheetProps = { visible: boolean; mode: unknown; onClose: () => void; onSaved?: (id: string) => void };
let mockSheetProps: SheetProps | null = null;
jest.mock('@/features/record/accounts/AccountSheet', () => ({
  AccountSheet: (p: SheetProps) => {
    mockSheetProps = p;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Text } = require('react-native');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const R = require('react');
    return p.visible ? R.createElement(Text, null, 'account-sheet-open') : null;
  },
}));

const BASE = [
  { id: 'a1', name: 'Current', currency: 'GBP', archived_at: null },
  { id: 'a2', name: 'Savings', currency: 'GBP', archived_at: null },
];
let mockAccounts: { id: string; name: string; currency: string; archived_at: null }[] = BASE;

jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: mockAccounts }) }));
jest.mock('@/data/mutations/transactions', () => ({
  useAddTransaction: () => ({ add: jest.fn(() => 'new-id') }),
  useEditTransaction: () => ({ edit: jest.fn(() => true) }),
  useDeleteTransaction: () => ({ remove: jest.fn(() => 'del') }),
  useMarkPaid: () => ({ markPaid: jest.fn() }),
  useSkipOccurrence: () => ({ skip: jest.fn() }),
}));
jest.mock('@/data/mutations/transfers', () => ({
  useAddTransfer: () => ({ add: jest.fn(() => ({ transferId: 't', stepId: 's' })) }),
  useEditTransfer: () => ({ edit: jest.fn() }),
  useDeleteTransfer: () => ({ remove: jest.fn() }),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../useCapCrossing', () => ({ useCapCrossing: () => ({ check: () => false }) }));
jest.mock('@/data/queries/fxLatest', () => ({ useFxLatest: () => ({ data: [] }) }));
jest.mock('@/data/queries/moneyPrefs', () => ({ useMoneyPrefs: () => ({ prefs: { lead_figure: 'home' } }) }));
jest.mock('@/features/record/categories/useCategoryMonthUsage', () => ({ useCategoryMonthUsage: () => ({ usage: new Map(), isLoading: false }) }));
jest.mock('@/data/mutations/undoCapture', () => ({ newStepId: () => 'step-1' }));
jest.mock('@/data/mutations/bulkAdd', () => ({ useBulkAdd: () => ({ save: jest.fn(() => 'bulk-step') }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'series-1' }));
jest.mock('@/data/mutations/recurringSeries', () => ({
  ...jest.requireActual('@/data/mutations/recurringSeries'),
  useCreateSeries: () => ({ create: jest.fn(() => 'series-step') }),
  useEditSeriesFrom: () => ({ editFrom: jest.fn(() => 'sedit-step') }),
  useEndSeries: () => ({ end: jest.fn(() => 'send-step') }),
}));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: [] }) }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
const mockAddRule = jest.fn((..._a: unknown[]) => ({ id: 'rule-1', stepId: 'rule-step' }));
jest.mock('@/data/mutations/categoryRules', () => ({ useAddRule: () => ({ add: mockAddRule }) }));
jest.mock('@/features/record/useGuessContext', () => {
  const value = {
    guess: {
      keywordRules: jest.requireActual('@/engine/categorize').DEFAULT_KEYWORD_RULES,
      learned: new Map(),
      builtinIds: new Map(),
      personalRules: [],
      sharedRules: [],
    },
    rules: [],
    resolved: { personal: [], shared: [], byRuleId: new Map(), unresolvedIds: new Set() },
    memberCategories: [],
    rulesStatus: 'ready',
  };
  return { useGuessContext: () => value };
});
jest.mock('@/data/queries/categories', () => ({
  useCategoryLookup: () => ({ active: [], byId: new Map(), transferCategoryId: 'tc' }),
}));
jest.mock('@/data/queries/currencyOptions', () => ({
  useCurrencyOptions: () => ({
    options: [
      { code: 'GBP', name: 'Pound', symbol: '£', exponent: 2, kind: 'iso', rateDate: null },
      { code: 'EUR', name: 'Euro', symbol: '€', exponent: 2, kind: 'iso', rateDate: null },
    ],
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

const NEW_ACC = { id: 'new-acc', name: 'Travel', currency: 'EUR', archived_at: null } as const;

function ui(mode: React.ComponentProps<typeof TransactionSheet>['mode']) {
  return (
    <ThemeProvider>
      <TransactionSheet visible mode={mode} onClose={jest.fn()} />
    </ThemeProvider>
  );
}

beforeEach(() => {
  mockAccounts = BASE;
  mockSheetProps = null;
});

describe('TransactionSheet: Add account from the entry (02.3 D-13)', () => {
  it('opens the AccountSheet in new/later mode after the picker closes', async () => {
    const u = await render(ui({ kind: 'new', direction: 'out' }));
    await fireEvent.press(u.getByLabelText('Account'));
    await fireEvent.press(u.getByLabelText('Add account'));
    await waitFor(() => expect(u.getByText('account-sheet-open')).toBeTruthy());
    expect(mockSheetProps?.mode).toEqual({ kind: 'new', context: 'later' });
  });

  it('returns with the new account selected, the line currency kept (D-93) and the typed name kept', async () => {
    const u = await render(ui({ kind: 'new', direction: 'out' }));
    await fireEvent.changeText(u.getByLabelText('What is it for?'), 'Taxi');
    await fireEvent.press(u.getByLabelText('Account'));
    await fireEvent.press(u.getByLabelText('Add account'));
    await waitFor(() => expect(u.getByText('account-sheet-open')).toBeTruthy());
    mockAccounts = [...BASE, NEW_ACC];
    await act(async () => {
      mockSheetProps?.onSaved?.('new-acc');
      mockSheetProps?.onClose();
    });
    await waitFor(() => expect(u.getByText('Travel')).toBeTruthy());
    // The line stays in its current (home) currency; the new EUR account does not switch it.
    expect(u.queryAllByText('EUR')).toHaveLength(0);
    expect(u.getByDisplayValue('Taxi')).toBeTruthy();
  });

  it('applies the selection once the row appears on a later render', async () => {
    const u = await render(ui({ kind: 'new', direction: 'out' }));
    await fireEvent.press(u.getByLabelText('Account'));
    await fireEvent.press(u.getByLabelText('Add account'));
    await waitFor(() => expect(u.getByText('account-sheet-open')).toBeTruthy());
    await act(async () => {
      mockSheetProps?.onSaved?.('new-acc');
      mockSheetProps?.onClose();
    });
    expect(u.queryByText('Travel')).toBeNull();
    mockAccounts = [...BASE, NEW_ACC];
    await u.rerender(ui({ kind: 'new', direction: 'out' }));
    await waitFor(() => expect(u.getByText('Travel')).toBeTruthy());
  });

  it('transfer: Add account from To selects it as To', async () => {
    const u = await render(ui({ kind: 'new', direction: 'transfer' }));
    await fireEvent.press(u.getByLabelText('To account'));
    await fireEvent.press(u.getByLabelText('Add account'));
    await waitFor(() => expect(u.getByText('account-sheet-open')).toBeTruthy());
    mockAccounts = [...BASE, NEW_ACC];
    await act(async () => {
      mockSheetProps?.onSaved?.('new-acc');
      mockSheetProps?.onClose();
    });
    await waitFor(() => expect(u.getByText('Travel')).toBeTruthy());
    // From is unchanged (the first account).
    expect(u.getByText('Current')).toBeTruthy();
  });

  it('transfer: Add account from From selects it as From', async () => {
    const u = await render(ui({ kind: 'new', direction: 'transfer' }));
    await fireEvent.press(u.getByLabelText('From account'));
    await fireEvent.press(u.getByLabelText('Add account'));
    await waitFor(() => expect(u.getByText('account-sheet-open')).toBeTruthy());
    mockAccounts = [...BASE, NEW_ACC];
    await act(async () => {
      mockSheetProps?.onSaved?.('new-acc');
      mockSheetProps?.onClose();
    });
    await waitFor(() => expect(u.getByText('Travel')).toBeTruthy());
  });

  it('cancelling the AccountSheet leaves the previous selection', async () => {
    const u = await render(ui({ kind: 'new', direction: 'out' }));
    await fireEvent.press(u.getByLabelText('Account'));
    await fireEvent.press(u.getByLabelText('Add account'));
    await waitFor(() => expect(u.getByText('account-sheet-open')).toBeTruthy());
    await act(async () => {
      mockSheetProps?.onClose();
    });
    expect(u.queryByText('account-sheet-open')).toBeNull();
    expect(u.getByText('Current')).toBeTruthy();
    expect(u.queryByText('Travel')).toBeNull();
  });
});
