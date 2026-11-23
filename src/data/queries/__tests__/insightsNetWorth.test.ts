// 07-07 (INS-01, D-07..D-11, D-23): pure helpers and the hook's wiring over mocked reads.
import { renderHook } from '@testing-library/react-native';
import type { AccountRow, FxLatestRow } from '@/db/rows';
import type { DebtRow } from '@/db/debts';
import type { HoldingRow } from '@/db/holdings';
import type { HoldingLotRow } from '@/db/holdingLots';
import { monthEndsFor } from '@/engine/grow';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { queryKeys } from '../../keys';
import { accountsForScope, buildNetWorthInputs, paidBeforeDateOf, pointBalances, useNetWorthSeries } from '../insightsNetWorth';

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
  it('leaves out what cannot be converted and counts it', () => {
    const odd = { ...holding, id: 'h2', currency: 'ZZZ' } as HoldingRow;
    const oddDebt = { ...debt, currency: 'ZZZ' } as DebtRow;
    const out = buildNetWorthInputs({ ...base, scope: 'mine', holdings: [holding, odd], debts: [oddDebt] });
    expect(out.holdings.map((h) => h.id)).toEqual(['h1']);
    expect(out.debts).toEqual([]);
    expect(out.unconverted).toBe(2);
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
  months: ['2026-11', '2026-09', '2026-08'],
  counts: new Map([['2026-11', 3], ['2026-09', 2], ['2026-08', 0]]),
  paidCalls: [] as string[],
};
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ householdId: 'hh1', userId: 'me', homeCurrency: 'USD', today: '2026-11-10' }),
}));
jest.mock('../accounts', () => ({ useAccounts: () => ({ data: mock.accounts, isLoading: false, isError: false, refetch: jest.fn() }) }));
jest.mock('../activity', () => ({
  useTransactionMonths: () => ({ months: mock.months, counts: mock.counts, isLoading: false }),
  useAccountBalances: () => ({
    balances: new Map([['a', { balance: 12_000, otherCurrencies: [], overflow: false, pendingSum: 500, standing: null }]]),
    isLoading: false,
  }),
}));
jest.mock('../fxLatest', () => ({ useFxLatest: () => ({ data: [] }) }));
jest.mock('../customCurrencies', () => ({ useCustomCurrencies: () => ({ data: [] }) }));
jest.mock('../growHoldings', () => ({ useHoldingRows: () => ({ data: [] }), useHoldingLotRows: () => ({ data: [] }) }));
jest.mock('../decide', () => ({ useDebts: () => ({ data: [] }) }));
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

async function waitForReady(check: () => boolean): Promise<void> {
  for (let i = 0; i < 50 && !check(); i += 1) await new Promise((r) => setTimeout(r, 20));
}
