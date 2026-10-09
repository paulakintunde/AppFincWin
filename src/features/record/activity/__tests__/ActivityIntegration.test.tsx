import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render } from '@testing-library/react-native';
import { mockScreen } from './activityScreenMocks';
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
      ListHeaderComponent,
    }: {
      data: { key: string }[];
      renderItem: (info: { item: { key: string }; index: number }) => React.ReactElement;
      ListEmptyComponent?: React.ReactElement;
      ListHeaderComponent?: React.ReactElement | null;
    }) => (
      <View>
        {ListHeaderComponent}
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
let mockCounts: Map<string, number> = new Map();
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
  useTransactionMonths: () => ({ months: mockMonths, counts: mockCounts, isLoading: false }),
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
    recurring_series_id: null,
    is_refund: false,
    is_automatic: false,
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


beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  resetToastForTests();
  mockRows = [];
  mockProjections = [];
  mockMonths = ['2026-10', '2026-09', '2026-08'];
  mockCounts = new Map([['2026-10', 0], ['2026-09', 4], ['2026-08', 2]]);
  mockScreen.offers = [];
  mockSearchRows = [];
});

async function openDetail(screen: Awaited<ReturnType<typeof renderScreen>>, id: string) {
  await fireEvent.press(screen.getByTestId(`activity-row-${id}`));
}

describe('detail sheet and row actions', () => {
  it('a tap opens the read-only detail sheet, not the edit sheet', async () => {
    mockRows = [row({ id: 'g1', name: 'Coffee' })];
    const screen = await renderScreen();
    await openDetail(screen, 'g1');
    expect(screen.getByText('Edit transaction')).toBeTruthy();
    expect(screen.queryByTestId('sheet-stub')).toBeNull();
  });

  it('Mark as paid runs the pay path and shows an Undo toast', async () => {
    mockRows = [row({ id: 'p1', name: 'Phone bill', status: 'pending', local_date: '2026-09-28' })];
    const screen = await renderScreen();
    await openDetail(screen, 'p1');
    await fireEvent.press(screen.getByText('Mark as paid'));
    expect(mockMarkPaid).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), 'u1', '2026-09-25');
    expect(getToast()?.stepId).toBe('paid-step');
  });

  it('Edit opens the entry sheet in edit mode', async () => {
    mockRows = [row({ id: 'g1' })];
    const screen = await renderScreen();
    await openDetail(screen, 'g1');
    await fireEvent.press(screen.getByText('Edit transaction'));
    expect(screen.getByTestId('sheet-stub').props.children).toBe('edit:g1');
  });

  it('Clone opens a new, prefilled entry dated today in the current month and writes nothing', async () => {
    mockRows = [row({ id: 'g1', local_date: '2026-09-20' })];
    const screen = await renderScreen({ initialMonth: '2026-09' });
    await openDetail(screen, 'g1');
    await fireEvent.press(screen.getByText('Clone transaction'));
    const last = mockSheetProps.mock.calls.at(-1)![0] as { mode: { kind: string; localDate: string; prefill: { name: string } } };
    expect(last.mode).toMatchObject({ kind: 'new', localDate: '2026-09-25', prefill: { name: 'Coffee' } });
    expect(mockMarkPaid).not.toHaveBeenCalled();
    expect(mockSingleRemove).not.toHaveBeenCalled();
  });

  it('Delete on a plain line deletes at once with a destructive toast', async () => {
    mockRows = [row({ id: 'g1' })];
    const screen = await renderScreen();
    await openDetail(screen, 'g1');
    await fireEvent.press(screen.getByText('Delete transaction'));
    expect(mockSingleRemove).toHaveBeenCalledTimes(1);
    expect(getToast()).toMatchObject({ kind: 'destructive', stepId: 'single-del-step' });
  });

  it('Delete on a series occurrence asks This one / This and future first', async () => {
    mockRows = [row({ id: 's1', recurring_series_id: 'ser1' } as Partial<ActivityRowView>)];
    const screen = await renderScreen();
    await openDetail(screen, 's1');
    await fireEvent.press(screen.getByText('Delete transaction'));
    expect(mockSingleRemove).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('This one'));
    expect(mockSingleRemove).toHaveBeenCalledTimes(1);
    expect(mockScreen.end).not.toHaveBeenCalled();
  });

  it('Delete on a transfer leg uses the delete-both confirm', async () => {
    mockRows = [
      row({ id: 'o', transfer_id: 't1', account_id: 'a1', counterpartAccountId: 'a2', original_amount: -500 }),
      row({ id: 'i', transfer_id: 't1', account_id: 'a2', counterpartAccountId: 'a1', original_amount: 500 }),
    ];
    const screen = await renderScreen();
    await openDetail(screen, 'o');
    await fireEvent.press(screen.getByText('Delete transaction'));
    expect(screen.getByText(/Both linked entries/)).toBeTruthy();
    expect(mockScreen.removeTransfer).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Delete'));
    expect(mockScreen.removeTransfer).toHaveBeenCalledTimes(1);
  });

  it('a tap in select mode toggles selection and does not open the detail sheet', async () => {
    mockRows = [row({ id: 'p1', status: 'pending', local_date: '2026-09-28' })];
    const screen = await renderScreen();
    await fireEvent.press(screen.getByText('Select'));
    await fireEvent.press(screen.getByTestId('activity-row-p1'));
    expect(screen.queryByText('Edit transaction')).toBeNull();
  });
});

