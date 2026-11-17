import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook } from '@testing-library/react-native';
import { queryKeys } from '@/data/keys';
import { resetActivityFocusForTests } from '@/state/activityFocus';
import { monthRefreshKeys } from '@/features/record/activity/refreshKeys';
import { minorUnits } from '@/engine/money';
import { prepare } from '@/engine/decide/v3/prepare';
import { monthPicture } from '@/engine/month';
import { inputsOf, monthOf as v3Month, v3Line } from '@/engine/decide/v3/__tests__/helpers/fixtures';
import { useHomeViewModel } from '../useHomeViewModel';

const preparedFixture = prepare(
  inputsOf({
    months: [
      ...['2026-08', '2026-09'].map((m) =>
        v3Month(m, [
          v3Line({ id: `p-${m}`, date: `${m}-25`, amount: 300_000, role: 'income' }),
          v3Line({ id: `e-${m}`, date: `${m}-12`, amount: 100_000 }),
        ]),
      ),
      v3Month('2026-10', [], { full: false }),
    ],
    balance: minorUnits(250_000),
  }),
);
const mockDecide = { prepared: preparedFixture as typeof preparedFixture | null, source: null as unknown };
jest.mock('@/data/queries/decideV3', () => ({ useDecideV3: () => mockDecide }));

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
    dataState: 'ready' as string,
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
// 08-25: members, household currency and stored splits for the Mine / Household scope.
const mockHh = {
  members: [{ user_id: 'u1' }] as unknown[],
  currency: 'EUR',
  splits: undefined as Map<string, { memberKey: string | null; share: number }[]> | undefined,
  splitsEnabled: false,
};
jest.mock('@/data/queries/household', () => ({
  useHouseholdMembers: () => ({ data: mockHh.members }),
  useHousehold: () => ({ data: { reporting_currency: mockHh.currency } }),
}));
jest.mock('@/data/queries/householdBalances', () => ({
  useSharedSplits: (_h: unknown, enabled: boolean) => {
    mockHh.splitsEnabled = enabled;
    return { data: enabled ? mockHh.splits : undefined };
  },
}));
jest.mock('@/data/queries/figureScope', () => ({
  ...jest.requireActual('@/data/queries/figureScope'),
  householdLeftAfterPlans: jest.fn(() => -12_345),
}));
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

beforeEach(async () => {
  await AsyncStorage.clear();
  resetActivityFocusForTests();
  mock.rc.ready = true;
  mock.rc.householdId = 'hh1';
  mock.monthView.isLoading = false;
  mock.monthView.dataState = 'ready';
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
  mockHh.members = [{ user_id: 'u1' }];
  mockHh.splits = undefined;
  mockDecide.source = null;
});

describe('useHomeViewModel', () => {
  it('dataState is loading until rc is ready, else the month view state', async () => {
    mock.monthView.dataState = 'error';
    const { result, rerender } = await renderHook(() => useHomeViewModel());
    expect(result.current.dataState).toBe('error');
    expect(result.current.loading).toBe(false);
    mock.rc.ready = false;
    await rerender({});
    expect(result.current.dataState).toBe('loading');
    expect(result.current.loading).toBe(true);
    mock.rc.ready = true;
  });

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
    expect(result.current.refreshKeys).toEqual(monthRefreshKeys('hh1', '2026-10'));
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

  it('05.5-14: afterPlans is the month picture figure for the current month, null for a past month or no picture', async () => {
    const { result } = await renderHook(() => useHomeViewModel());
    expect(result.current.afterPlans).toEqual({ left: monthPicture(preparedFixture).leftAfterPlans });
    await act(async () => result.current.setMonth('2026-09'));
    expect(result.current.afterPlans).toBeNull();
    await act(async () => result.current.setMonth('2026-10'));
    mockDecide.prepared = null;
    await act(async () => undefined);
    const again = await renderHook(() => useHomeViewModel());
    expect(again.result.current.afterPlans).toBeNull();
    mockDecide.prepared = preparedFixture;
  });

  describe('08-25 Mine / Household scope (HH-09)', () => {
    const row = (over: Record<string, unknown>) => ({
      status: 'paid',
      transfer_id: null,
      is_refund: false,
      local_date: '2026-10-05',
      name: 'Line',
      ...over,
    });

    it('is hidden for a household of one and always Mine there', async () => {
      const { result } = await renderHook(() => useHomeViewModel());
      expect(result.current.showScope).toBe(false);
      await act(async () => result.current.setScope('household'));
      expect(result.current.scope).toBe('mine');
      expect(result.current.figureCurrency).toBe('GBP');
    });

    it('Mine counts my stored share of a partner’s shared line and leaves out their personal line', async () => {
      mockHh.members = [{ user_id: 'u1' }, { user_id: 'u2' }];
      mockHh.splits = new Map([['s1', [{ memberKey: 'u1', share: -2_000 }, { memberKey: 'u2', share: -6_000 }]]]);
      mock.monthView.rows = [
        row({ id: 'm1', created_by: 'u1', original_amount: -1_000, amountHome: -1_000 }),
        row({ id: 's1', created_by: 'u2', is_shared: true, household_amount: -8_000, household_currency: 'GBP', original_amount: -8_000, amountHome: -8_000 }),
        row({ id: 'p1', created_by: 'u2', original_amount: -50_000, amountHome: -50_000 }),
      ];
      const { result } = await renderHook(() => useHomeViewModel());
      expect(result.current.showScope).toBe(true);
      expect(result.current.scope).toBe('mine');
      expect(mockHh.splitsEnabled).toBe(true);
      expect(result.current.position.paidOut).toBe(-3_000);
      expect(result.current.totals.paidOut).toBe(-3_000);
      expect(result.current.afterPlans).toEqual({ left: monthPicture(preparedFixture).leftAfterPlans });
    });

    it('Mine waits for the splits before showing figures', async () => {
      mockHh.members = [{ user_id: 'u1' }, { user_id: 'u2' }];
      mock.monthView.rows = [row({ id: 's1', created_by: 'u2', is_shared: true, household_amount: -8_000, original_amount: -8_000, amountHome: -8_000 })];
      const { result } = await renderHook(() => useHomeViewModel());
      expect(result.current.dataState).toBe('loading');
    });

    it('Household moves both figures to shared lines only, in the household currency', async () => {
      mockHh.members = [{ user_id: 'u1' }, { user_id: 'u2' }];
      mockHh.splits = new Map();
      mockDecide.source = { stand: 'in' };
      mock.monthView.rows = [
        row({ id: 'm1', created_by: 'u1', original_amount: -1_000, amountHome: -1_000 }),
        row({ id: 's1', created_by: 'u2', is_shared: true, household_amount: -9_000, household_currency: 'EUR', original_amount: -8_000, amountHome: -8_000 }),
      ];
      const { result } = await renderHook(() => useHomeViewModel());
      await act(async () => result.current.setScope('household'));
      expect(result.current.scope).toBe('household');
      expect(result.current.figureCurrency).toBe('EUR');
      expect(result.current.position.paidOut).toBe(-9_000);
      expect(result.current.position.paidIn).toBe(0);
      expect(result.current.afterPlans).toEqual({ left: -12_345 });
      // a past month shows no small line in either scope
      await act(async () => result.current.setMonth('2026-09'));
      expect(result.current.afterPlans).toBeNull();
    });
  });
});
