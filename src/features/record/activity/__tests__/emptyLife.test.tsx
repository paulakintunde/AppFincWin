// 06.2-18 (D-24, L05, HOME-03): the new empty states. Activity's empty month shows the first-entry tile, one heading,
// one sentence and ONE button (clone last month when offered, otherwise Add a transaction) with paste as a quiet link;
// it leaves with a 0.15 s fade (instant under Reduce Motion). No-match shows the search tile and one Clear search
// button. The CR-01 guard holds: a failed or offline-uncached read never shows the empty month. History and Past
// decisions gain an icon tile only.
import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, within } from '@testing-library/react-native';
import { mockScreen } from './activityScreenMocks';
import type { ActivityRowView } from '@/data/queries/activity';
import { resetToastForTests } from '@/state/undoToast';
import { ActivityShellProviders } from './activityShellHarness';
import * as entryHost from '@/features/record/entry/entryHost';
import { ActivityScreen } from '../ActivityScreen';
import { EmptyState } from '@/ui/EmptyState';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.setTimeout(30000);

void mockScreen;
let mockRows: ActivityRowView[] = [];
let mockDataState: 'ready' | 'loading' | 'offline' | 'error' = 'ready';
let mockCounts: Map<string, number> = new Map();
const mockMotion = { reduced: false };
const mockTotals = { paidIn: 0, paidOut: 0, net: 0, stillToCome: 0, pendingCount: 0, projectedCount: 0, unconvertedCount: 0, transferCount: 0, count: 0 };

