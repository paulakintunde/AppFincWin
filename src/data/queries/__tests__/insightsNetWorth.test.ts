// 07-07 (INS-01, D-07..D-11, D-23): pure helpers and the hook's wiring over mocked reads.
import { renderHook } from '@testing-library/react-native';
import type { AccountRow, FxLatestRow, TransactionRow } from '@/db/rows';
import type { DebtRow } from '@/db/debts';
import type { HoldingRow } from '@/db/holdings';
import type { HoldingLotRow } from '@/db/holdingLots';
import { monthEndsFor } from '@/engine/grow';
import { onlineManager, QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import React from 'react';
import { queryKeys } from '../../keys';
import { accountsForScope, buildNetWorthInputs, canWorkBack, inputPaused, inputWaiting, paidBeforeDateOf, pointBalances, useNetWorthSeries } from '../insightsNetWorth';

const acct = (o: Partial<AccountRow>): AccountRow =>
  ({
    id: 'a',
    household_id: 'hh1',
    created_by: 'me',
    name: 'A',
    kind: 'checking',
    currency: 'USD',
    opening_balance: 0,
    archived_at: null,
    deleted_at: null,
    created_at: '2026-01-05T10:00:00Z',
    is_shared: false,
    ...o,
  }) as AccountRow;

const EUR_PER: FxLatestRow[] = [
  { quote: 'USD', rate: '1.0', rate_date: '2026-11-01', source: 'frankfurter-v2' },
  { quote: 'CAD', rate: '2.0', rate_date: '2026-11-01', source: 'frankfurter-v2' },
];

describe('paidBeforeDateOf', () => {
  it('is the day after the month-end', () => {
    expect(paidBeforeDateOf('2026-10-31')).toBe('2026-11-01');
    expect(paidBeforeDateOf('2026-12-31')).toBe('2027-01-01');
  });
});

describe('accountsForScope (D-23)', () => {
  const mine = acct({ id: 'mine' });
  const legacy = acct({ id: 'legacy', created_by: null });
  const partner = acct({ id: 'partner', created_by: 'other' });
  const joint = acct({ id: 'joint', is_shared: true, created_by: 'other' });
  const gone = acct({ id: 'gone', deleted_at: '2026-02-01T00:00:00Z' });
  const all = [mine, legacy, partner, joint, gone];
  it('Just me keeps my own and legacy personal accounts', () => {
    expect(accountsForScope(all, 'mine', 'me').map((a) => a.id)).toEqual(['mine', 'legacy']);
  });
  it('Household keeps joint accounts only', () => {
    expect(accountsForScope(all, 'household', 'me').map((a) => a.id)).toEqual(['joint']);
  });
});

describe('buildNetWorthInputs', () => {
  const holding = { id: 'h1', account_id: null, currency: 'USD', value: 5_000, value_as_of: '2026-09-01', deleted_at: null } as HoldingRow;
  const lot = { holding_id: 'h1', kind: 'value', amount: 4_000, local_date: '2026-07-01', deleted_at: null } as HoldingLotRow;
  const debt = { account_id: null, currency: 'USD', balance: 900, started_balance: 1_000, paid_off_on: null, deleted_at: null } as DebtRow;
  const base = { accounts: [acct({ id: 'a' })], holdings: [holding], lots: [lot], debts: [debt], currency: 'USD', rates: EUR_PER, customs: [], today: '2026-11-10' };

  it('household drops holdings and debts', () => {
    const out = buildNetWorthInputs({ ...base, scope: 'household' });
    expect(out.holdings).toEqual([]);
    expect(out.debts).toEqual([]);
  });
  it('mine maps value lots plus the current value, and debts', () => {
    const out = buildNetWorthInputs({ ...base, scope: 'mine' });
    expect(out.accounts[0]?.createdOn).toBe('2026-01-05');
    expect(out.holdings[0]?.lots).toEqual([
      { date: '2026-07-01', amount: 4_000 },
      { date: '2026-09-01', amount: 5_000 },
    ]);
    expect(out.debts[0]).toMatchObject({ balance: 900, startedBalance: 1_000, paidOffOn: null });
    expect(out.unconverted).toBe(0);
  });
  it('Just me leaves out a holding in a joint account, which Household counts as the account balance (IN-07)', () => {
    const inJoint = { ...holding, id: 'h3', account_id: 'joint' } as HoldingRow;
    const out = buildNetWorthInputs({ ...base, scope: 'mine', holdings: [holding, inJoint], jointAccountIds: new Set(['joint']) });
    expect(out.holdings.map((h) => h.id)).toEqual(['h1']);
    expect(out.unconverted).toBe(0);
  });
  it('leaves out what cannot be converted and counts it', () => {
    const odd = { ...holding, id: 'h2', currency: 'ZZZ' } as HoldingRow;
    const oddDebt = { ...debt, currency: 'ZZZ' } as DebtRow;
    const out = buildNetWorthInputs({ ...base, scope: 'mine', holdings: [holding, odd], debts: [oddDebt] });
    expect(out.holdings.map((h) => h.id)).toEqual(['h1']);
    expect(out.debts).toEqual([]);
    expect(out.unconverted).toBe(2);
    expect([out.unconvertedHoldings, out.unconvertedDebts]).toEqual([1, 1]);
  });

  describe('261123 (DD-07): start date and the payments of a fixed loan', () => {
    const loan = { ...debt, id: 'd1', kind: 'loan', revolving: false, start_date: '2026-03-01' } as DebtRow;
    const line = (o: Partial<TransactionRow>): TransactionRow =>
      ({ status: 'paid', deleted_at: null, original_amount: -100, original_currency: 'USD', local_date: '2026-10-01', ...o }) as TransactionRow;

    it('carries the start date, whether it is fixed, and the paid payments as positive amounts', () => {
      const lines = [line({}), line({ status: 'pending', local_date: '2026-12-01' }), line({ original_amount: 50 }), line({ deleted_at: 'x' }), line({ original_currency: 'CAD', original_amount: -200, local_date: '2026-09-01' })];
      const out = buildNetWorthInputs({ ...base, scope: 'mine', debts: [loan], debtPayments: new Map([['d1', lines]]) });
      expect(out.debts[0]).toMatchObject({ startDate: '2026-03-01', fixed: true, payments: [{ date: '2026-10-01', amount: 100 }, { date: '2026-09-01', amount: 100 }] });
    });
    it('a payment that cannot be converted drops the working-back, never a guess', () => {
      const out = buildNetWorthInputs({ ...base, scope: 'mine', debts: [loan], debtPayments: new Map([['d1', [line({ original_currency: 'ZZZ' })]]]) });
      expect(out.debts[0]?.payments).toBeUndefined();
      expect(out.unconverted).toBe(0);
    });
    it('a revolving debt carries no payments', () => {
      const card = { ...loan, kind: 'card', revolving: true } as DebtRow;
      const out = buildNetWorthInputs({ ...base, scope: 'mine', debts: [card], debtPayments: new Map([['d1', [line({})]]]) });
      expect(out.debts[0]).toMatchObject({ fixed: false });
      expect(out.debts[0]?.payments).toBeUndefined();
    });
    it('canWorkBack needs a live fixed loan with no account, an original amount and a start date', () => {
      expect(canWorkBack(loan)).toBe(true);
      expect(canWorkBack({ ...loan, start_date: null })).toBe(false);
      expect(canWorkBack({ ...loan, started_balance: null })).toBe(false);
      expect(canWorkBack({ ...loan, account_id: 'a' })).toBe(false);
      expect(canWorkBack({ ...loan, deleted_at: 'x' })).toBe(false);
      expect(canWorkBack({ ...loan, revolving: true })).toBe(false);
      expect(canWorkBack({ ...loan, revolving: null, kind: 'other' })).toBe(false);
      expect(canWorkBack({ ...loan, revolving: null, kind: 'loan' })).toBe(true);
    });
  });
});

describe('pointBalances', () => {
  const a = acct({ id: 'a', opening_balance: 20_000 });
  const args = { currency: 'USD', rates: EUR_PER, customs: [], today: '2026-11-10' };
  it('adds own-currency legs to the opening balance', () => {
    const out = pointBalances({ ...args, accounts: [a], legs: [{ accountId: 'a', currency: 'USD', paidSum: '-5000' }] });
    expect(out.balances.get('a')).toBe(15_000);
    expect([...out.accountsWithLegs]).toEqual(['a']);
  });
  it('converts a leg in another currency and adds it', () => {
    const out = pointBalances({ ...args, accounts: [a], legs: [{ accountId: 'a', currency: 'CAD', paidSum: '2000' }] });
    expect(out.balances.get('a')).toBe(21_000);
  });
  it('omits an account it cannot convert and names it', () => {
    const out = pointBalances({ ...args, accounts: [a], legs: [{ accountId: 'a', currency: 'ZZZ', paidSum: '100' }] });
    expect(out.balances.has('a')).toBe(false);
    expect([...out.unconvertedIds]).toEqual(['a']);
  });
});

const mock = {
  accounts: [acct({ id: 'a', opening_balance: 10_000 })],
  monthList: ['2026-11', '2026-09', '2026-08'],
  counts: new Map([['2026-11', 3], ['2026-09', 2], ['2026-08', 0]]),
  paidCalls: [] as string[],
  debts: { data: [] as unknown[] | undefined, isLoading: false, isError: false } as Record<string, unknown>,
  balances: { isLoading: false, isError: false, isWaiting: false, isPaused: false },
  fx: { data: [] } as Record<string, unknown>,
  months: { isWaiting: false, isPaused: false },
};
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ householdId: 'hh1', userId: 'me', homeCurrency: 'USD', today: '2026-11-10' }),
}));
jest.mock('../accounts', () => ({ useAccounts: () => ({ data: mock.accounts, isLoading: false, isError: false, refetch: jest.fn() }) }));
jest.mock('../activity', () => ({
  useTransactionMonths: () => ({ months: mock.monthList, counts: mock.counts, isLoading: false, ...mock.months }),
  useAccountBalances: () => ({
    balances: new Map([['a', { balance: 12_000, otherCurrencies: [], overflow: false, pendingSum: 500, standing: null }]]),
    ...mock.balances,
  }),
}));
jest.mock('../fxLatest', () => ({ useFxLatest: () => ({ ...mock.fx, refetch: jest.fn() }) }));
jest.mock('../customCurrencies', () => ({ useCustomCurrencies: () => ({ data: [] }) }));
jest.mock('../growHoldings', () => ({ useHoldingRows: () => ({ data: [] }), useHoldingLotRows: () => ({ data: [] }) }));
jest.mock('../decide', () => ({ useDebts: () => ({ ...mock.debts, refetch: jest.fn() }) }));
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/db/recordReads', () => ({
  fetchAccountPaidBefore: jest.fn(async (_c: unknown, _h: string, before: string) => {
    mock.paidCalls.push(before);
    return [{ accountId: 'a', currency: 'USD', paidSum: '-1000', paidHomeSum: '-1000', unconverted: 0 }];
  }),
}));

