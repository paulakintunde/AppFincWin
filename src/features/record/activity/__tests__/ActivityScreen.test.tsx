import React from 'react';
import { Dimensions, ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { mockScreen } from './activityScreenMocks';
import type { ActivityRowView, ProjectionView } from '@/data/queries/activity';
import { getToast, resetToastForTests } from '@/state/undoToast';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityShellProviders } from './activityShellHarness';
import { monthPositionOf } from '../monthFigureInputs';
import { focusAccessibility } from '@/shell/a11yFocus';
import { ActivityScreen } from '../ActivityScreen';
import { ACTIVITY_VIEW_KEY } from '../activityViewPrefs';
import { resetActivityFocusForTests } from '@/state/activityFocus';
import { FAB_CLEARANCE } from '@/shell/fab/useShellPositions';

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
const mockTotals = { paidIn: 0, paidOut: -1250, net: -1250, stillToCome: -500, pendingCount: 1, projectedCount: 1, unconvertedCount: 2, transferCount: 0, count: 2 };
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
    totals: mockTotals,
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

beforeEach(() => {
  resetActivityFocusForTests();
  jest.clearAllMocks();
  resetToastForTests();
  mockRows = [];
  mockProjections = [];
  mockMonths = ['2026-10', '2026-09', '2026-08'];
  mockSearchRows = [];
  mockSearchLoading = false;
  mockSearchPaused = false;
  mockSearchError = false;
});

type Screen = Awaited<ReturnType<typeof renderScreen>>;
// D-45: Select entries lives in the More menu; the menu closes itself on choice.
const enterSelect = async (screen: Screen) => {
  await fireEvent.press(screen.getByLabelText('More actions. Opens a menu.'));
  await fireEvent.press(screen.getByText('Select entries'));
};
const openSearch = async (screen: Screen) => {
  await fireEvent.press(screen.getByLabelText('Search'));
};

describe('ActivityScreen sync line at rest (G5, D-15)', () => {
  const sync = jest.requireMock('@/data/sync/useSyncStatus') as { useSyncStatus: unknown };
  const original = sync.useSyncStatus;
  afterEach(() => {
    sync.useSyncStatus = original;
  });
  const goOffline = () => {
    sync.useSyncStatus = () => ({ isOnline: false, queued: 0, failed: 0, conflicts: 0, lastSyncedAt: null });
  };

  it('shows the offline line at scroll 0 in the list view', async () => {
    goOffline();
    const screen = await renderScreen();
    expect(screen.getByTestId('sync-problem-line')).toBeTruthy();
    expect(screen.getByText('offline')).toBeTruthy();
  });

  it('shows the offline line at scroll 0 in the calendar view', async () => {
    goOffline();
    await AsyncStorage.setItem(ACTIVITY_VIEW_KEY, JSON.stringify({ view: 'calendar', sort: 'newest' }));
    const screen = await renderScreen();
    await screen.findByTestId('calendar-scroll');
    expect(screen.getByTestId('sync-problem-line')).toBeTruthy();
    expect(screen.getByText('offline')).toBeTruthy();
    await AsyncStorage.removeItem(ACTIVITY_VIEW_KEY);
  });

  it('keeps the last calendar row clear of the FAB (list clearance is asserted in source grep; the FlashList mock drops the prop)', async () => {
    await AsyncStorage.setItem(ACTIVITY_VIEW_KEY, JSON.stringify({ view: 'calendar', sort: 'newest' }));
    const cal = await renderScreen();
    const scroll = await cal.findByTestId('calendar-scroll');
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle)).toEqual({ paddingBottom: FAB_CLEARANCE });
    await AsyncStorage.removeItem(ACTIVITY_VIEW_KEY);
  });
});