jest.mock('@/theme/motion', () => {
  const actual = jest.requireActual('@/theme/motion');
  return {
    ...actual,
    useMotion: () => ({
      reduced: mockMotion.reduced,
      duration: (ms: number) => (mockMotion.reduced ? 0 : ms),
      easing: actual.EASING,
      fade: (ms: number) => (mockMotion.reduced ? actual.DURATION.press : ms),
    }),
  };
});
jest.mock('@/data/mutations/patches', () => ({
  useBulkDelete: () => ({ remove: jest.fn() }),
  useBulkMarkPaid: () => ({ markPaid: jest.fn() }),
  useBulkMarkUnpaid: () => ({ markUnpaid: jest.fn() }),
  useBulkPatch: () => ({ apply: jest.fn() }),
}));
jest.mock('@/data/mutations/transactions', () => ({
  useMarkPaid: () => ({ markPaid: jest.fn() }),
  useDeleteTransaction: () => ({ remove: jest.fn() }),
}));
jest.mock('@/data/queries/activity', () => ({
  useMonthView: () => ({
    rows: mockRows,
    projections: [],
    totals: mockTotals,
    isLoading: false,
    isError: mockDataState === 'error',
    dataState: mockDataState,
    refetch: jest.fn(),
  }),
  useTransactionMonths: () => ({ months: ['2026-09', '2026-08'], counts: mockCounts, isLoading: false }),
  SEARCH_MIN_CHARS: 2,
  useTransactionsSearch: () => ({
    rows: [],
    isLoading: false,
    enabled: false,
    isPending: false,
    fetchStatus: 'idle',
    isError: false,
    isSuccess: false,
  }),
}));
jest.mock('@/data/queries/decide', () => ({
  ...jest.requireActual('@/data/queries/decide'),
  useDebts: () => ({ data: [] }),
}));
jest.mock('@/data/queries/growDebts', () => ({ useDebtPayments: () => ({ data: undefined }) }));
jest.mock('@/data/queries/fxLatest', () => ({ useFxLatest: () => ({ data: [] }) }));
jest.mock('@/data/queries/pendingSplit', () => ({ usePaidBefore: () => ({ legs: [], isLoading: false }) }));
jest.mock('@/data/queries/accounts', () => ({
  useAccounts: () => ({ data: [{ id: 'a1', name: 'Current', currency: 'GBP', archived_at: null, deleted_at: null, opening_balance: 0 }] }),
}));
jest.mock('@/data/queries/categories', () => ({
  useCategoryLookup: () => {
    const groceries = { id: 'c1', builtin_key: null, name: 'Groceries', color_key: 'teal', is_system: false, archived_at: null, monthly_cap: null };
    return { all: [groceries], active: [groceries], byId: new Map([['c1', groceries]]), transferCategoryId: null, loading: false };
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
jest.mock('@/features/record/entry/TransactionSheet', () => ({ TransactionSheet: () => null }));
jest.mock('../CloneMonthSheet', () => {
  const { Text } = jest.requireActual('react-native');
  const R = jest.requireActual('react');
  return {
    ...jest.requireActual('../CloneMonthSheet'),
    CloneMonthSheet: (p: { visible: boolean }) => (p.visible ? R.createElement(Text, null, 'clone-sheet') : null),
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

function renderScreen() {
  return render(
    <ActivityShellProviders>
      <ActivityScreen onOpenAccounts={jest.fn()} onOpenHistory={jest.fn()} initialMonth="2026-09" />
    </ActivityShellProviders>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  resetToastForTests();
  mockRows = [];
  mockDataState = 'ready';
  mockCounts = new Map([['2026-09', 0]]);
  mockMotion.reduced = false;
});

const buttonsIn = (block: ReturnType<typeof within>) => block.queryAllByRole('button');

describe('Activity empty month (L05, D-24)', () => {
  it('shows the first-entry tile, one heading, one sentence and Add a transaction as the one button', async () => {
    const open = jest.spyOn(entryHost, 'openEntry').mockImplementation(() => undefined);
    const screen = await renderScreen();
    const block = within(screen.getByTestId('activity-empty-month'));
    expect(block.getByTestId('activity-empty-tile', { includeHiddenElements: true })).toBeTruthy();
    expect(block.getByTestId('activity-empty-first-entry', { includeHiddenElements: true })).toBeTruthy();
    expect(block.getByText('Nothing in September 2026 yet.')).toBeTruthy();
    expect(block.getByText('Add the first one, or bring in a month from your bank statement.')).toBeTruthy();
    expect(buttonsIn(block)).toHaveLength(1);
    await fireEvent.press(block.getByText('Add a transaction'));
    expect(open).toHaveBeenCalledWith({ kind: 'new', direction: 'out' });
    open.mockRestore();
  });

  it('the tile is 48 with corner 11', async () => {
    const screen = await renderScreen();
    const tile = StyleSheet.flatten(screen.getByTestId('activity-empty-tile', { includeHiddenElements: true }).props.style);
    expect(tile).toMatchObject({ width: 48, height: 48, borderRadius: 11 });
  });

  it('offers clone as the one button when an earlier month has lines; paste stays as a quiet 44+ link', async () => {
    mockCounts = new Map([['2026-09', 0], ['2026-08', 3]]);
    const screen = await renderScreen();
    const block = within(screen.getByTestId('activity-empty-month'));
    expect(buttonsIn(block)).toHaveLength(1);
    expect(block.queryByText('Add a transaction')).toBeNull();
    await fireEvent.press(block.getByText('Clone August'));
    expect(screen.getByText('clone-sheet')).toBeTruthy();
    const paste = block.getByTestId('activity-empty-paste');
    expect(paste.props.accessibilityRole).toBe('link');
    const st = StyleSheet.flatten(typeof paste.props.style === 'function' ? paste.props.style({ pressed: false }) : paste.props.style);
    expect(st.minHeight).toBeGreaterThanOrEqual(space.touchMin);
    await fireEvent.press(paste);
    expect(screen.getByText('paste:2026-09')).toBeTruthy();
  });

  it('fades out over 0.15 s when rows arrive', async () => {
    const screen = await renderScreen();
    expect(screen.getByTestId('activity-empty-month').props.exiting).toBeDefined();
  });

  it('leaves at once under Reduce Motion', async () => {
    mockMotion.reduced = true;
    const screen = await renderScreen();
    expect(screen.getByTestId('activity-empty-month').props.exiting).toBeUndefined();
  });

  it('is replaced by the rows once a row arrives', async () => {
    const screen = await renderScreen();
    expect(screen.getByTestId('activity-empty-month')).toBeTruthy();
    mockRows = [row({ id: 'a' })];
    await screen.rerender(
      <ActivityShellProviders>
        <ActivityScreen onOpenAccounts={jest.fn()} onOpenHistory={jest.fn()} initialMonth="2026-09" />
      </ActivityShellProviders>
    );
    expect(screen.queryByTestId('activity-empty-month')).toBeNull();
    expect(screen.getByText('Coffee')).toBeTruthy();
  });

  it.each(['error', 'offline'] as const)('CR-01: a %s read is never an empty month', async (state) => {
    mockDataState = state;
    const screen = await renderScreen();
    expect(screen.queryByTestId('activity-empty-month')).toBeNull();
    expect(screen.queryByText('Nothing in September 2026 yet.')).toBeNull();
    expect(screen.queryByText('Add a transaction')).toBeNull();
  });
});

describe('Activity no-match (D-24)', () => {
  it('shows the search tile, the words and one Clear search button that sets the filter back to All', async () => {
    mockRows = [row({ id: 'a', name: 'Coffee' })];
    mockCounts = new Map([['2026-09', 1]]);
    const screen = await renderScreen();
    await fireEvent.press(screen.getByLabelText('Filter'));
    await fireEvent.press(screen.getByText('Money in'));
    await fireEvent.press(screen.getByText('Show results'));
    const block = within(screen.getByTestId('activity-no-match'));
    expect(block.getByTestId('empty-state-tile', { includeHiddenElements: true })).toBeTruthy();
    expect(block.getByText('Nothing matches.')).toBeTruthy();
    expect(block.getByText('Try a different search, or set the filter back to All.')).toBeTruthy();
    expect(buttonsIn(block)).toHaveLength(1);
    await fireEvent.press(block.getByText('Clear search'));
    expect(screen.queryByTestId('activity-no-match')).toBeNull();
    expect(screen.getByText('Coffee')).toBeTruthy();
    expect(screen.getByLabelText('Filter')).toBeTruthy();
  });
});

describe('History and Past decisions empty tiles (D-24)', () => {
  it('an icon-only EmptyState draws the 48 tile and no button', async () => {
    const s = await render(
      <ThemeProvider>
        <EmptyState icon="history" heading="No changes yet." body="Changes you make show here, and each one can be undone." />
      </ThemeProvider>
    );
    expect(s.getByTestId('empty-state-tile', { includeHiddenElements: true })).toBeTruthy();
    expect(s.queryAllByRole('button')).toHaveLength(0);
  });
});
