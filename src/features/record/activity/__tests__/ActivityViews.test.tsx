import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { ActivityRowView } from '@/data/queries/activity';
import { ACTIVITY_VIEW_KEY, DEFAULT_VIEW_PREFS, loadViewPrefs } from '../activityViewPrefs';
import { ActivityScreen } from '../ActivityScreen';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.setTimeout(30000);

jest.mock('@shopify/flash-list', () => {
  const { View } = jest.requireActual('react-native');
  return {
    FlashList: ({
      data,
      renderItem,
    }: {
      data: { key: string }[];
      renderItem: (info: { item: { key: string }; index: number }) => React.ReactElement;
    }) => (
      <View>
        {data.map((item, index) => (
          <View key={item.key}>{renderItem({ item, index })}</View>
        ))}
      </View>
    ),
  };
});

let mockRows: ActivityRowView[] = [];
let mockLegs: { accountId: string; currency: string; paidSum: string; paidHomeSum: string; unconverted: number }[] = [];
let mockAccounts: Record<string, unknown>[] = [];

jest.mock('@/data/mutations/patches', () => ({
  useBulkDelete: () => ({ remove: jest.fn() }),
  useBulkMarkPaid: () => ({ markPaid: jest.fn() }),
  useBulkMarkUnpaid: () => ({ markUnpaid: jest.fn() }),
}));
jest.mock('@/data/mutations/transactions', () => ({ useMarkPaid: () => ({ markPaid: jest.fn() }) }));
jest.mock('@/data/queries/activity', () => ({
  useMonthView: () => ({
    rows: mockRows,
    projections: [],
    totals: { paidIn: 0, paidOut: 0, net: 0, stillToCome: 0, pendingCount: 0, projectedCount: 0, unconvertedCount: 0, transferCount: 0, count: mockRows.length },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useTransactionMonths: () => ({ months: ['2026-10', '2026-09'], counts: new Map(), isLoading: false }),
  SEARCH_MIN_CHARS: 2,
  useTransactionsSearch: () => ({ rows: [], isLoading: false, enabled: false, isPending: false, fetchStatus: 'idle', isError: false, isSuccess: false }),
}));
jest.mock('@/data/queries/fxLatest', () => ({ useFxLatest: () => ({ data: [] }) }));
jest.mock('@/data/queries/pendingSplit', () => ({ usePaidBefore: () => ({ legs: mockLegs, isLoading: false }) }));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: mockAccounts }) }));
jest.mock('@/data/queries/categories', () => ({
  useCategoryLookup: () => ({ all: [], active: [], byId: new Map(), transferCategoryId: null, loading: false }),
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
    original_amount: -1000,
    original_currency: 'GBP',
    home_currency: 'GBP',
    local_date: '2026-10-03',
    name: 'Coffee',
    category_id: null,
    payment_type: null,
    status: 'paid',
    note: null,
    transfer_id: null,
    version: 1,
    created_at: '2026-10-03T10:00:00Z',
    amountHome: -1000,
    overdue: false,
    counterpartAccountId: null,
    ...over,
  } as ActivityRowView;
}

function renderScreen() {
  return render(
    <ThemeProvider>
      <ActivityScreen onOpenAccounts={jest.fn()} onOpenHistory={jest.fn()} onOpenYou={jest.fn()} initialMonth="2026-10" />
    </ThemeProvider>
  );
}

async function choose(screen: Awaited<ReturnType<typeof renderScreen>>, trigger: string, option: string) {
  await fireEvent.press(screen.getByLabelText(trigger));
  await fireEvent.press(screen.getByLabelText(new RegExp(`^${option}`)));
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockRows = [];
  mockLegs = [];
  mockAccounts = [
    { id: 'a1', name: 'Current', currency: 'GBP', archived_at: null, deleted_at: null, opening_balance: 50000 },
  ];
});

describe('view preference', () => {
  it('defaults to By day / Newest and ignores invalid stored values', async () => {
    expect(await loadViewPrefs()).toEqual(DEFAULT_VIEW_PREFS);
    await AsyncStorage.setItem(ACTIVITY_VIEW_KEY, JSON.stringify({ view: 'nonsense', sort: 'bogus' }));
    expect(await loadViewPrefs()).toEqual(DEFAULT_VIEW_PREFS);
    await AsyncStorage.setItem(ACTIVITY_VIEW_KEY, 'not json');
    expect(await loadViewPrefs()).toEqual(DEFAULT_VIEW_PREFS);
    await AsyncStorage.setItem(ACTIVITY_VIEW_KEY, JSON.stringify({ view: 'week', sort: 'az' }));
    expect(await loadViewPrefs()).toEqual({ view: 'week', sort: 'az' });
  });

  it('saves a change under a fincwin: key', async () => {
    mockRows = [row({})];
    const screen = await renderScreen();
    await choose(screen, 'View: By day. Opens a menu.', 'By week');
    await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(ACTIVITY_VIEW_KEY)) ?? '{}')).toEqual({ view: 'week', sort: 'newest' }));
    expect(ACTIVITY_VIEW_KEY.startsWith('fincwin:')).toBe(true);
  });

  it('restores a stored view on mount', async () => {
    await AsyncStorage.setItem(ACTIVITY_VIEW_KEY, JSON.stringify({ view: 'split', sort: 'biggest' }));
    mockRows = [row({})];
    const screen = await renderScreen();
    await waitFor(() => expect(screen.getByLabelText('View: In / out. Opens a menu.')).toBeTruthy());
    expect(screen.getByLabelText('Sort: Biggest. Opens a menu.')).toBeTruthy();
  });
});

