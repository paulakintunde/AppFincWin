import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { TransactionRow } from '@/db/rows';
import { getToast, resetToastForTests } from '@/state/undoToast';
import { TransactionSheet } from '../TransactionSheet';

// 06-37 D-39: the edit form's Paid chip on a goal's Expected line saves through the goal confirm (useGoalLinePay), so the
// goal grows exactly once. Other edits in the same save are refused with a hint; a paid goal line may go back to Pending.
const mockGoalPay = jest.fn((..._a: unknown[]): boolean => true);
jest.mock('@/features/grow/goals/useGoalLinePay', () => ({ useGoalLinePay: () => ({ pay: mockGoalPay }) }));
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: mockV3 }) })); // 05.2-44: OccurrenceActions gates on v3
jest.mock('@/features/record/accounts/AccountSheet', () => ({ AccountSheet: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.setTimeout(30000);

const mockAdd = jest.fn(() => 'new-id');
const mockCheckCap = jest.fn((..._a: unknown[]) => false);
const mockPush = jest.fn();
let mockRates: { quote: string; rate: string; rate_date: string; source: string }[] = [];
const mockEdit = jest.fn(() => true);
const mockRemove = jest.fn((): string | null => 'del-step');
const mockAddTransfer = jest.fn(() => ({ transferId: 'tr1', stepId: 'tr-step' }));
const mockEditTransfer = jest.fn((): string | null => 'tre-step');
const mockRemoveTransfer = jest.fn(() => 'trd-step');
const mockTrack = jest.fn();
let mockLegs: TransactionRow[] = [];
let mockLegsRead: Record<string, unknown> = { isPending: false, fetchStatus: 'idle', isError: false, isSuccess: true };
let mockRegion = 'GB';
let mockTransferCat: string | null = 'tc';
let mockNoAccounts = false;
let mockHome = 'GBP';
let mockV3 = false;
let mockSeries: unknown[] = [];

jest.mock('@/data/mutations/transactions', () => ({
  useAddTransaction: () => ({ add: mockAdd }),
  useEditTransaction: () => ({ edit: mockEdit }),
  useDeleteTransaction: () => ({ remove: mockRemove }),
  useMarkPaid: () => ({ markPaid: jest.fn(() => 'paid-step') }),
  useSkipOccurrence: () => ({ skip: jest.fn(() => 'skip-step') }),
}));
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('../useCapCrossing', () => ({ useCapCrossing: () => ({ check: (...a: unknown[]) => mockCheckCap(...a) }) }));
jest.mock('@/data/queries/fxLatest', () => ({ useFxLatest: () => ({ data: mockRates }) }));
jest.mock('@/data/queries/moneyPrefs', () => ({ useMoneyPrefs: () => ({ prefs: { lead_figure: 'home' } }) }));
jest.mock('@/features/record/categories/useCategoryMonthUsage', () => ({ useCategoryMonthUsage: () => ({ usage: new Map(), isLoading: false }) }));
jest.mock('@/data/mutations/transfers', () => ({
  useAddTransfer: () => ({ add: mockAddTransfer }),
  useEditTransfer: () => ({ edit: mockEditTransfer }),
  useDeleteTransfer: () => ({ remove: mockRemoveTransfer }),
}));
jest.mock('@/data/mutations/undoCapture', () => ({ newStepId: () => 'step-1' }));
jest.mock('@/data/mutations/bulkAdd', () => ({ useBulkAdd: () => ({ save: jest.fn(() => 'bulk-step') }) }));
jest.mock('@/data/mutations/recurringSeries', () => ({
  ...jest.requireActual('@/data/mutations/recurringSeries'),
  useCreateSeries: () => ({ create: jest.fn(() => 'series-step') }),
  useEditSeriesFrom: () => ({ editFrom: jest.fn(() => 'sedit-step') }),
  useEndSeries: () => ({ end: jest.fn(() => 'send-step') }),
}));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: mockSeries }) }));
jest.mock('@/data/mutations/seriesAttributes', () => ({ usePatchSeriesAttributes: () => ({ patch: jest.fn(() => null) }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'series-1' }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: mockTrack }) }));
jest.mock('@/data/queries/accounts', () => ({
  useAccounts: () => ({
    data: mockNoAccounts
      ? []
      : [
          { id: 'a1', name: 'Current', currency: 'GBP', archived_at: null },
          { id: 'a2', name: 'Savings', currency: 'GBP', archived_at: null },
          { id: 'a3', name: 'Euro pot', currency: 'EUR', archived_at: null },
        ],
  }),
}));
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
  useCategoryLookup: () => ({
    active: [{ id: 'c1', builtin_key: null, name: 'Groceries', color_key: 'teal', is_system: false, archived_at: null }],
    byId: new Map(),
    transferCategoryId: mockTransferCat,
  }),
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
  useTransferLegs: () => ({ legs: mockLegs, isLoading: false, ...mockLegsRead }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({
    ready: true,
    userId: 'u1',
    householdId: 'h1',
    homeCurrency: mockHome,
    showCents: true,
    region: mockRegion,
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
    category_id: 'c1',
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

async function open(mode: React.ComponentProps<typeof TransactionSheet>['mode'], onClose = jest.fn()) {
  const utils = await render(
    <ThemeProvider>
      <TransactionSheet visible mode={mode} onClose={onClose} />
    </ThemeProvider>
  );
  return { ...utils, onClose };
}

beforeEach(() => {
  jest.clearAllMocks();
  resetToastForTests();
  mockLegs = [];
  mockRates = [];
  mockLegsRead = { isPending: false, fetchStatus: 'idle', isError: false, isSuccess: true };
  mockRegion = 'GB';
  mockV3 = false;
  mockSeries = [];
  mockTransferCat = 'tc';
  mockNoAccounts = false;
  mockHome = 'GBP';
  mockGoalPay.mockReset().mockReturnValue(true);
});

const goalLine = (over: Partial<TransactionRow> = {}) =>
  row({ id: 'g-line', name: 'Lisbon', status: 'pending', category_id: null, goal_id: 'goal-1', local_date: '2026-09-28', ...over });

describe('TransactionSheet: Paid chip on a goal line (06-37 D-39)', () => {
  it('Paid alone on a goal Expected line confirms through the goal path, never a plain edit', async () => {
    const { getByText, onClose } = await open({ kind: 'edit', row: goalLine() });
    await fireEvent.press(getByText('Paid'));
    await fireEvent.press(getByText('Save changes'));
    expect(mockEdit).not.toHaveBeenCalled();
    expect(mockGoalPay).toHaveBeenCalledTimes(1);
    expect(mockGoalPay.mock.calls[0]![0]).toMatchObject({ id: 'g-line', version: 3 });
    expect(mockGoalPay.mock.calls[0]![1]).toBe('goal-1');
    expect(onClose).toHaveBeenCalled();
  });

  it('a line tagged only through its series still confirms through the goal path', async () => {
    mockSeries = [{ id: 's9', name: 'Lisbon', goal_id: 'goal-9', version: 1, household_id: 'h1', end_date: null }];
    const { getByText } = await open({ kind: 'edit', row: goalLine({ goal_id: null, recurring_series_id: 's9' }) });
    await fireEvent.press(getByText('Paid'));
    await fireEvent.press(getByText('Save changes'));
    expect(mockEdit).not.toHaveBeenCalled();
    expect(mockGoalPay).toHaveBeenCalledTimes(1);
    expect(mockGoalPay.mock.calls[0]![1]).toBe('goal-9');
  });

  it('goal not loaded: nothing is written and the sheet stays open', async () => {
    mockGoalPay.mockReturnValue(false);
    const { getByText, onClose } = await open({ kind: 'edit', row: goalLine() });
    await fireEvent.press(getByText('Paid'));
    await fireEvent.press(getByText('Save changes'));
    expect(mockGoalPay).toHaveBeenCalledTimes(1);
    expect(mockEdit).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Paid together with another change writes nothing and shows the hint', async () => {
    const { getByText, getByLabelText, onClose } = await open({ kind: 'edit', row: goalLine() });
    await fireEvent.changeText(getByLabelText('What is it for?'), 'Lisbon trip');
    await fireEvent.press(getByText('Paid'));
    await fireEvent.press(getByText('Save changes'));
    expect(mockEdit).not.toHaveBeenCalled();
    expect(mockGoalPay).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(getToast()?.text?.key).toBe('record.sheet.goalLinePaidAlone');
  });

  it('other changes on a goal Expected line, staying Pending, save as a plain edit', async () => {
    const { getByText, getByLabelText } = await open({ kind: 'edit', row: goalLine() });
    await fireEvent.changeText(getByLabelText('What is it for?'), 'Lisbon trip');
    await fireEvent.press(getByText('Save changes'));
    expect(mockGoalPay).not.toHaveBeenCalled();
    expect(mockEdit).toHaveBeenCalledTimes(1);
    const [vars] = mockEdit.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(vars).toMatchObject({ patch: { name: 'Lisbon trip' } });
  });

  it("a paid goal line set back to Pending is a plain status patch (the same write the confirm's Undo makes)", async () => {
    const { getByText } = await open({ kind: 'edit', row: goalLine({ status: 'paid' }) });
    await fireEvent.press(getByText('Pending'));
    await fireEvent.press(getByText('Save changes'));
    expect(mockGoalPay).not.toHaveBeenCalled();
    expect(mockEdit).toHaveBeenCalledTimes(1);
    const [vars] = mockEdit.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(vars).toMatchObject({ patch: { status: 'pending' } });
  });

  it('a plain Expected line marked Paid in the form is unchanged: a plain edit', async () => {
    const { getByText } = await open({ kind: 'edit', row: row({ status: 'pending', local_date: '2026-09-28' }) });
    await fireEvent.press(getByText('Paid'));
    await fireEvent.press(getByText('Save changes'));
    expect(mockGoalPay).not.toHaveBeenCalled();
    expect(mockEdit).toHaveBeenCalledTimes(1);
    const [vars] = mockEdit.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(vars).toMatchObject({ patch: { status: 'paid' } });
  });
});
