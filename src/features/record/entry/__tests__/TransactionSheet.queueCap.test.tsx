import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { TransactionRow } from '@/db/rows';
import { resetToastForTests } from '@/state/undoToast';
import { TransactionSheet } from '../TransactionSheet';

// 06-37: OccurrenceActions marks goal lines paid through useGoalLinePay; these sheets never open a goal line.
jest.mock('@/features/household/sharing/SharedGroup', () => ({ SharedGroup: () => null, useSharedEntry: () => ({ commit: () => undefined }) })); // 08-19: the household data layer is not part of this test
jest.mock('@/features/grow/goals/useGoalLinePay', () => ({ useGoalLinePay: () => ({ pay: jest.fn(() => true) }) }));
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
// 06.2-11 (L02, D-20): the save moment marks the new rows and gives one light tap.
const mockMarkJustSaved = jest.fn();
const mockTap = jest.fn();
jest.mock('@/state/justSaved', () => ({
  ...jest.requireActual('@/state/justSaved'),
  markJustSaved: (...a: unknown[]) => mockMarkJustSaved(...a),
}));
jest.mock('@/ui/haptics', () => ({
  ...jest.requireActual('@/ui/haptics'),
  hapticTap: () => mockTap(),
}));
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

const { setMockQueued } = jest.requireMock('@/data/sync/useQueueGuard') as { setMockQueued: (n: number) => void };

async function open(mode: React.ComponentProps<typeof TransactionSheet>['mode']) {
  return render(
    <ThemeProvider>
      <TransactionSheet visible mode={mode} onClose={jest.fn()} />
    </ThemeProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  resetToastForTests();
  mockLegs = [];
  mockRates = [];
  mockSeries = [];
  mockTransferCat = 'tc';
  mockNoAccounts = false;
  mockHome = 'GBP';
  mockRegion = 'GB';
  mockV3 = false;
  mockLegsRead = { isPending: false, fetchStatus: 'idle', isError: false, isSuccess: true };
});
afterEach(() => setMockQueued(0));

describe('TransactionSheet: queue cap (10-13, D-27, D-28)', () => {
  it('create mode at 500 waiting: owner message, Save disabled and says why, form still editable', async () => {
    setMockQueued(500);
    const { getByText, getByLabelText, getAllByLabelText } = await open({ kind: 'new', direction: 'out' });
    expect(getByText('You have 500 changes waiting to send. Connect to the internet to send them, then you can add more. Nothing is lost.')).toBeTruthy();
    const save = getByLabelText('Save expense');
    expect(save.props.accessibilityState.disabled).toBe(true);
    expect(save.props.accessibilityHint).toContain('500 changes waiting');
    await fireEvent.press(getAllByLabelText(/^Amount/)[0]!);
    expect(getByLabelText('Delete last digit')).toBeTruthy();
    await fireEvent.press(save);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('create mode at 420 waiting: calm note, Save enabled', async () => {
    setMockQueued(420);
    const { getByText, getByLabelText } = await open({ kind: 'new', direction: 'out' });
    expect(getByText('420 changes waiting to send')).toBeTruthy();
    expect(getByLabelText('Save expense').props.accessibilityState.disabled).toBe(false);
  });

  it('create mode under 400: no note', async () => {
    setMockQueued(399);
    const { queryByTestId } = await open({ kind: 'new', direction: 'out' });
    expect(queryByTestId('queue-note')).toBeNull();
  });

  it('edit mode at 500 waiting: Save is enabled and there is no note', async () => {
    setMockQueued(500);
    const { getByLabelText, queryByTestId } = await open({ kind: 'edit', row: row() });
    expect(queryByTestId('queue-note')).toBeNull();
    expect(getByLabelText('Save changes').props.accessibilityState.disabled).toBe(false);
  });
});
