import { act, renderHook } from '@testing-library/react-native';
import { queryKeys } from '@/data/keys';
import { resetActivityFocusForTests } from '@/state/activityFocus';
import { useHomeViewModel } from '../useHomeViewModel';

const mock = {
  rc: {
    ready: true,
    userId: 'u1',
    householdId: 'hh1' as string | null,
    homeCurrency: 'GBP',
    showCents: true,
    today: '2026-10-13',
    horizonMonth: null,
  },
  monthView: {
    rows: [] as unknown[],
    projections: [] as unknown[],
    totals: {
      paidIn: 100000,
      paidOut: -20000,
      net: 80000,
      stillToCome: 0,
      pendingCount: 0,
      projectedCount: 0,
      unconvertedCount: 0,
      transferCount: 0,
      count: 3,
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  },
  accounts: [
    { id: 'a1', name: 'Current', archived_at: null, deleted_at: null },
    { id: 'a2', name: 'Old', archived_at: '2026-01-01', deleted_at: null },
    { id: 'a3', name: 'Gone', archived_at: null, deleted_at: '2026-02-01' },
  ],
  accountsLoading: false,
  balancesLoading: false,
};

jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => mock.rc }));
jest.mock('@/data/queries/activity', () => ({
  useMonthView: () => mock.monthView,
  useTransactionMonths: () => ({ months: ['2026-10', '2026-09'], counts: new Map(), isLoading: false }),
  useAccountBalances: () => ({ balances: new Map(), isLoading: mock.balancesLoading }),
}));
jest.mock('@/data/queries/accounts', () => ({
  useAccounts: () => ({ data: mock.accounts, isLoading: mock.accountsLoading }),
}));
jest.mock('@/features/record/activity/useRowActions', () => ({
  useRowActions: () => ({ enabled: true, pay: jest.fn(), unpay: jest.fn(), cloneMode: jest.fn() }),
}));
jest.mock('@/features/record/activity/useActivityViewModel', () => ({
  useRowFlow: () => ({ openDetail: jest.fn() }),
}));
jest.mock('@/ui/money/useMoneyFormatter', () => ({
  useMoneyFormatter: () => ({ formatMoney: () => '', formatDate: () => '', locale: 'en-GB' }),
}));

beforeEach(() => {
  resetActivityFocusForTests();
  mock.rc.ready = true;
  mock.rc.householdId = 'hh1';
  mock.monthView.isLoading = false;
  mock.monthView.rows = [
    {
      status: 'pending',
      transfer_id: null,
      is_refund: false,
      original_amount: -30000,
      amountHome: -30000,
      local_date: '2026-10-20',
      name: 'Bill',
    },
  ];
  mock.monthView.projections = [];
  mock.accountsLoading = false;
  mock.balancesLoading = false;
});

describe('useHomeViewModel', () => {
  it('defaults to the current month and exposes months', async () => {
    const { result } = await renderHook(() => useHomeViewModel());
    expect(result.current.month).toBe('2026-10');
    expect(result.current.months).toEqual(['2026-10', '2026-09']);
  });

  it('shares the selected month through the store', async () => {
    const { result } = await renderHook(() => useHomeViewModel());
    await act(async () => result.current.setMonth('2026-09'));
    expect(result.current.month).toBe('2026-09');
  });

  it('computes the position from the engine and the coming-up list', async () => {
    const { result } = await renderHook(() => useHomeViewModel());
    expect(result.current.position.unpaid).toBe(30000);
    expect(result.current.position.left).toBe(100000 - 20000 - 30000);
    expect(result.current.comingUp).toHaveLength(1);
    expect(result.current.comingUpTotal).toBe(1);
  });

  it('keeps live, unarchived accounts only', async () => {
    const { result } = await renderHook(() => useHomeViewModel());
    expect(result.current.accounts.map((a) => a.id)).toEqual(['a1']);
  });

  it('refreshKeys use the same keys as Activity; none without a household', async () => {
    const { result, rerender } = await renderHook(() => useHomeViewModel());
    expect(result.current.refreshKeys).toEqual([
      queryKeys.transactionsMonth('hh1', '2026-10'),
      queryKeys.recurringSeries('hh1'),
      queryKeys.fxLatest(),
      queryKeys.transactionMonths('hh1'),
      queryKeys.accounts('hh1'),
      queryKeys.accountBalances('hh1'),
    ]);
    mock.rc.householdId = null;
    await rerender({});
    expect(result.current.refreshKeys).toEqual([]);
  });

  it('reports loading flags', async () => {
    mock.rc.ready = false;
    mock.balancesLoading = true;
    const { result } = await renderHook(() => useHomeViewModel());
    expect(result.current.loading).toBe(true);
    expect(result.current.accountsLoading).toBe(true);
  });
});