describe('ActivityScreen', () => {
  it('calendar view scrolls the selected day detail into view', async () => {
    await AsyncStorage.setItem(ACTIVITY_VIEW_KEY, JSON.stringify({ view: 'calendar', sort: 'newest' }));
    mockRows = [row({ id: 'g', name: 'Coffee' })];
    const screen = await renderScreen();
    await screen.findByTestId('calendar-scroll');
    const scrollTo = jest.fn();
    const spy = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(scrollTo);
    await fireEvent.press(screen.getByLabelText(/^Sep 20, 1 line/));
    const detail = screen.getByText('Sep 20, 2026').parent!.parent!;
    await act(async () => {
      detail.props.onLayout({ nativeEvent: { layout: { x: 0, y: 321, width: 100, height: 50 } } });
    });
    expect(scrollTo).toHaveBeenCalledWith({ y: 321, animated: true });
    spy.mockRestore();
    await AsyncStorage.removeItem(ACTIVITY_VIEW_KEY);
  });

  it('shows the empty state for a month with nothing in it', async () => {
    const screen = await renderScreen();
    expect(screen.getByText('Nothing in September 2026 yet.')).toBeTruthy();
    expect(screen.getByText('Add the first one with the Add button, clone August’s lines that aren’t already repeating, or paste a list.')).toBeTruthy();
  });

  it('groups still-to-come, paid and skipped rows under section headers', async () => {
    mockRows = [
      row({ id: 'p', name: 'Phone bill', status: 'pending', local_date: '2026-09-28' }),
      row({ id: 'g', name: 'Coffee' }),
      row({ id: 's', name: 'Gym', status: 'skipped' }),
    ];
    const screen = await renderScreen();
    // D-43: the totals strip is gone, so the section header is the only 'Still to come' label.
    expect(screen.getAllByText('Still to come')).toHaveLength(1);
    expect(screen.getAllByText('Paid')[0]).toBeTruthy();
    expect(screen.getAllByText('Skipped')[0]).toBeTruthy();
    expect(screen.getByText('Phone bill')).toBeTruthy();
  });

  it('counts lines waiting for a rate rather than guessing', async () => {
    mockRows = [row({})];
    const screen = await renderScreen();
    expect(screen.getByText('2 lines waiting for a rate')).toBeTruthy();
  });

  it('moves between months with the chevrons and disables them at the ends', async () => {
    mockRows = [row({})];
    const screen = await renderScreen({ initialMonth: '2026-10' });
    expect(screen.getByLabelText('Next month').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText('Previous month'));
    expect(screen.getByText('September 2026')).toBeTruthy();
    expect(screen.getByLabelText('Next month').props.accessibilityState.disabled).toBe(false);
  });

  it('opens a row in the detail sheet, then Edit opens the transaction sheet in edit mode', async () => {
    mockRows = [row({ id: 'g1', name: 'Coffee' })];
    const screen = await renderScreen();
    await fireEvent.press(screen.getByTestId('activity-row-g1'));
    await fireEvent.press(screen.getByText('Edit transaction'));
    expect(screen.getByTestId('sheet-stub').props.children).toBe('edit:g1');
  });

  it('marks a pending row paid in one tap and offers Undo for a real step', async () => {
    mockRows = [row({ id: 'p1', name: 'Phone bill', status: 'pending', local_date: '2026-09-28' })];
    const screen = await renderScreen();
    await fireEvent.press(screen.getByLabelText('Mark paid'));
    expect(mockMarkPaid).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), 'u1', '2026-09-25');
    expect(getToast()?.stepId).toBe('paid-step');
  });

  it('never offers Undo when mark paid records no step (null stepId)', async () => {
    mockMarkPaid.mockReturnValueOnce(null);
    mockRows = [row({ id: 'p1', name: 'Phone bill', status: 'pending', local_date: '2026-09-28' })];
    const screen = await renderScreen();
    await fireEvent.press(screen.getByLabelText('Mark paid'));
    expect(getToast()?.stepId ?? null).toBeNull();
  });

  it('flags an overdue pending row and keeps it pending', async () => {
    mockRows = [row({ id: 'o1', name: 'Rent', status: 'pending', local_date: '2026-09-01', overdue: true })];
    const screen = await renderScreen();
    expect(screen.getByText('Overdue')).toBeTruthy();
    expect(screen.getByLabelText('Mark paid')).toBeTruthy();
  });

  it('S-WR-14: the row label carries its tags and the home figure, not just name and amount', async () => {
    mockRows = [
      row({ id: 'o1', name: 'Rent', status: 'pending', local_date: '2026-09-01', overdue: true }),
      row({ id: 'e1', name: 'Hotel', original_amount: -10000, original_currency: 'EUR', amountHome: -8500, pending: true } as never),
    ];
    const screen = await renderScreen();
    const rent = screen.getByTestId('activity-row-o1').props.accessibilityLabel as string;
    expect(rent).toMatch(/^Rent, /);
    expect(rent).toContain('Overdue');
    const hotel = screen.getByTestId('activity-row-e1').props.accessibilityLabel as string;
    expect(hotel).toContain('£85.00');
    expect(hotel).toContain('€100.00');
    expect(hotel).toContain('queued');
  });

  it('renders a projection muted, tagged Expected, and not tappable', async () => {
    mockProjections = [
      { key: 's1:2026-09-30', seriesId: 's1', date: '2026-09-30', name: 'Netflix', amount: -999, currency: 'GBP', categoryId: null, accountId: 'a1', amountHome: -999 },
    ];
    const screen = await renderScreen();
    expect(screen.getByText('Netflix')).toBeTruthy();
    expect(screen.getByText('Expected')).toBeTruthy();
    await fireEvent.press(screen.getByText('Netflix'));
    expect(screen.queryByTestId('sheet-stub')).toBeNull();
  });

  it('names transfer legs by direction, with no Mark paid control', async () => {
    mockRows = [
      row({ id: 'tout', name: null, transfer_id: 't1', original_amount: -5000, status: 'pending', counterpartAccountId: 'a2', category_id: 'tc' }),
      row({ id: 'tin', name: null, transfer_id: 't2', original_amount: 5000, counterpartAccountId: 'a2', category_id: 'tc' }),
      row({ id: 'tnone', name: null, transfer_id: 't3', original_amount: 700, counterpartAccountId: null, category_id: 'tc' }),
    ];
    const screen = await renderScreen();
    expect(screen.getByText('Transfer to Savings')).toBeTruthy();
    expect(screen.getByText('Transfer from Savings')).toBeTruthy();
    expect(screen.getByText('Transfer')).toBeTruthy();
    expect(screen.queryByLabelText('Mark paid')).toBeNull();
  });

  it('is a shell tab root: the Activity header, one Profile avatar, no Add pill and no You link', async () => {
    const screen = await renderScreen();
    expect(screen.getByRole('header', { name: 'Activity' })).toBeTruthy();
    expect(screen.getAllByLabelText('Profile')).toHaveLength(1);
    expect(screen.queryByLabelText('Add')).toBeNull();
    expect(screen.queryByText('You')).toBeNull();
    expect(screen.queryByText('Money out')).toBeNull();
  });

  it('hands the shell refresh control and scroll handler to the list', async () => {
    const screen = await renderScreen();
    expect(screen.getByTestId('activity-list').props.accessibilityHint).toBe('refresh:true;scroll:true');
  });

  it('holds the FAB hidden while select mode is on and releases it after', async () => {
    mockRows = [row({ id: 'g1', name: 'Coffee' })];
    const screen = await renderScreen();
    expect(screen.getByTestId('fab-hidden').props.children).toBe('false');
    await enterSelect(screen);
    expect(screen.getByTestId('fab-hidden').props.children).toBe('true');
    await fireEvent.press(screen.getByText('Done'));
    expect(screen.getByTestId('fab-hidden').props.children).toBe('false');
  });

  it('reaches Accounts and History through the More menu', async () => {
    const onOpenAccounts = jest.fn();
    const onOpenHistory = jest.fn();
    const screen = await renderScreen({ onOpenAccounts, onOpenHistory });
    await fireEvent.press(screen.getByLabelText('More actions. Opens a menu.'));
    await fireEvent.press(screen.getByText('Accounts'));
    expect(onOpenAccounts).toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('More actions. Opens a menu.'));
    await fireEvent.press(screen.getByText('History'));
    expect(onOpenHistory).toHaveBeenCalled();
  });

  it('D-44: the large header is Activity plus the avatar, with no month eyebrow above it', async () => {
    const screen = await renderScreen();
    expect(screen.getByRole('header', { name: 'Activity' })).toBeTruthy();
    expect(screen.queryByText('September 2026', { exact: true })).toBeTruthy(); // month switcher only
    expect(screen.queryByTestId('eyebrow')).toBeNull();
  });
});

