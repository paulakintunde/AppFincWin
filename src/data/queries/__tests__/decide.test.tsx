// 05-12: the Decide read hooks and the snapshot assembled from them. Every db fetcher and the shared Record hooks
// are mocked, so the test proves composition, keys and recompute (D-15), not Supabase.
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { TransactionRow } from '@/db/rows';
import { queryKeys } from '../../keys';
import {
  useDecideChecks,
  useDecideLinks,
  useDecideSettings,
  useDecideSnapshot,
  useGoalLines,
  useLinkedLines,
  useOtherChecks,
  useSavingsGoals,
  useStatementPeriods,
} from '../decide';

jest.mock('@/services/supabase', () => ({ supabase: {} }));

const mockFetch = {
  range: jest.fn(),
  checks: jest.fn(),
  settings: jest.fn(),
  debts: jest.fn(),
  periods: jest.fn(),
  changes: jest.fn(),
  payment: jest.fn(),
  written: jest.fn(),
  links: jest.fn(),
  linked: jest.fn(),
  goals: jest.fn(),
  goalLines: jest.fn(),
  balances: jest.fn(),
};
jest.mock('@/db/transactions', () => ({ fetchTransactionsInRange: (...a: unknown[]) => mockFetch.range(...a) }));
jest.mock('@/db/decideChecks', () => ({ fetchDecideChecks: (...a: unknown[]) => mockFetch.checks(...a) }));
jest.mock('@/db/decideSettings', () => ({ fetchDecideSettings: (...a: unknown[]) => mockFetch.settings(...a) }));
jest.mock('@/db/debts', () => ({ fetchDebts: (...a: unknown[]) => mockFetch.debts(...a) }));
jest.mock('@/db/statementPeriods', () => ({ fetchStatementPeriods: (...a: unknown[]) => mockFetch.periods(...a) }));
jest.mock('@/db/decideChanges', () => ({ fetchDecideChanges: (...a: unknown[]) => mockFetch.changes(...a) }));
jest.mock('@/db/decideLinks', () => ({
  fetchPaymentLinks: (...a: unknown[]) => mockFetch.payment(...a),
  fetchWrittenRowLinks: (...a: unknown[]) => mockFetch.written(...a),
  fetchDecideLinks: (...a: unknown[]) => mockFetch.links(...a),
  fetchLinkedLines: (...a: unknown[]) => mockFetch.linked(...a),
}));
jest.mock('@/db/savingsGoals', () => ({
  fetchSavingsGoals: (...a: unknown[]) => mockFetch.goals(...a),
  fetchGoalLines: (...a: unknown[]) => mockFetch.goalLines(...a),
}));
jest.mock('@/db/recordReads', () => ({ fetchAccountBalances: (...a: unknown[]) => mockFetch.balances(...a) }));

const mockCtx = {
  ready: true,
  userId: 'u1' as string | null,
  householdId: 'h1' as string | null,
  homeCurrency: 'USD',
  region: null as string | null,
  today: '2026-10-15',
};
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => mockCtx }));

let mockRegion: string | undefined;
jest.mock('@/services/locale/deviceLocale', () => ({
  ...jest.requireActual('@/services/locale/deviceLocale'),
  getDeviceRegion: () => mockRegion,
}));

const mockAccounts = { data: undefined as unknown };
const mockBalances = { map: new Map<string, { balance: number | null }>() };
const mockSeries = { data: [] as unknown[] };
const mockFx = { data: [] as unknown[] };
const mockCategories = { data: [] as unknown[] };
const mockCustom = { data: [] as unknown[] };
jest.mock('../accounts', () => ({ useAccounts: () => mockAccounts }));
jest.mock('../activity', () => ({
  useAccountBalances: () => ({ balances: mockBalances.map, isLoading: false }),
}));
jest.mock('../recurringSeries', () => ({ useRecurringSeries: () => mockSeries }));
jest.mock('../fxLatest', () => ({ useFxLatest: () => mockFx }));
jest.mock('../categories', () => ({ useCategories: () => mockCategories }));
jest.mock('../customCurrencies', () => ({ useCustomCurrencies: () => mockCustom }));

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function txRow(over: Partial<TransactionRow>): TransactionRow {
  return {
    id: 't',
    account_id: 'chk',
    local_date: '2026-09-10',
    original_amount: -1_000,
    original_currency: 'USD',
    home_currency: 'USD',
    home_amount: -1_000,
    orig_per_eur: null,
    status: 'paid',
    is_refund: false,
    transfer_id: null,
    recurring_series_id: null,
    category_id: null,
    deleted_at: null,
    ...over,
  } as unknown as TransactionRow;
}

