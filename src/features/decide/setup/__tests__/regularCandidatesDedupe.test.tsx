import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { detectCandidates, type DetectRow } from '@/engine/decide/v3';
import { useRegularCandidates } from '../steps/useRegularCandidates';

jest.setTimeout(30000);
jest.mock('@/services/supabase', () => ({ supabase: {} }));

type T = Record<string, unknown>;
const mk = (id: string, name: string, date: string, account: string, over: T = {}): T => ({
  id,
  name,
  original_amount: -1599,
  original_currency: 'USD',
  local_date: date,
  is_sample: false,
  transfer_id: null,
  status: 'posted',
  recurring_series_id: null,
  account_id: account,
  category_id: null,
  is_refund: false,
  refund_of: null,
  ...over,
});
const monthly = (prefix: string, name: string, account: string, days: [string, string, string]): T[] =>
  days.map((d, i) => mk(`${prefix}${i}`, name, d, account));

let mockTxns: T[] = [];
jest.mock('@/db/transactions', () => ({ fetchTransactionsInRange: async () => mockTxns }));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: [] }) }));
jest.mock('@/data/queries/recurringDismissals', () => ({ useRecurringDismissals: () => ({ data: [] }) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ householdId: 'h1', userId: 'u1', homeCurrency: 'USD', timeZone: 'UTC', today: '2026-09-15' }),
}));

const toDetect = (rows: T[]): DetectRow[] =>
  rows.map((r) => ({ id: r.id as string, name: r.name as string, amount: r.original_amount as number, currency: 'USD', date: r.local_date as string, isTransfer: false, accountId: r.account_id as string }));
const CTX = { dismissedKeys: new Set<string>(), linkedRowIds: new Set<string>() };
const DAYS_A: [string, string, string] = ['2026-06-30', '2026-07-30', '2026-08-30'];
const DAYS_B: [string, string, string] = ['2026-06-15', '2026-07-15', '2026-08-15'];

async function run(txns: T[]) {
  mockTxns = txns;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const out = await renderHook(() => useRegularCandidates(), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
  await waitFor(() => expect(out.result.current.rows.length).toBeGreaterThan(0));
  return out.result.current.rows;
}

describe('duplicate source (engine, read only)', () => {
  const a = monthly('a', 'Bookshop', 'A', DAYS_A);
  it('three rows in one account give one candidate', () => {
    expect(detectCandidates(toDetect(a), CTX)).toHaveLength(1);
  });
  it('the same ids passed twice never give a second candidate (the hook dedupes them first)', () => {
    const doubled = detectCandidates(toDetect([...a, ...a]), CTX);
    // Same ids twice never produce a second candidate with different ids.
    const sets = new Set(doubled.map((c) => [...new Set(c.rowIds)].sort().join(',')));
    expect(sets.size).toBeLessThanOrEqual(1);
    expect(doubled.length).toBeLessThanOrEqual(1);
  });
  it('a second account with new ids on the same dates gives two candidates, equal key and anchor, disjoint rowIds', () => {
    const b = monthly('b', 'Bookshop', 'B', DAYS_A);
    const found = detectCandidates(toDetect([...a, ...b]), CTX);
    expect(found).toHaveLength(2);
    expect(found[0]!.key).toBe(found[1]!.key);
    expect(found[0]!.anchorDate).toBe(found[1]!.anchorDate);
    expect(found[0]!.rowIds.filter((id) => found[1]!.rowIds.includes(id))).toEqual([]);
  });
});

describe('useRegularCandidates dedupe', () => {
  it('counts a transaction id arriving twice once', async () => {
    const a = monthly('a', 'Bookshop', 'A', DAYS_A);
    const once = await run(a);
    const twice = await run([...a, ...a]);
    expect(twice.map((r) => r.id)).toEqual(once.map((r) => r.id));
    expect(twice).toHaveLength(1);
  });

  it('keeps two accounts on identical dates as two cards with different ids', async () => {
    const rows = await run([...monthly('a', 'Bookshop', 'A', DAYS_A), ...monthly('b', 'Bookshop', 'B', DAYS_A)]);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);
    expect(rows.map((r) => r.accountId).sort()).toEqual(['A', 'B']);
  });

  it('keeps two accounts on different dates as two cards with different ids', async () => {
    const rows = await run([...monthly('a', 'Bookshop', 'A', DAYS_A), ...monthly('b', 'Bookshop', 'B', DAYS_B)]);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);
  });

  it('gives every id across 30+ candidates once', async () => {
    const all: T[] = [];
    for (let i = 0; i < 32; i += 1) all.push(...monthly(`p${i}-`, `Payee ${i}`, i % 2 === 0 ? 'A' : 'B', DAYS_A));
    const rows = await run(all);
    expect(rows.length).toBeGreaterThanOrEqual(30);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });

  it('never offers refunds or refund-linked rows', async () => {
    const refunds = DAYS_A.map((d, i) => mk(`r${i}`, 'Refund - Online Store', d, 'A', { original_amount: 1599, is_refund: true }));
    const linked = DAYS_A.map((d, i) => mk(`l${i}`, 'Refund - Online Store', d, 'A', { original_amount: 1599, refund_of: 'orig' }));
    mockTxns = [...refunds, ...linked];
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = await renderHook(() => useRegularCandidates(), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.rows).toEqual([]);
  });
});