describe('useNetWorthSeries', () => {
  it('asks once per month-end under the shared paid-before key and ends with today', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client }, children);
    const { result } = await renderHook(() => useNetWorthSeries({ range: '6m', scope: 'mine', currency: 'USD' }), { wrapper });
    const ends = monthEndsFor('2026-11-10', '2026-09', '6m');
    await expect(Promise.resolve(ends.length)).resolves.toBeGreaterThan(0);
    await waitForReady(() => result.current.status === 'ready');
    expect(result.current.points).toHaveLength(ends.length + 1);
    expect(result.current.points[result.current.points.length - 1]?.date).toBe('2026-11-10');
    expect(result.current.current).toBe(12_000); // pending is not counted
    expect(result.current.points[0]?.value).toBe(9_000);
    for (const e of ends) expect(client.getQueryData(queryKeys.paidBefore('hh1', paidBeforeDateOf(e)))).toBeDefined();
    expect(result.current.noAccounts).toBe(false);
    expect(result.current.unconverted).toBe(0);
  });
});

describe('useNetWorthSeries status (CR-01)', () => {
  const run = async (): Promise<{ status: string }> => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client }, children);
    const { result } = await renderHook(() => useNetWorthSeries({ range: '6m', scope: 'mine', currency: 'USD' }), { wrapper });
    await waitForReady(() => result.current.status !== 'loading');
    return result.current;
  };
  afterEach(() => {
    mock.debts = { data: [], isLoading: false, isError: false };
    mock.balances = { isLoading: false, isError: false, isWaiting: false, isPaused: false };
    mock.fx = { data: [] };
    mock.months = { isWaiting: false, isPaused: false };
  });
  it('is loading while debts are still loading', async () => {
    mock.debts = { data: undefined, isLoading: true, isError: false };
    expect((await run()).status).toBe('loading');
  });
  it('is an error when debts failed, never a figure without them', async () => {
    mock.debts = { data: undefined, isLoading: false, isError: true };
    expect((await run()).status).toBe('error');
  });
  it('is loading while today balances load, and an error when they fail', async () => {
    mock.balances = { isLoading: true, isError: false, isWaiting: true, isPaused: false };
    expect((await run()).status).toBe('loading');
    mock.balances = { isLoading: false, isError: true, isWaiting: false, isPaused: false };
    expect((await run()).status).toBe('error');
  });
  // NR-01: offline with no cache, TanStack leaves a query pending with fetchStatus 'paused': isLoading and isError are both false.
  it('is offline, never a figure, when debts are paused offline with no cache', async () => {
    mock.debts = { data: undefined, isLoading: false, isError: false, isPending: true, fetchStatus: 'paused' };
    expect((await run()).status).toBe('offline');
  });
  it('is offline when FX is paused with no cache', async () => {
    mock.fx = { data: undefined, isLoading: false, isError: false, fetchStatus: 'paused' };
    expect((await run()).status).toBe('offline');
  });
  it('is offline when today balances or the month list are paused with no cache', async () => {
    mock.balances = { isLoading: false, isError: false, isWaiting: true, isPaused: true };
    expect((await run()).status).toBe('offline');
    mock.balances = { isLoading: false, isError: false, isWaiting: false, isPaused: false };
    mock.months = { isWaiting: true, isPaused: true };
    expect((await run()).status).toBe('offline');
  });
  it('is loading while a read with no data is fetching even if isLoading is unset', async () => {
    mock.debts = { data: undefined, isError: false, fetchStatus: 'fetching' };
    expect((await run()).status).toBe('loading');
  });
});