describe('views and offers', () => {
  it('Calendar is the fifth view, hides Select and the sort pill, and keeps the filters', async () => {
    mockRows = [row({ id: 'g1', local_date: '2026-09-20' })];
    const screen = await renderScreen();
    await fireEvent.press(screen.getByLabelText(/^View:/));
    await fireEvent.press(screen.getByLabelText(/^Calendar/));
    expect(screen.queryByText('Select')).toBeNull();
    expect(screen.queryByLabelText(/^Sort:/)).toBeNull();
    expect(screen.getByText('Filter')).toBeTruthy();
  });

  it('shows the series offer card in the list view and opens the review sheet', async () => {
    mockScreen.offers = [
      {
        key: 'k',
        previousMonth: '2026-08',
        latestRowId: 'r1',
        suggestion: { key: 'k', name: 'Gym', amount: -3000, currency: 'GBP', freq: 'monthly', anchorDate: '2026-09-05', rowIds: ['r1'] },
      },
    ];
    mockRows = [row({ id: 'g1', name: 'Coffee' })];
    const screen = await renderScreen();
    expect(screen.getByText('offer-card:1')).toBeTruthy();
    await fireEvent.press(screen.getByText('Review each'));
    expect(screen.getByText('review-sheet')).toBeTruthy();
  });
});

describe('month tools', () => {
  it('Add {Month} adds the month through the add-month mutation', async () => {
    const screen = await renderScreen({ initialMonth: '2026-10' });
    await fireEvent.press(screen.getByLabelText('Choose month'));
    await fireEvent.press(screen.getByText('Add November'));
    expect(mockScreen.addMonth).toHaveBeenCalledWith(expect.objectContaining({ monthLabel: 'November', today: '2026-09-25' }));
  });

  it('shows entry counts in the month list', async () => {
    const screen = await renderScreen();
    await fireEvent.press(screen.getByLabelText('Choose month'));
    expect(screen.getByText('4 entries')).toBeTruthy();
  });

  it('More offers Clone {PrevMonth} and Paste a list', async () => {
    const screen = await renderScreen({ initialMonth: '2026-09' });
    await fireEvent.press(screen.getByLabelText('More actions. Opens a menu.'));
    expect(screen.getAllByLabelText(/^Clone August/).length).toBeGreaterThan(0);
    await fireEvent.press(screen.getAllByLabelText(/^Paste a list/).at(-1)!);
    expect(screen.getByText('paste:2026-09')).toBeTruthy();
  });

  it('Clone from the earliest month says so and opens nothing', async () => {
    mockCounts = new Map([['2026-08', 2]]);
    const screen = await renderScreen({ initialMonth: '2026-08' });
    await fireEvent.press(screen.getByLabelText('More actions. Opens a menu.'));
    await fireEvent.press(screen.getByLabelText(/^Clone July/));
    expect(getToast()?.text).toMatchObject({ key: 'activity.clone.earliest' });
  });

  it('an empty month offers Clone and Paste when an earlier month has lines', async () => {
    const screen = await renderScreen({ initialMonth: '2026-10' });
    expect(screen.getByText('Nothing in October 2026 yet.')).toBeTruthy();
    expect(screen.getByText('Clone September')).toBeTruthy();
    await fireEvent.press(screen.getByText('Paste a list'));
    expect(screen.getByText('paste:2026-10')).toBeTruthy();
  });

  it('an empty earliest month offers Paste only', async () => {
    mockCounts = new Map([['2026-09', 0]]);
    const screen = await renderScreen({ initialMonth: '2026-09' });
    expect(screen.getByText('Add the first one with the Add button, or paste a list.')).toBeTruthy();
    expect(screen.queryByText('Clone August')).toBeNull();
  });
});
