import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { mockScreen } from './activityScreenMocks';
import type { ActivityRowView, ProjectionView } from '@/data/queries/activity';
import { resetToastForTests } from '@/state/undoToast';
import { EMPTY_FILTER } from '@/engine/activity';
import {
  consumeActivityFilterIntent,
  getSelectedMonth,
  requestActivityFocus,
  resetActivityFocusForTests,
  setSelectedMonth,
} from '@/state/activityFocus';
import { ActivityShellProviders } from './activityShellHarness';
import { ActivityScreen } from '../ActivityScreen';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.setTimeout(30000);


const mockMarkPaid = jest.fn((): string | null => 'paid-step');
let mockRows: ActivityRowView[] = [];
let mockProjections: ProjectionView[] = [];
let mockMonths: string[] = ['2026-10', '2026-09', '2026-08'];
const mockSheetProps = jest.fn();
let mockSearchRows: ActivityRowView[] = [];
let mockSearchLoading = false;
let mockSearchPaused = false;
let mockSearchError = false;
const mockRemove = jest.fn((): string => 'del-step');
const mockSingleRemove = jest.fn((): string | null => 'single-del-step');
const mockBulkPaid = jest.fn((): string => 'bp-step');
const mockBulkUnpaid = jest.fn((): string => 'bu-step');

jest.mock('@/data/mutations/patches', () => ({
  useBulkDelete: () => ({ remove: mockRemove }),
  useBulkMarkPaid: () => ({ markPaid: mockBulkPaid }),
  useBulkMarkUnpaid: () => ({ markUnpaid: mockBulkUnpaid }),
  useBulkPatch: () => ({ apply: mockScreen.apply }),
}));

jest.mock('@/data/mutations/transactions', () => ({
  useMarkPaid: () => ({ markPaid: mockMarkPaid }),
  useDeleteTransaction: () => ({ remove: mockSingleRemove }),
}));
jest.mock('@/data/queries/activity', () => ({
  useMonthView: () => ({
    rows: mockRows,
    projections: mockProjections,
    totals: { paidIn: 0, paidOut: -1250, net: -1250, stillToCome: -500, pendingCount: 1, projectedCount: 1, unconvertedCount: 2, transferCount: 0, count: 2 },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useTransactionMonths: () => ({ months: mockMonths, counts: new Map(mockMonths.map((m) => [m, 1])), isLoading: false }),
  SEARCH_MIN_CHARS: 2,
  useTransactionsSearch: (_h: string | null, term: string) => {
    const enabled = term.trim().length >= 2;
    const pending = enabled && (mockSearchLoading || mockSearchPaused) && !mockSearchError;
    return {
      rows: mockSearchRows,
      isLoading: enabled && mockSearchLoading,
      enabled,
      isPending: pending,
      fetchStatus: pending ? (mockSearchPaused ? 'paused' : 'fetching') : 'idle',
      isError: enabled && mockSearchError,
      isSuccess: enabled && !pending && !mockSearchError,
    };
  },
}));
jest.mock('@/data/queries/fxLatest', () => ({ useFxLatest: () => ({ data: [] }) }));
jest.mock('@/data/queries/pendingSplit', () => ({ usePaidBefore: () => ({ legs: [], isLoading: false }) }));
jest.mock('@/data/queries/accounts', () => ({
  useAccounts: () => ({
    data: [
      { id: 'a1', name: 'Current', currency: 'GBP', archived_at: null, deleted_at: null, opening_balance: 0 },
      { id: 'a2', name: 'Savings', currency: 'GBP', archived_at: null, deleted_at: null, opening_balance: 0 },
    ],
  }),
}));
jest.mock('@/data/queries/categories', () => ({
  useCategoryLookup: () => {
    const groceries = { id: 'c1', builtin_key: null, name: 'Groceries', color_key: 'teal', is_system: false, archived_at: null };
    const transfer = { id: 'tc', builtin_key: 'Transfer', name: null, color_key: 'slate', is_system: true, archived_at: null };
    return {
      all: [groceries, transfer],
      active: [groceries],
      byId: new Map<string, unknown>([['c1', groceries], ['tc', transfer]]),
      transferCategoryId: 'tc',
      loading: false,
    };
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
    today: '2026-09-25',
    weekStart: 1,
  }),
}));
jest.mock('@/features/record/entry/TransactionSheet', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    TransactionSheet: (props: { visible: boolean; mode: { kind: string; direction?: string; row?: { id: string } } }) => {
      mockSheetProps(props);
      return props.visible ? <Text testID="sheet-stub">{`${props.mode.kind}:${props.mode.direction ?? props.mode.row?.id ?? ''}`}</Text> : null;
    },
  };
});