describe('inputWaiting / inputPaused (NR-01)', () => {
  it('waits on fetching and paused reads with no data, not on idle (disabled) ones', () => {
    expect(inputWaiting({ data: undefined, isError: false, fetchStatus: 'paused' })).toBe(true);
    expect(inputWaiting({ data: undefined, isError: false, fetchStatus: 'fetching' })).toBe(true);
    expect(inputWaiting({ data: undefined, isError: false, fetchStatus: 'idle' })).toBe(false);
    expect(inputWaiting({ data: [], isError: false, fetchStatus: 'paused' })).toBe(false);
    expect(inputWaiting({ data: undefined, isError: true, fetchStatus: 'idle' })).toBe(false);
  });
  it('is paused only with no data, no error and fetchStatus paused', () => {
    expect(inputPaused({ data: undefined, isError: false, fetchStatus: 'paused' })).toBe(true);
    expect(inputPaused({ data: [], isError: false, fetchStatus: 'paused' })).toBe(false);
    expect(inputPaused({ data: undefined, isError: false, fetchStatus: 'fetching' })).toBe(false);
  });
});

// NR-01: a real QueryClient, offline, no cache: the hook must not return 'ready' with a debt missing from the figure.
describe('a real paused query (NR-01)', () => {
  it('a query paused offline with no cache is pending/paused with isLoading false', async () => {
    onlineManager.setOnline(false);
    try {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, networkMode: 'offlineFirst' } } });
      const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client }, children);
      const { result } = await renderHook(
        () => useQuery({ queryKey: ['nr01-debts'], queryFn: () => Promise.reject(new Error('offline')), retry: 1 }),
        { wrapper }
      );
      await waitForReady(() => result.current.fetchStatus === 'paused');
      expect(result.current.fetchStatus).toBe('paused');
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isError).toBe(false);
      expect(inputPaused(result.current)).toBe(true);
      expect(inputWaiting(result.current)).toBe(true);
    } finally {
      onlineManager.setOnline(true);
    }
  });
});

async function waitForReady(check: () => boolean): Promise<void> {
  for (let i = 0; i < 50 && !check(); i += 1) await new Promise((r) => setTimeout(r, 20));
}