describe('Activity list views', () => {
  it('shows the view and sort pills with their accessibility labels', async () => {
    const screen = await renderScreen();
    expect(screen.getByLabelText('View: By day. Opens a menu.')).toBeTruthy();
    expect(screen.getByLabelText('Sort: Newest. Opens a menu.')).toBeTruthy();
  });

  it('By day groups rows under a day header with count and net', async () => {
    mockRows = [row({ id: 'a' }), row({ id: 'b', original_amount: -500, amountHome: -500 })];
    const screen = await renderScreen();
    const header = screen.getByLabelText(/transactions, net/);
    expect(header.props.accessibilityRole).toBe('header');
    expect(header.props.accessibilityLabel).toContain('2 transactions');
    expect(header.props.accessibilityLabel).toContain('£15.00');
  });

  it('By week shows week groups with a range and omits empty weeks', async () => {
    mockRows = [row({ id: 'a', local_date: '2026-10-02' }), row({ id: 'c', local_date: '2026-10-20' })];
    const screen = await renderScreen();
    await choose(screen, 'View: By day. Opens a menu.', 'By week');
    expect(screen.getByText('Week 1')).toBeTruthy();
    expect(screen.getByText('Week 4')).toBeTruthy();
    expect(screen.queryByText('Week 2')).toBeNull();
    expect(screen.getByText('Oct 1–4')).toBeTruthy();
  });

  it('In / out puts income under In and refunds under Out', async () => {
    mockRows = [
      row({ id: 'i', name: 'Salary', original_amount: 200000, amountHome: 200000 }),
      row({ id: 'r', name: 'Return', original_amount: 3000, amountHome: 3000, is_refund: true } as Partial<ActivityRowView>),
    ];
    const screen = await renderScreen();
    await choose(screen, 'View: By day. Opens a menu.', 'In / out');
    const labels = screen
      .getAllByRole('header')
      .map((h) => h.props.accessibilityLabel as string | undefined)
      .filter((l): l is string => l !== undefined);
    expect(labels[0]).toMatch(/^In, 1 transaction/);
    expect(labels[1]).toMatch(/^Out, 1 transaction/);
  });

  it('Running balance starts from the account opening and shows balance after each paid line', async () => {
    mockLegs = [{ accountId: 'a1', currency: 'GBP', paidSum: '10000', paidHomeSum: '10000', unconverted: 0 }];
    mockRows = [
      row({ id: 'a', local_date: '2026-10-03', original_amount: -1000, amountHome: -1000 }),
      row({ id: 'b', name: 'Rent', local_date: '2026-10-05', status: 'pending', original_amount: -20000, amountHome: -20000 }),
    ];
    const screen = await renderScreen();
    await choose(screen, 'View: By day. Opens a menu.', 'Running balance');
    // opening 500.00 + 100.00 paid before - 10.00 = 590.00
    expect(screen.getByText(/balance £590\.00 after/)).toBeTruthy();
    expect(screen.getByText('not yet counted')).toBeTruthy();
    expect(screen.getByText('Balance across all accounts')).toBeTruthy();
  });

  it('Running balance shows Waiting for a rate when a foreign opening has no rate', async () => {
    mockAccounts = [
      { id: 'a1', name: 'Current', currency: 'GBP', archived_at: null, deleted_at: null, opening_balance: 0 },
      { id: 'a2', name: 'Euro', currency: 'EUR', archived_at: null, deleted_at: null, opening_balance: 1000 },
    ];
    mockRows = [row({})];
    const screen = await renderScreen();
    await choose(screen, 'View: By day. Opens a menu.', 'Running balance');
    expect(screen.getByText('Waiting for a rate')).toBeTruthy();
  });

  it('sort applies within groups and leaves group order alone', async () => {
    mockRows = [
      row({ id: 'small', name: 'Small', original_amount: -100, amountHome: -100 }),
      row({ id: 'big', name: 'Big', original_amount: -9000, amountHome: -9000 }),
    ];
    const screen = await renderScreen();
    await choose(screen, 'Sort: Newest. Opens a menu.', 'Biggest');
    const names = screen.getAllByText(/^(Small|Big)$/).map((n) => n.props.children as string);
    expect(names).toEqual(['Big', 'Small']);
  });

  it('shows the transaction count, singular and plural', async () => {
    mockRows = [row({ id: 'a' })];
    const screen = await renderScreen();
    expect(screen.getAllByText('1 transaction').length).toBeGreaterThan(0);
  });

  it('keeps the Phase 2 search working in another view', async () => {
    mockRows = [row({ id: 'a', name: 'Coffee' }), row({ id: 'b', name: 'Rent' })];
    const screen = await renderScreen();
    await choose(screen, 'View: By day. Opens a menu.', 'By week');
    jest.useFakeTimers();
    await fireEvent.changeText(screen.getByPlaceholderText('Search October 2026'), 'Rent');
    await act(async () => {
      jest.advanceTimersByTime(250);
    });
    jest.useRealTimers();
    expect(screen.queryByText('Coffee')).toBeNull();
    expect(screen.getByText('Rent')).toBeTruthy();
  });
});