function row(over: Partial<ActivityRowView>): ActivityRowView {
  return {
    id: 'r1',
    household_id: 'h1',
    account_id: 'a1',
    original_amount: -1250,
    original_currency: 'GBP',
    home_currency: 'GBP',
    local_date: '2026-09-20',
    name: 'Coffee',
    category_id: 'c1',
    payment_type: null,
    status: 'paid',
    note: null,
    transfer_id: null,
    version: 1,
    created_at: '2026-09-20T10:00:00Z',
    amountHome: -1250,
    overdue: false,
    counterpartAccountId: null,
    ...over,
  } as ActivityRowView;
}

function renderScreen(props: Partial<React.ComponentProps<typeof ActivityScreen>> = {}) {
  return render(
    <ActivityShellProviders>
      <ActivityScreen onOpenAccounts={jest.fn()} onOpenHistory={jest.fn()} initialMonth="2026-09" {...props} />
    </ActivityShellProviders>
  );
}

const UNPAID = { ...EMPTY_FILTER, unpaidOnly: true };
const PROJECTION: ProjectionView = {
  key: 's1:2026-09-30',
  seriesId: 's1',
  date: '2026-09-30',
  name: 'Netflix',
  amount: -1500,
  currency: 'GBP',
  categoryId: null,
  accountId: 'a1',
  amountHome: -1500,
};

beforeEach(() => {
  jest.clearAllMocks();
  resetToastForTests();
  resetActivityFocusForTests();
  mockRows = [];
  mockProjections = [];
  mockMonths = ['2026-10', '2026-09', '2026-08'];
  mockSearchRows = [];
  mockSearchLoading = false;
  mockSearchPaused = false;
  mockSearchError = false;
});