const MONTHS = ['2026-06', '2026-07', '2026-08', '2026-09'];
function history(): TransactionRow[] {
  const rows: TransactionRow[] = [];
  for (const m of MONTHS) {
    rows.push(txRow({ id: `inc-${m}`, local_date: `${m}-01`, original_amount: 300_000, home_amount: 300_000, category_id: 'c-inc' }));
    rows.push(txRow({ id: `rent-${m}`, local_date: `${m}-02`, original_amount: -100_000, home_amount: -100_000, category_id: 'c-house' }));
    rows.push(txRow({ id: `food-${m}`, local_date: `${m}-10`, original_amount: -40_000, home_amount: -40_000, category_id: 'c-food' }));
  }
  return rows;
}

function resetMocks(): void {
  mockCtx.ready = true;
  mockCtx.userId = 'u1';
  mockCtx.householdId = 'h1';
  mockCtx.region = null;
  mockRegion = undefined;
  mockAccounts.data = [
    { id: 'chk', name: 'Checking', kind: 'checking', currency: 'USD', archived_at: null, deleted_at: null },
  ];
  mockBalances.map = new Map([['chk', { balance: 500_000 }]]);
  mockSeries.data = [];
  mockFx.data = [];
  mockCategories.data = [
    { id: 'c-inc', builtin_key: 'Income' },
    { id: 'c-house', builtin_key: 'Housing' },
    { id: 'c-food', builtin_key: 'Groceries' },
  ];
  mockCustom.data = [];
  for (const f of Object.values(mockFetch)) f.mockReset();
  mockFetch.range.mockImplementation(async (_c: unknown, _h: string, r: { from: string }) =>
    r.from > '2026-10-31' ? [] : history()
  );
  mockFetch.checks.mockResolvedValue([]);
  mockFetch.settings.mockResolvedValue(null);
  mockFetch.debts.mockResolvedValue([]);
  mockFetch.periods.mockResolvedValue([]);
  mockFetch.changes.mockResolvedValue([]);
  mockFetch.payment.mockResolvedValue([]);
  mockFetch.written.mockResolvedValue([]);
  mockFetch.balances.mockResolvedValue([]);
}
beforeEach(resetMocks);

async function ready(client = newClient()) {
  const hook = await renderHook(() => useDecideSnapshot(), { wrapper: wrapper(client) });
  await waitFor(() => expect(hook.result.current.status).toBe('ready'));
  return hook;
}