describe('ActivityScreen search, filters and bulk select', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const type = async (screen: Screen, placeholder: string, text: string) => {
    if (screen.queryByPlaceholderText(placeholder) === null) await openSearch(screen);
    await fireEvent.changeText(screen.getByPlaceholderText(placeholder), text);
    await act(async () => {
      jest.advanceTimersByTime(250);
    });
  };

  it('searches the current month by name', async () => {
    mockRows = [row({ id: 'a', name: 'Coffee' }), row({ id: 'b', name: 'Rent' })];
    const screen = await renderScreen();
    await type(screen, 'Search September 2026', 'cof');
    expect(screen.getByText('Coffee')).toBeTruthy();
    expect(screen.queryByText('Rent')).toBeNull();
  });

  it('searches every month through the server rows as one flat list', async () => {
    mockRows = [row({ id: 'a', name: 'Coffee' })];
    mockSearchRows = [
      row({ id: 's1', name: 'Coffee beans', local_date: '2026-03-02' }),
      row({ id: 's2', name: 'Coffee shop', local_date: '2026-07-02' }),
    ];
    const screen = await renderScreen();
    await openSearch(screen);
    await fireEvent.press(screen.getByText('Every month'));
    await type(screen, 'Search every month', 'coffee');
    expect(screen.getByText('Coffee beans')).toBeTruthy();
    expect(screen.getByText('Coffee shop')).toBeTruthy();
    // Two row tags, no section header (02.2-21 row tags).
    expect(screen.getAllByText('Paid')).toHaveLength(2);
  });

  it('S-IN-04: an every-month search still in flight says so, not Nothing matches', async () => {
    mockSearchLoading = true;
    const screen = await renderScreen();
    await openSearch(screen);
    await fireEvent.press(screen.getByText('Every month'));
    await type(screen, 'Search every month', 'coffee');
    expect(screen.queryByText('Nothing matches.')).toBeNull();
    expect(screen.getByText('Searching every month…')).toBeTruthy();
  });

  it('I-03: an every-month search paused offline says so, not Nothing matches', async () => {
    mockSearchPaused = true;
    const screen = await renderScreen();
    await openSearch(screen);
    await fireEvent.press(screen.getByText('Every month'));
    await type(screen, 'Search every month', 'coffee');
    expect(screen.queryByText('Nothing matches.')).toBeNull();
    expect(screen.queryByText('Searching every month…')).toBeNull();
    expect(screen.getByText('Every-month search needs a connection. It runs once you’re back online.')).toBeTruthy();
  });

  it('I-03: an every-month search that failed says so, not Nothing matches', async () => {
    mockSearchError = true;
    const screen = await renderScreen();
    await openSearch(screen);
    await fireEvent.press(screen.getByText('Every month'));
    await type(screen, 'Search every month', 'coffee');
    expect(screen.queryByText('Nothing matches.')).toBeNull();
    expect(screen.getByText('Every-month search couldn’t finish.')).toBeTruthy();
  });

  it('I-03: an every-month search that succeeded with no rows says Nothing matches', async () => {
    const screen = await renderScreen();
    await openSearch(screen);
    await fireEvent.press(screen.getByText('Every month'));
    await type(screen, 'Search every month', 'coffee');
    expect(screen.getByText('Nothing matches.')).toBeTruthy();
  });

  it('S-IN-05: deleting a selected transfer leg says both sides go', async () => {
    mockRows = [row({ id: 'tl', name: null, transfer_id: 't1', original_amount: -5000, counterpartAccountId: 'a2', category_id: 'tc' })];
    const screen = await renderScreen();
    await enterSelect(screen);
    await fireEvent.press(screen.getByLabelText('Select Transfer to Savings'));
    await fireEvent.press(screen.getByLabelText('Delete'));
    expect(screen.getByText('Delete 1 transaction? Transfers are deleted with both sides.')).toBeTruthy();
  });

  it('shows Nothing matches when a search finds nothing', async () => {
    mockRows = [row({ id: 'a', name: 'Coffee' })];
    const screen = await renderScreen();
    await type(screen, 'Search September 2026', 'zzz');
    expect(screen.getByText('Nothing matches.')).toBeTruthy();
  });

  it('filters by direction, shows a count badge and a chip, then clears back to everything', async () => {
    mockRows = [row({ id: 'a', name: 'Coffee' }), row({ id: 'b', name: 'Salary', original_amount: 200000, amountHome: 200000 })];
    const screen = await renderScreen();
    await fireEvent.press(screen.getByLabelText('Filter'));
    await fireEvent.press(screen.getByText('Money in'));
    await fireEvent.press(screen.getByText('Show results'));
    expect(screen.queryByText('Coffee')).toBeNull();
    expect(screen.getByText('Salary')).toBeTruthy();
    expect(screen.getByLabelText('Filter, 1 active')).toBeTruthy();
    expect(screen.getByLabelText('Filter: Money in. Opens filters.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Remove filter Money in'));
    expect(screen.getByText('Coffee')).toBeTruthy();
    expect(screen.getByLabelText('Filter')).toBeTruthy();
    expect(screen.queryByLabelText('Filter, 1 active')).toBeNull();
  });

  it('D-70: the card figure is the same with and without a filter; only the caption count narrows', async () => {
    mockRows = [row({ id: 'a', name: 'Coffee' }), row({ id: 'b', name: 'Salary', original_amount: 200000, amountHome: 200000 })];
    const screen = await renderScreen();
    const left = monthPositionOf({ rows: mockRows, projections: mockProjections, totals: mockTotals }).left;
    const digits = (Math.abs(left) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 }).replace('.', '\.');
    const expected = new RegExp(`^[-+−]?£?[-−]?${digits}$`);
    const card = () => within(screen.getByTestId('activity-summary-card'));
    const before = card().getAllByText(expected).length;
    expect(before).toBeGreaterThan(0);
    await fireEvent.press(screen.getByLabelText('Filter'));
    await fireEvent.press(screen.getByText('Money in'));
    await fireEvent.press(screen.getByText('Show results'));
    expect(card().getAllByText(expected)).toHaveLength(before);
    expect(card().getByText(/ of /)).toBeTruthy();
  });

  it('D-59..D-61: Search hides the card and Display row; Cancel clears the term, restores them and returns focus', async () => {
    mockRows = [row({ id: 'a', name: 'Coffee' }), row({ id: 'b', name: 'Rent' })];
    const screen = await renderScreen();
    await openSearch(screen);
    expect(screen.queryByTestId('activity-summary-card')).toBeNull();
    expect(screen.queryByLabelText(/display options$/)).toBeNull();
    await type(screen, 'Search September 2026', 'cof');
    expect(screen.queryByText('Rent')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Cancel search'));
    expect(screen.getByText('Rent')).toBeTruthy();
    expect(screen.getByText('Coffee')).toBeTruthy();
    expect(screen.getByTestId('activity-summary-card')).toBeTruthy();
    expect(screen.getByLabelText(/display options$/)).toBeTruthy();
    expect(focusAccessibility).toHaveBeenCalled();
  });

  it('Cancel within 250 ms of typing leaves the term empty', async () => {
    mockRows = [row({ id: 'a', name: 'Coffee' }), row({ id: 'b', name: 'Rent' })];
    const screen = await renderScreen();
    await openSearch(screen);
    await fireEvent.changeText(screen.getByPlaceholderText('Search September 2026'), 'cof');
    await fireEvent.press(screen.getByLabelText('Cancel search'));
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(screen.getByText('Coffee')).toBeTruthy();
    expect(screen.getByText('Rent')).toBeTruthy();
  });

  it('D-63: long-pressing a row enters select mode with that row ticked and the SelectBar replaces the Display row', async () => {
    mockRows = [row({ id: 'g1', name: 'Coffee' }), row({ id: 'g2', name: 'Rent' })];
    const screen = await renderScreen();
    await fireEvent(screen.getByTestId('activity-row-g1'), 'longPress');
    expect(within(screen.getByTestId('activity-select-bar')).getByText('1 selected')).toBeTruthy();
    expect(screen.getByTestId('activity-row-g1').props.accessibilityState.checked).toBe(true);
    expect(screen.queryByLabelText(/display options$/)).toBeNull();
  });

  it('D-68: choosing Calendar exits select mode, keeps the header and drops Select from More', async () => {
    mockRows = [row({ id: 'g1', name: 'Coffee' })];
    const screen = await renderScreen();
    await enterSelect(screen);
    expect(screen.getByTestId('activity-select-bar')).toBeTruthy();
    // select mode replaces the Display row, so leave it, then switch to Calendar.
    await fireEvent.press(screen.getByText('Done'));
    await fireEvent.press(screen.getByLabelText(/display options$/));
    await fireEvent.press(screen.getByText('Calendar'));
    await screen.findByTestId('calendar-scroll');
    expect(screen.queryByTestId('activity-select-bar')).toBeNull();
    const scroll = screen.getByTestId('calendar-scroll');
    expect(within(scroll).getByLabelText('Calendar, display options')).toBeTruthy();
    expect(within(scroll).getByTestId('activity-summary-card')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('More actions. Opens a menu.'));
    expect(screen.queryByText('Select entries')).toBeNull();
    await AsyncStorage.removeItem(ACTIVITY_VIEW_KEY);
  });

  it('D-58: the compact header reads Activity · month with Search, Filter and More and no avatar', async () => {
    const screen = await renderScreen();
    const compact = within(screen.getByTestId('compact-header', { includeHiddenElements: true }));
    expect(compact.getByText(/^Activity · Sep/, { includeHiddenElements: true })).toBeTruthy();
    expect(compact.getByLabelText('Search', { includeHiddenElements: true })).toBeTruthy();
    expect(compact.getByLabelText('Filter', { includeHiddenElements: true })).toBeTruthy();
    expect(compact.getByLabelText('More actions. Opens a menu.', { includeHiddenElements: true })).toBeTruthy();
    expect(compact.queryByLabelText('Profile', { includeHiddenElements: true })).toBeNull();
    // The hidden compact header blocks touches (pointerEvents none), so invoke the host's click
    // handler, which is what a screen-reader activation calls.
    const search = compact.getByTestId('compact-search-button', { includeHiddenElements: true });
    await act(async () => {
      search.props.onClick({ stopPropagation: () => undefined, nativeEvent: {} });
    });
    expect(screen.getByPlaceholderText('Search September 2026')).toBeTruthy();
  });

  it('selects rows with checkbox semantics and never lets a projection be selected', async () => {
    mockRows = [row({ id: 'a', name: 'Coffee' })];
    mockProjections = [
      { key: 's1:2026-09-30', seriesId: 's1', date: '2026-09-30', name: 'Netflix', amount: -999, currency: 'GBP', categoryId: null, accountId: 'a1', amountHome: -999 },
    ];
    const screen = await renderScreen();
    await enterSelect(screen);
    const box = screen.getByLabelText('Select Coffee');
    expect(box.props.accessibilityRole).toBe('checkbox');
    await fireEvent.press(box);
    expect(within(screen.getByTestId('activity-select-bar')).getByText('1 selected')).toBeTruthy();
    expect(screen.queryByLabelText('Select Netflix')).toBeNull();
    await fireEvent.press(screen.getByText('Done'));
    expect(screen.queryByTestId('bulk-bar')).toBeNull();
  });

  it('Unpaid only filter hides paid rows and keeps pending ones', async () => {
    mockRows = [
      row({ id: 'a', name: 'Coffee' }),
      row({ id: 'p', name: 'Phone bill', status: 'pending', local_date: '2026-09-28' }),
    ];
    const screen = await renderScreen();
    await fireEvent.press(screen.getByLabelText('Filter'));
    await fireEvent.press(screen.getByText('Unpaid only'));
    await fireEvent.press(screen.getByText('Show results'));
    expect(screen.getByText('Phone bill')).toBeTruthy();
    expect(screen.queryByText('Coffee')).toBeNull();
  });

  it('Select all and None drive the selection and never select a projection', async () => {
    mockRows = [row({ id: 'a', name: 'Coffee' }), row({ id: 'b', name: 'Rent' })];
    mockProjections = [
      { key: 's1:2026-09-30', seriesId: 's1', date: '2026-09-30', name: 'Netflix', amount: -999, currency: 'GBP', categoryId: null, accountId: 'a1', amountHome: -999 },
    ];
    const screen = await renderScreen();
    expect(screen.queryByText('Select all')).toBeNull();
    await enterSelect(screen);
    await fireEvent.press(screen.getByText('Select all'));
    const bar = () => within(screen.getByTestId('activity-select-bar'));
    expect(bar().getByText('2 selected')).toBeTruthy();
    // The count shows once, in the select bar; the bulk bar carries only its actions.
    expect(screen.getAllByText('2 selected')).toHaveLength(1);
    expect(within(screen.getByTestId('bulk-bar')).queryByText(/selected/)).toBeNull();
    await fireEvent.press(screen.getByText('None'));
    expect(bar().getByText('0 selected')).toBeTruthy();
  });

  it('asks to select first when an action is used with nothing selected', async () => {
    mockRows = [row({ id: 'a', name: 'Coffee' })];
    const screen = await renderScreen();
    await enterSelect(screen);
    await fireEvent.press(screen.getByLabelText('Delete'));
    expect(screen.getByText('Select some rows first.')).toBeTruthy();
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('bulk delete confirms with the count, passes transfer legs, and shows one undoable destructive toast', async () => {
    mockRows = [
      row({ id: 'a', name: 'Coffee' }),
      row({ id: 'tl', name: null, transfer_id: 't1', original_amount: -5000, counterpartAccountId: 'a2', category_id: 'tc' }),
      row({ id: 'z', name: 'Rent' }),
    ];
    const screen = await renderScreen();
    await enterSelect(screen);
    await fireEvent.press(screen.getByLabelText('Select Coffee'));
    await fireEvent.press(screen.getByLabelText('Select Transfer to Savings'));
    await fireEvent.press(screen.getByLabelText('Delete'));
    expect(screen.getByText('Delete 2 transactions? Transfers are deleted with both sides.')).toBeTruthy();
    expect(mockRemove).not.toHaveBeenCalled();
    await fireEvent.press(screen.getAllByText('Delete').at(-1)!);
    expect(mockRemove).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'a' }), expect.objectContaining({ id: 'tl', transfer_id: 't1' })]),
      { householdId: 'h1', ownerId: 'u1' }
    );
    const toast = getToast();
    expect(toast?.kind).toBe('destructive');
    expect(toast?.stepId).toBe('del-step');
    expect(screen.queryByTestId('bulk-bar')).toBeNull();
  });

  it('bulk Mark paid and Mark unpaid act on the selection with ordinary toasts', async () => {
    mockRows = [
      row({ id: 'p', name: 'Phone', status: 'pending', local_date: '2026-09-28' }),
      row({ id: 'g', name: 'Coffee' }),
    ];
    const screen = await renderScreen();
    await enterSelect(screen);
    await fireEvent.press(screen.getByLabelText('Select Phone'));
    await fireEvent.press(screen.getByLabelText('Mark paid'));
    expect(mockBulkPaid).toHaveBeenCalledWith([expect.objectContaining({ id: 'p' })], { householdId: 'h1', ownerId: 'u1' }, '2026-09-25');
    expect(getToast()?.kind).toBe('ordinary');
    expect(getToast()?.stepId).toBe('bp-step');
    await fireEvent.press(screen.getByLabelText('Select Coffee'));
    await fireEvent.press(screen.getByLabelText('Mark unpaid'));
    expect(mockBulkUnpaid).toHaveBeenCalled();
    expect(getToast()?.stepId).toBe('bu-step');
  });

  it('S-WR-02: Mark paid on only paid rows says so, and sends nothing', async () => {
    mockRows = [row({ id: 'g', name: 'Coffee' })];
    const screen = await renderScreen();
    await enterSelect(screen);
    await fireEvent.press(screen.getByLabelText('Select Coffee'));
    await fireEvent.press(screen.getByLabelText('Mark paid'));
    expect(mockBulkPaid).not.toHaveBeenCalled();
    expect(screen.getByText('None of the selected lines are still to come.')).toBeTruthy();
  });

  it('S-WR-02: Mark unpaid on only pending rows says so, and sends nothing', async () => {
    mockRows = [row({ id: 'p', name: 'Phone', status: 'pending', local_date: '2026-09-28' })];
    const screen = await renderScreen();
    await enterSelect(screen);
    await fireEvent.press(screen.getByLabelText('Select Phone'));
    await fireEvent.press(screen.getByLabelText('Mark unpaid'));
    expect(mockBulkUnpaid).not.toHaveBeenCalled();
    expect(screen.getByText('None of the selected lines are paid.')).toBeTruthy();
  });

  it('S-WR-02: a bulk delete refused for its size says so', async () => {
    mockRemove.mockImplementationOnce(() => {
      throw new RangeError('bulk patch: 6001 rows exceeds 6000');
    });
    mockRows = [row({ id: 'a', name: 'Coffee' })];
    const screen = await renderScreen();
    await enterSelect(screen);
    await fireEvent.press(screen.getByLabelText('Select Coffee'));
    await fireEvent.press(screen.getByLabelText('Delete'));
    await fireEvent.press(screen.getAllByText('Delete').at(-1)!);
    expect(screen.getByText('That’s more lines than one change can hold. Select fewer.')).toBeTruthy();
  });

  it('does not offer Undo when a bulk hook returns no step id', async () => {
    mockRemove.mockReturnValueOnce(null as unknown as string);
    mockRows = [row({ id: 'a', name: 'Coffee' })];
    const screen = await renderScreen();
    await enterSelect(screen);
    await fireEvent.press(screen.getByLabelText('Select Coffee'));
    await fireEvent.press(screen.getByLabelText('Delete'));
    await fireEvent.press(screen.getAllByText('Delete').at(-1)!);
    expect(getToast()?.stepId ?? null).toBeNull();
  });
});

