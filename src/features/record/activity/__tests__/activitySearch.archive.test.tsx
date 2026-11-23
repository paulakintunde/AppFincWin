// 10-24 (D-13, DAT-01, UI-SPEC 4d, T-10-24-05): an archived month's rows are absent from the Every month search for the person who
// archived it, and come back the moment the month is restored. Drives the real ActivityScreen / useActivityViewModel.
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { mockScreen } from './activityScreenMocks';
import type { ActivityRowView } from '@/data/queries/activity';
import { resetToastForTests } from '@/state/undoToast';
import { ActivityShellProviders, setArchiveStateForTests } from './activityShellHarness';
import { ActivityScreen } from '../ActivityScreen';
import { resetActivityFocusForTests } from '@/state/activityFocus';

jest.mock('@/features/household/sharing/BulkShare', () => ({ BulkShare: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.setTimeout(30000);

const mockTotals = { paidIn: 0, paidOut: 0, net: 0, stillToCome: 0, pendingCount: 0, projectedCount: 0, unconvertedCount: 0, transferCount: 0, count: 0 };
let mockSearchRows: ActivityRowView[] = [];
const mockSearchSpy = jest.fn();

jest.mock('@/data/mutations/patches', () => ({
  useBulkDelete: () => ({ remove: jest.fn() }),
  useBulkMarkPaid: () => ({ markPaid: jest.fn() }),
  useBulkMarkUnpaid: () => ({ markUnpaid: jest.fn() }),
  useBulkPatch: () => ({ apply: mockScreen.apply }),
}));
jest.mock('@/data/mutations/transactions', () => ({
  useMarkPaid: () => ({ markPaid: jest.fn() }),
  useDeleteTransaction: () => ({ remove: jest.fn() }),
}));
jest.mock('@/data/queries/activity', () => ({
  useMonthView: () => ({ rows: [], projections: [], totals: mockTotals, isLoading: false, isError: false, dataState: 'ready', refetch: jest.fn() }),
  useTransactionMonths: () => ({ months: ['2026-10', '2026-09', '2026-08'], counts: new Map(), isLoading: false }),
  SEARCH_MIN_CHARS: 2,
  useTransactionsSearch: (_h: string | null, term: string) => {
    mockSearchSpy(term);
    const enabled = term.trim().length >= 2;
    return { rows: mockSearchRows, isLoading: false, enabled, isPending: false, fetchStatus: 'idle', isError: false, isSuccess: enabled };
  },
}));
jest.mock('@/data/queries/decide', () => ({ ...jest.requireActual('@/data/queries/decide'), useDebts: () => ({ data: [] }) }));
jest.mock('@/data/queries/growDebts', () => ({ useDebtPayments: () => ({ data: undefined }) }));
jest.mock('@/data/queries/fxLatest', () => ({ useFxLatest: () => ({ data: [] }) }));
jest.mock('@/data/queries/pendingSplit', () => ({ usePaidBefore: () => ({ legs: [], isLoading: false }) }));
jest.mock('@/data/queries/accounts', () => ({
  useAccounts: () => ({ data: [{ id: 'a1', name: 'Current', currency: 'GBP', archived_at: null, deleted_at: null, opening_balance: 0 }] }),
}));
jest.mock('@/data/queries/categories', () => ({
  useCategoryLookup: () => {
    const groceries = { id: 'c1', builtin_key: null, name: 'Groceries', color_key: 'teal', is_system: false, archived_at: null, monthly_cap: null };
    const transfer = { id: 'tc', builtin_key: 'Transfer', name: null, color_key: 'slate', is_system: true, archived_at: null };
    return { all: [groceries, transfer], active: [groceries], byId: new Map<string, unknown>([['c1', groceries], ['tc', transfer]]), transferCategoryId: 'tc', loading: false };
  },
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
    today: '2026-10-25',
    weekStart: 1,
  }),
}));
jest.mock('@/features/record/entry/TransactionSheet', () => ({ TransactionSheet: () => null }));

function row(over: Partial<ActivityRowView>): ActivityRowView {
  return {
    id: 'r1',
    household_id: 'h1',
    account_id: 'a1',
    original_amount: -450,
    original_currency: 'GBP',
    home_currency: 'GBP',
    local_date: '2026-10-03',
    name: 'Coffee',
    category_id: 'c1',
    payment_type: null,
    status: 'paid',
    note: null,
    transfer_id: null,
    version: 1,
    created_at: '2026-10-03T10:00:00Z',
    amountHome: -450,
    overdue: false,
    counterpartAccountId: null,
    ...over,
  } as ActivityRowView;
}

// A new element per call: rerendering the same element object would bail out.
const tree = () => (
  <ActivityShellProviders>
    <ActivityScreen onOpenAccounts={jest.fn()} onOpenHistory={jest.fn()} initialMonth="2026-10" />
  </ActivityShellProviders>
);

async function searchEveryMonth(screen: Awaited<ReturnType<typeof render>>, term: string) {
  await fireEvent.press(screen.getByLabelText('Search'));
  await fireEvent.press(screen.getByText('Every month'));
  await fireEvent.changeText(screen.getByPlaceholderText('Search every month'), term);
  await act(async () => {
    jest.advanceTimersByTime(250);
  });
}

describe('Activity Every month search and archived months (D-13)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetActivityFocusForTests();
    jest.clearAllMocks();
    resetToastForTests();
    setArchiveStateForTests([]);
    mockSearchRows = [
      row({ id: 'aug', name: 'Coffee August', local_date: '2026-08-14' }),
      row({ id: 'oct', name: 'Coffee October', local_date: '2026-10-03' }),
    ];
  });
  afterEach(() => jest.useRealTimers());

  it('archived months leave the results and the count, and return on restore without a new search', async () => {
    setArchiveStateForTests(['2026-08']);
    const screen = await render(tree());
    await searchEveryMonth(screen, 'coffee');
    expect(screen.getByText('Coffee October')).toBeTruthy();
    expect(screen.queryByText('Coffee August')).toBeNull();
    expect(screen.getByText('1 transaction')).toBeTruthy();

    const searchesBefore = mockSearchSpy.mock.calls.length;
    // The restore mutation's optimistic update empties the archived list; the hook then reports no archived months.
    setArchiveStateForTests([]);
    await screen.rerender(tree());
    expect(screen.getByText('Coffee October')).toBeTruthy();
    expect(screen.getByText('Coffee August')).toBeTruthy();
    expect(screen.getByText('2 transactions')).toBeTruthy();
    // Same search term and scope: the hook was only re-rendered with the same arguments (the query key does not change).
    const terms = new Set(mockSearchSpy.mock.calls.slice(searchesBefore).map((c) => c[0]));
    expect([...terms].every((t) => t === 'coffee')).toBe(true);
  });

  it('archive off: search results are exactly as before', async () => {
    const screen = await render(tree());
    await searchEveryMonth(screen, 'coffee');
    expect(screen.getByText('Coffee October')).toBeTruthy();
    expect(screen.getByText('Coffee August')).toBeTruthy();
  });
});