describe('Activity shared month and Unpaid focus', () => {
  it('reads the shared month, and writes it back when the month changes', async () => {
    setSelectedMonth('2026-08');
    mockRows = [row({ id: 'r', name: 'Coffee' })];
    const screen = await renderScreen({ initialMonth: '2026-10' });
    expect(screen.getByText('August 2026')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Next month'));
    expect(getSelectedMonth()).toBe('2026-09');
    expect(screen.getByText('September 2026')).toBeTruthy();
  });

  it('applies a focus request while mounted: month, Unpaid filter, cleared search, intent consumed', async () => {
    mockRows = [row({ id: 'r', name: 'Coffee' })];
    const screen = await renderScreen({ initialMonth: '2026-10' });
    expect(screen.getByLabelText('Filter')).toBeTruthy();
    await act(async () => {
      requestActivityFocus({ month: '2026-09', filter: UNPAID });
    });
    expect(screen.getByText('September 2026')).toBeTruthy();
    // D-57 / D-66: Unpaid is not counted, so the icon keeps its plain label and has no badge.
    expect(screen.getByLabelText('Filter')).toBeTruthy();
    expect(screen.queryByTestId('header-icon-badge', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByTestId('unpaid-banner')).toBeTruthy();
    expect(consumeActivityFilterIntent()).toBeNull();
  });

  it('under Unpaid lists the pending bill and the projection, not the income, and counts the projection', async () => {
    mockRows = [
      row({ id: 'bill', name: 'Phone bill', status: 'pending', original_amount: -5000, amountHome: -5000, local_date: '2026-09-28' }),
      row({ id: 'inc', name: 'Freelance', status: 'pending', original_amount: 3000, amountHome: 3000, local_date: '2026-09-27' }),
    ];
    mockProjections = [PROJECTION];
    const screen = await renderScreen();
    await act(async () => {
      requestActivityFocus({ month: '2026-09', filter: UNPAID });
    });
    expect(screen.getByText('Phone bill')).toBeTruthy();
    expect(screen.getByText('Netflix')).toBeTruthy();
    expect(screen.queryByText('Freelance')).toBeNull();
    expect(screen.getAllByText(/65\.00/).length).toBeGreaterThan(0);
  });

  it('hides projections under a category-only filter', async () => {
    mockProjections = [PROJECTION];
    mockRows = [row({ id: 'r', name: 'Coffee' })];
    const screen = await renderScreen();
    expect(screen.getByText('Netflix')).toBeTruthy();
    await act(async () => {
      requestActivityFocus({ month: '2026-09', filter: { ...EMPTY_FILTER, categoryIds: ['c1'] } });
    });
    expect(screen.queryByText('Netflix')).toBeNull();
    expect(screen.getByText('Coffee')).toBeTruthy();
  });

  it('hides projections while searching', async () => {
    jest.useFakeTimers();
    mockProjections = [PROJECTION];
    mockRows = [row({ id: 'r', name: 'Coffee' })];
    const screen = await renderScreen();
    await fireEvent.press(screen.getByLabelText('Search'));
    await fireEvent.changeText(screen.getByPlaceholderText('Search September 2026'), 'cof');
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.queryByText('Netflix')).toBeNull();
    jest.useRealTimers();
  });

  it('shows the Unpaid banner under the Unpaid filter, and Clear removes only that filter', async () => {
    mockRows = [row({ id: 'bill', name: 'Phone bill', status: 'pending', local_date: '2026-09-28' })];
    const screen = await renderScreen();
    expect(screen.queryByTestId('unpaid-banner')).toBeNull();
    await act(async () => {
      requestActivityFocus({ month: '2026-09', filter: { ...UNPAID, categoryIds: ['c1'] } });
    });
    expect(screen.getByTestId('unpaid-banner')).toBeTruthy();
    expect(screen.getByText(/Showing unpaid bills/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Clear the unpaid filter'));
    expect(screen.queryByTestId('unpaid-banner')).toBeNull();
    // The category filter the user also set stays on.
    expect(screen.getByLabelText('Filter, 1 active')).toBeTruthy();
  });

  it('Clear leaves the Filter chip unselected when Unpaid was the only filter', async () => {
    mockRows = [row({ id: 'bill', name: 'Phone bill', status: 'pending', local_date: '2026-09-28' })];
    const screen = await renderScreen();
    await act(async () => {
      requestActivityFocus({ month: '2026-09', filter: UNPAID });
    });
    await fireEvent.press(screen.getByLabelText('Clear the unpaid filter'));
    expect(screen.getByLabelText('Filter')).toBeTruthy();
  });

  it('D-59 / D-60: a Home intent while a search is open closes the search and lands on the filtered month', async () => {
    mockRows = [row({ id: 'r', name: 'Coffee' })];
    const screen = await renderScreen({ initialMonth: '2026-10' });
    await fireEvent.press(screen.getByLabelText('Search'));
    jest.useFakeTimers();
    await fireEvent.changeText(screen.getByPlaceholderText('Search October 2026'), 'cof');
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    jest.useRealTimers();
    await act(async () => {
      requestActivityFocus({ month: '2026-09', filter: UNPAID });
    });
    expect(screen.queryByLabelText('Search September 2026')).toBeNull();
    expect(screen.queryByPlaceholderText(/^Search /)).toBeNull();
    expect(screen.getByText('September 2026')).toBeTruthy();
    expect(screen.getByTestId('unpaid-banner')).toBeTruthy();
    expect(screen.getByLabelText('Search')).toBeTruthy();
  });

  it('has no banner under a non-unpaid filter', async () => {
    const screen = await renderScreen();
    await act(async () => {
      requestActivityFocus({ month: '2026-09', filter: { ...EMPTY_FILTER, direction: 'in' } });
    });
    expect(screen.queryByTestId('unpaid-banner')).toBeNull();
  });

  it('opens a read-only Expected detail from a projection row, with no Pay', async () => {
    mockProjections = [PROJECTION];
    const screen = await renderScreen();
    await fireEvent.press(screen.getByTestId('projection-s1:2026-09-30'));
    expect(screen.getByLabelText('Netflix', { hidden: true })).toBeTruthy();
    expect(screen.getAllByText('Expected').length).toBeGreaterThan(1);
    expect(screen.queryByText('Pay')).toBeNull();
    expect(screen.queryByText('Mark as paid')).toBeNull();
  });
});
