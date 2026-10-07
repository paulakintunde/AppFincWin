import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
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
    totals: { paidIn: 0, paidOut: -1250, net: -1250, stillToCome: -500, pendingCount: 1, projectedCount: 1, unconvertedCount: 2, transferCount: 0 },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useTransactionMonths: () => ({ months: mockMonths, isLoading: false }),
  SEARCH_MIN_CHARS: 2,
  useTransactionsSearch: (_h: string | null, term: string) => ({
    rows: mockSearchRows,
    isLoading: false,
    enabled: term.trim().length >= 2,
  }),
}));
jest.mock('@/data/queries/accounts', () => ({
  useAccounts: () => ({
    data: [
      { id: 'a1', name: 'Current', currency: 'GBP', archived_at: null },
      { id: 'a2', name: 'Savings', currency: 'GBP', archived_at: null },
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
    expect(screen.getByText('Paid')).toBeTruthy();
    expect(screen.getByText('Skipped')).toBeTruthy();
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
    expect(screen.queryByText('Paid')).toBeNull();
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
    expect(screen.getByText('Delete 2 transactions?')).toBeTruthy();
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