describe('simple read hooks', () => {
  it('stay idle until their ids exist and read through the fetchers once they do', async () => {
    const client = newClient();
    const idle = await renderHook(() => useDecideChecks(undefined, 'h1'), { wrapper: wrapper(client) });
    expect(idle.result.current.fetchStatus).toBe('idle');
    mockFetch.checks.mockResolvedValue([{ id: 'k1' }]);
    const hook = await renderHook(() => useDecideChecks('u1', 'h1'), { wrapper: wrapper(client) });
    await waitFor(() => expect(hook.result.current.data).toEqual([{ id: 'k1' }]));
    expect(client.getQueryData(queryKeys.decideChecks('u1', 'h1'))).toEqual([{ id: 'k1' }]);
  });

  it('reads settings, periods, goals, links, linked lines and goal lines', async () => {
    mockFetch.settings.mockResolvedValue({ user_id: 'u1' });
    mockFetch.periods.mockResolvedValue([{ id: 'p' }]);
    mockFetch.goals.mockResolvedValue([{ id: 'g' }]);
    mockFetch.links.mockResolvedValue([{ id: 'l' }]);
    mockFetch.linked.mockResolvedValue([{ id: 'x' }]);
    mockFetch.goalLines.mockResolvedValue([{ id: 'gl' }]);
    const client = newClient();
    const w = { wrapper: wrapper(client) };
    const s = await renderHook(() => useDecideSettings('u1'), w);
    const p = await renderHook(() => useStatementPeriods('h1'), w);
    const g = await renderHook(() => useSavingsGoals('u1', 'h1'), w);
    const l = await renderHook(() => useDecideLinks('u1', 'h1', ['k1', 'k2']), w);
    const l0 = await renderHook(() => useDecideLinks('u1', 'h1'), w);
    const ln = await renderHook(() => useLinkedLines('h1', 'k1', { transactionIds: ['t1'], seriesIds: ['s1'] }), w);
    const gl = await renderHook(() => useGoalLines('h1', ['b', 'a']), w);
    const none = await renderHook(() => useGoalLines('h1', []), w);
    await waitFor(() => {
      expect(s.result.current.data).toEqual({ user_id: 'u1' });
      expect(p.result.current.data).toEqual([{ id: 'p' }]);
      expect(g.result.current.data).toEqual([{ id: 'g' }]);
      expect(l.result.current.data).toEqual([{ id: 'l' }]);
      expect(l0.result.current.data).toBeDefined();
      expect(ln.result.current.data).toEqual([{ id: 'x' }]);
      expect(gl.result.current.data).toEqual([{ id: 'gl' }]);
    });
    expect(none.result.current.fetchStatus).toBe('idle');
    expect(mockFetch.goalLines).toHaveBeenCalledWith({}, 'h1', ['a', 'b']);
    expect(client.getQueryData([...queryKeys.decideLinks('u1', 'h1'), 'k1,k2'])).toEqual([{ id: 'l' }]);
  });
});