describe('ActivityScreen small-screen header (02-polish item 3, 03.1 D-54)', () => {
  const flat = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as never) as Record<string, unknown>;
  const original = Dimensions.get('window');
  const layout = (width: number) => ({ nativeEvent: { layout: { x: 0, y: 0, width, height: 20 } } });

  afterEach(() => {
    Dimensions.set({ window: original });
  });

  it('at 320pt the month icons drop to their own row once the names are measured', async () => {
    Dimensions.set({ window: { ...original, width: 320 } });
    const screen = await renderScreen();
    await act(async () => {
      screen.getByTestId('activity-month-row').props.onLayout(layout(276));
      screen.getByTestId('month-measure-long', { includeHiddenElements: true }).props.onLayout(layout(110));
      screen.getByTestId('month-measure-short', { includeHiddenElements: true }).props.onLayout(layout(70));
    });
    expect(screen.getByTestId('activity-month-icons-row')).toBeTruthy();
  });

  it('lets the select-mode bar wrap instead of overflowing', async () => {
    const screen = await renderScreen();
    await enterSelect(screen);
    expect(flat(screen.getByTestId('activity-select-bar')).flexWrap).toBe('wrap');
  });
});

describe('ActivityScreen section colours (02-polish item 5)', () => {
  it('shows the Paid section header in the accent colour and Still to come in muted ink', async () => {
    mockRows = [
      row({ id: 'p', name: 'Phone bill', status: 'pending', local_date: '2026-09-28' }),
      row({ id: 'g', name: 'Coffee' }),
    ];
    const screen = await renderScreen();
    const style = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as never) as Record<string, unknown>;
    expect(style(screen.getAllByText('Paid')[0]!).color).toBe('#1B4D3E');
    expect(style(screen.getAllByText('Still to come')[0]!).color).toBe('#6E6A5E');
  });
});
