import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { ActivityRowView, ProjectionView } from '@/data/queries/activity';
import { getToast, resetToastForTests } from '@/state/undoToast';
import { ActivityScreen } from '../ActivityScreen';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.setTimeout(30000);

// A plain map keeps the list deterministic; FlashList's own layout needs a native measure pass.
jest.mock('@shopify/flash-list', () => {
  const { View } = jest.requireActual('react-native');
  return {
    FlashList: ({
      data,
      renderItem,
      ListEmptyComponent,
    }: {
      data: { key: string }[];
      renderItem: (info: { item: { key: string }; index: number }) => React.ReactElement;
      ListEmptyComponent?: React.ReactElement;
    }) => (
      <View>
        {data.length === 0 ? ListEmptyComponent : null}
        {data.map((item, index) => (
          <View key={item.key}>{renderItem({ item, index })}</View>
        ))}
      </View>
    ),
  };
});

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
const mockBulkPaid = jest.fn((): string => 'bp-step');
const mockBulkUnpaid = jest.fn((): string => 'bu-step');

jest.mock('@/data/mutations/patches', () => ({
  useBulkDelete: () => ({ remove: mockRemove }),
  useBulkMarkPaid: () => ({ markPaid: mockBulkPaid }),
  useBulkMarkUnpaid: () => ({ markUnpaid: mockBulkUnpaid }),
}));