describe('useDecideSnapshot', () => {
  it('is loading until the record context is ready', async () => {
    mockCtx.ready = false;
    const hook = await renderHook(() => useDecideSnapshot(), { wrapper: wrapper(newClient()) });
    await waitFor(() => expect(mockFetch.checks).toHaveBeenCalled());
    expect(hook.result.current.status).toBe('loading');
    expect(hook.result.current.result).toBeNull();
    expect(hook.result.current.source).toBeNull();
  });

  it('reads 12 months of history and the pending window after this month, and caches rows only', async () => {
    const client = newClient();
    const { result } = await ready(client);
    expect(result.current.result?.kind).toBe('logged');
    expect(result.current.source?.homeCurrency).toBe('USD');
    const ranges = mockFetch.range.mock.calls.map((c) => c[2]);
    expect(ranges).toContainEqual({ from: '2025-10-01', toInclusive: '2026-10-31' });
    expect(ranges).toContainEqual({ from: '2026-11-01', toInclusive: '2036-10-31' });
    expect(client.getQueryData(queryKeys.decideHistory('h1', '2025-10-01', '2026-10-31'))).toEqual(history());
    expect(client.getQueryData(queryKeys.decideUpcoming('h1', '2026-11-01'))).toEqual([]);
    for (const q of client.getQueryCache().getAll()) {
      expect(q.state.data).not.toBe(result.current.result);
    }
  });

  it('shows a pending row dated ahead as a scheduled outflow without touching cash', async () => {
    const base = await ready();
    const cashBefore = base.result.current.result?.cash;
    await base.unmount();
    mockFetch.range.mockImplementation(async (_c: unknown, _h: string, r: { from: string }) =>
      r.from > '2026-10-31'
        ? [txRow({ id: 'future', local_date: '2026-12-20', status: 'pending', original_amount: -45_000, home_amount: -45_000 })]
        : history()
    );
    const { result } = await ready();
    const res = result.current.result;
    if (res?.kind !== 'logged') throw new Error('expected logged');
    expect(res.snapshot.scheduledOutflows).toEqual([expect.objectContaining({ amount: 45_000 })]);
    expect(res.cash).toBe(cashBefore);
  });

  it('a live change appears in futureChanges', async () => {
    mockFetch.changes.mockResolvedValue([
      { id: 'ch1', kind: 'income', monthly_amount: 20_000, currency: 'USD', start_month: '2026-12', end_month: null, deleted_at: null },
    ]);
    const { result } = await ready();
    const res = result.current.result;
    if (res?.kind !== 'logged') throw new Error('expected logged');
    expect(res.snapshot.futureChanges).toHaveLength(1);
  });

  it('joins payment links with their check kind, drops unknown checks and passes written row links', async () => {
    mockFetch.checks.mockResolvedValue([{ id: 'k-inv', kind: 'invest' }]);
    mockFetch.payment.mockResolvedValue([
      { check_id: 'k-inv', target_id: 's1' },
      { check_id: 'k-gone', target_id: 's2' },
    ]);
    mockFetch.written.mockResolvedValue([{ check_id: 'k-inv', target_id: 't9' }]);
    const { result } = await ready();
    expect(result.current.source?.paymentLinks).toEqual([{ check_id: 'k-inv', target_id: 's1', check_kind: 'invest' }]);
    expect(result.current.source?.writtenRowLinks).toEqual([{ check_id: 'k-inv', target_id: 't9' }]);
  });

  it('the market row follows the device region when no region is set', async () => {
    const card = { id: 'cc', name: 'Card', kind: 'credit', currency: 'USD', archived_at: null, deleted_at: null };
    mockAccounts.data = [...(mockAccounts.data as unknown[]), card];
    mockBalances.map = new Map([
      ['chk', { balance: 500_000 }],
      ['cc', { balance: -42_000 }],
    ]);
    mockRegion = 'US';
    const us = await ready();
    expect(us.result.current.result?.cards[0]?.terms.source).toBe('market');
    expect(us.result.current.source?.region).toBe('US');
    await us.unmount();
    mockRegion = undefined;
    const none = await ready();
    expect(none.result.current.result?.cards[0]?.terms.source).toBe('none');
    expect(none.result.current.source?.region).toBeNull();
  });

  it('recomputes when the history read changes', async () => {
    const client = newClient();
    const { result } = await ready(client);
    const before = result.current.result;
    await act(async () => {
      client.setQueryData(queryKeys.decideHistory('h1', '2025-10-01', '2026-10-31'), [
        ...history(),
        txRow({ id: 'extra', local_date: '2026-10-03' }),
      ]);
    });
    await waitFor(() => expect(result.current.result).not.toBe(before));
  });

  it('is an error with nothing cached, and retry refetches the failed read', async () => {
    mockFetch.debts.mockRejectedValueOnce(new Error('offline'));
    const hook = await renderHook(() => useDecideSnapshot(), { wrapper: wrapper(newClient()) });
    await waitFor(() => expect(hook.result.current.status).toBe('error'));
    expect(hook.result.current.result).toBeNull();
    await act(async () => {
      hook.result.current.retry();
    });
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    expect(mockFetch.debts).toHaveBeenCalledTimes(2);
  });

  it('keeps the snapshot ready from the cached copy when a refetch fails (offline)', async () => {
    const client = newClient();
    const { result } = await ready(client);
    mockFetch.debts.mockRejectedValue(new Error('offline'));
    await act(async () => {
      await client.refetchQueries({ queryKey: queryKeys.debts('h1') });
    });
    expect(result.current.status).toBe('ready');
    expect(result.current.result).not.toBeNull();
  });
});

describe('useOtherChecks', () => {
  it('is empty until the snapshot and checks load, then selects the other open checks', async () => {
    const complete = { v: 1, kind: 'buy', name: 'Laptop', advertised: 150_000, method: 'cash', currency: 'USD' };
    const row = (id: string) => ({
      id,
      kind: 'buy',
      status: 'open',
      deleted_at: null,
      created_at: '2026-10-01T00:00:00Z',
      inputs: complete,
    });
    // Hold the checks read until the empty state is asserted: a resolved mock can
    // settle inside the awaited render under full-suite load (wave-3 gate flake).
    let release: (rows: ReturnType<typeof row>[]) => void = () => undefined;
    mockFetch.checks.mockImplementation(
      () => new Promise((resolve) => { release = resolve; }),
    );
    const hook = await renderHook(() => useOtherChecks('a'), { wrapper: wrapper(newClient()) });
    expect(hook.result.current.openCount).toBe(0);
    await act(async () => { release([row('a'), row('b')]); });
    await waitFor(() => expect(hook.result.current.openCount).toBe(1));
    expect(hook.result.current.otherChecks).toHaveLength(1);
  });
});
