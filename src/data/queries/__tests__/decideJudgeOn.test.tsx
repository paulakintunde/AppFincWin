// 05-12: the Decide read hooks and the snapshot assembled from them. Every db fetcher and the shared Record hooks
// are mocked, so the test proves composition, keys and recompute (D-15), not Supabase.
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { TransactionRow } from '@/db/rows';
import { resetJudgeOnStoreForTest } from '@/features/decide/judgeOn/judgeOnStore';
import * as buildModule from '@/features/decide/snapshot/buildSnapshot';
import { queryKeys } from '../../keys';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { markJudgeOnDefaulted, saveJudgeOn } from '@/features/decide/hints/decideHints';
import { useJudgeOn } from '@/features/decide/judgeOn/judgeOnStore';
import { clearSharedSnapshots, useDecideSnapshot } from '../decide';

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
  void AsyncStorage.clear();
  clearSharedSnapshots();
  resetJudgeOnStoreForTest();
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
  mockFetch.goals.mockResolvedValue([]);
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

function basisOf(res: ReturnType<typeof useDecideSnapshot>['result']): string | null | undefined {
  return res?.kind === 'logged' ? res.snapshot.basisOverride : undefined;
}

describe('D-107 Judge-on in the snapshot', () => {
  it('D-107 the snapshot is loading until the choice has been read', async () => {
    let release: (v: string | null) => void = () => undefined;
    jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(() => new Promise<string | null>((r) => (release = r)));
    const hook = await renderHook(() => useDecideSnapshot(), { wrapper: wrapper(newClient()) });
    await waitFor(() => expect(mockFetch.written).toHaveBeenCalled());
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    expect(hook.result.current.status).toBe('loading');
    expect(hook.result.current.result).toBeNull();
    await act(async () => release(null));
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
  });

  it('D-107 the snapshot is built on the chosen basis', async () => {
    await markJudgeOnDefaulted('u1'); // the one-time default switch is done: nothing stored means This month
    const hook = await ready();
    expect(hook.result.current.result?.judgeOn).toBe('month');
    expect(hook.result.current.source?.judgeOn).toBe('month');
    for (const v of ['worst', 'average'] as const) {
      await act(async () => {
        await saveJudgeOn('u1', v);
      });
      await hook.unmount();
      resetJudgeOnStoreForTest();
      const next = await ready();
      expect(next.result.current.result?.judgeOn).toBe(v);
      expect(basisOf(next.result.current.result)).toBe(v);
      await next.unmount();
    }
  });

  it('D-107 changing the choice rebuilds the snapshot once', async () => {
    const spy = jest.spyOn(buildModule, 'buildDecideSnapshot');
    const client = newClient();
    const hook = await renderHook(() => ({ snap: useDecideSnapshot(), judge: useJudgeOn('u1') }), { wrapper: wrapper(client) });
    await waitFor(() => expect(hook.result.current.snap.status).toBe('ready'));
    const calls = spy.mock.calls.length;
    await act(async () => hook.result.current.judge.setJudgeOn('worst'));
    await waitFor(() => expect(hook.result.current.snap.result?.judgeOn).toBe('worst'));
    expect(spy.mock.calls.length).toBe(calls + 1);
    spy.mockRestore();
  });

  it('D-107 while the default switch is pending the snapshot is built on the settings basis', async () => {
    mockFetch.settings.mockResolvedValue({ user_id: 'u1', basis_override: 'worst' });
    const hook = await ready();
    await waitFor(() => expect(basisOf(hook.result.current.result)).toBe('worst'));
    expect(hook.result.current.result?.judgeOn ?? null).toBeNull();
  });

  it('D-107 a late settings load does not change the choice', async () => {
    await markJudgeOnDefaulted('u1');
    mockFetch.settings.mockResolvedValue({ user_id: 'u1', basis_override: 'worst' });
    const hook = await ready();
    await waitFor(() => expect(mockFetch.settings).toHaveBeenCalled());
    expect(hook.result.current.result?.judgeOn).toBe('month');
    expect(basisOf(hook.result.current.result)).toBe('month');
  });

  it('D-107 every screen using useDecideSnapshot sees the same basis', async () => {
    const client = newClient();
    const a = await renderHook(() => ({ snap: useDecideSnapshot(), judge: useJudgeOn('u1') }), { wrapper: wrapper(client) });
    const b = await renderHook(() => useDecideSnapshot(), { wrapper: wrapper(client) });
    await waitFor(() => expect(b.result.current.status).toBe('ready'));
    await act(async () => a.result.current.judge.setJudgeOn('average'));
    await waitFor(() => expect(b.result.current.result?.judgeOn).toBe('average'));
    expect(a.result.current.snap.result?.judgeOn).toBe('average');
    expect(b.result.current.result).toBe(a.result.current.snap.result);
  });
});