jest.mock('@/data/mutations/transactions', () => ({
  useMarkPaid: () => ({ markPaid: mockMarkPaid }),
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
  useTransactionMonths: () => ({ months: mockMonths, isLoading: false }),
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
    <ThemeProvider>
      <ActivityScreen onOpenAccounts={jest.fn()} onOpenHistory={jest.fn()} onOpenYou={jest.fn()} initialMonth="2026-09" {...props} />
    </ThemeProvider>
  );
}

beforeEach(() => {
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

describe('ActivityScreen', () => {
  it('shows the empty state for a month with nothing in it', async () => {
    const screen = await renderScreen();
    expect(screen.getByText('Nothing in September 2026 yet.')).toBeTruthy();
    expect(screen.getByText('Add the first one with the Add button.')).toBeTruthy();
  });

  it('groups still-to-come, paid and skipped rows under section headers', async () => {
    mockRows = [
      row({ id: 'p', name: 'Phone bill', status: 'pending', local_date: '2026-09-28' }),
      row({ id: 'g', name: 'Coffee' }),
      row({ id: 's', name: 'Gym', status: 'skipped' }),
    ];
    const screen = await renderScreen();
    // One in the totals bar, one as the section header.
    expect(screen.getAllByText('Still to come')).toHaveLength(2);
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

  it('opens a row in the transaction sheet in edit mode', async () => {
    mockRows = [row({ id: 'g1', name: 'Coffee' })];
    const screen = await renderScreen();
    await fireEvent.press(screen.getByTestId('activity-row-g1'));
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

  it('Add offers money out, money in and transfer, and opens the sheet in new mode', async () => {
    const screen = await renderScreen();
    await fireEvent.press(screen.getByLabelText('Add'));
    await fireEvent.press(screen.getByText('Transfer'));
    expect(screen.getByTestId('sheet-stub').props.children).toBe('new:transfer');
  });

  it('calls the navigation props from the text links', async () => {
    const onOpenAccounts = jest.fn();
    const onOpenHistory = jest.fn();
    const onOpenYou = jest.fn();
    const screen = await renderScreen({ onOpenAccounts, onOpenHistory, onOpenYou });
    await fireEvent.press(screen.getByText('Accounts'));
    await fireEvent.press(screen.getByText('History'));
    await fireEvent.press(screen.getByText('You'));
    expect(onOpenAccounts).toHaveBeenCalled();
    expect(onOpenHistory).toHaveBeenCalled();
    expect(onOpenYou).toHaveBeenCalled();
  });
});

describe('ActivityScreen search, filters and bulk select', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  type Screen = Awaited<ReturnType<typeof renderScreen>>;
  const type = async (screen: Screen, placeholder: string, text: string) => {
    await fireEvent.changeText(screen.getByPlaceholderText(placeholder), text);
    await act(async () => {
      jest.advanceTimersByTime(250);
    });
  };
  const enterSelect = async (screen: Screen) => {
    await fireEvent.press(screen.getByText('Select'));
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
    await fireEvent.press(screen.getByText('Every month'));
    await type(screen, 'Search every month', 'coffee');
    expect(screen.queryByText('Nothing matches.')).toBeNull();
    expect(screen.getByText('Searching every month…')).toBeTruthy();
  });

  it('I-03: an every-month search paused offline says so, not Nothing matches', async () => {
    mockSearchPaused = true;
    const screen = await renderScreen();
    await fireEvent.press(screen.getByText('Every month'));
    await type(screen, 'Search every month', 'coffee');
    expect(screen.queryByText('Nothing matches.')).toBeNull();
    expect(screen.queryByText('Searching every month…')).toBeNull();
    expect(screen.getByText('Every-month search needs a connection. It runs once you’re back online.')).toBeTruthy();
  });

  it('I-03: an every-month search that failed says so, not Nothing matches', async () => {
    mockSearchError = true;
    const screen = await renderScreen();
    await fireEvent.press(screen.getByText('Every month'));
    await type(screen, 'Search every month', 'coffee');
    expect(screen.queryByText('Nothing matches.')).toBeNull();
    expect(screen.getByText('Every-month search couldn’t finish.')).toBeTruthy();
  });

  it('I-03: an every-month search that succeeded with no rows says Nothing matches', async () => {
    const screen = await renderScreen();
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

  it('filters by direction, then clears back to everything', async () => {
    mockRows = [row({ id: 'a', name: 'Coffee' }), row({ id: 'b', name: 'Salary', original_amount: 200000, amountHome: 200000 })];
    const screen = await renderScreen();
    await fireEvent.press(screen.getByLabelText('Filter'));
    await fireEvent.press(screen.getByText('Money in'));
    await fireEvent.press(screen.getByText('Show results'));
    expect(screen.queryByText('Coffee')).toBeNull();
    expect(screen.getByText('Salary')).toBeTruthy();
    expect(screen.getByLabelText('Filter').props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByLabelText('Filter'));
    await fireEvent.press(screen.getByText('Clear filters'));
    expect(screen.getByText('Coffee')).toBeTruthy();
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
    expect(screen.getByText('1 selected')).toBeTruthy();
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
    await fireEvent.press(screen.getByText('Filter'));
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
    expect(screen.getByText('2 selected')).toBeTruthy();
    await fireEvent.press(screen.getByText('None'));
    expect(screen.getByText('0 selected')).toBeTruthy();
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

describe('ActivityScreen small-screen header (02-polish item 3)', () => {
  const flat = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as never) as Record<string, unknown>;
  const original = Dimensions.get('window');

  afterEach(() => {
    Dimensions.set({ window: original });
  });

  it.each([320, 360])('at %ipt the month switcher and the nav links sit in separate rows and the links shrink to fit', async (width) => {
    Dimensions.set({ window: { ...original, width } });
    const screen = await renderScreen();
    const monthRow = screen.getByTestId('activity-month-row');
    const links = screen.getByTestId('activity-nav-links');
    // The switcher and the links never share one non-wrapping row.
    expect(links.parent).not.toBe(monthRow);
    expect(within(monthRow).getByLabelText('Choose month')).toBeTruthy();
    expect(within(links).queryByLabelText('Choose month')).toBeNull();
    expect(flat(links).flexDirection).toBe('row');
    for (const label of ['Accounts', 'History', 'You']) {
      const link = screen.getByLabelText(label);
      const style = flat(link);
      // Equal-width pills that can shrink below their content, label ellipsised.
      expect(style.flex).toBe(1);
      expect(style.minWidth).toBe(0);
      expect(screen.getByText(label).props.numberOfLines).toBe(1);
    }
  });

  it('lets the select-mode toolbar wrap instead of overflowing', async () => {
    const screen = await renderScreen();
    expect(flat(screen.getByTestId('activity-tools-row')).flexWrap).toBe('wrap');
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
    expect(style(screen.getAllByText('Still to come')[1]!).color).toBe('#6E6A5E');
  });
});
