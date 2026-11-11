// 06-36 (D-32, CRUD #4): useDebtPayments reads one debt's lines over its three links and splits them into the next expected
// line and the last six paid lines, newest first.
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { supabase } from '@/services/supabase';
import type { FakeSupabase } from '@/db/__tests__/fakeSupabase';
import type { DbClient, TransactionRow } from '@/db/rows';
import { debtLinkFilter, debtPaymentsOf, useDebtPayments } from '../growDebts';

jest.mock('@/services/supabase', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createFakeSupabase } = require('@/db/__tests__/fakeSupabase');
  return { supabase: createFakeSupabase() };
});

const fake = supabase as unknown as FakeSupabase & DbClient;

const H = '00000000-0000-4000-8000-000000000001';
const D = '00000000-0000-4000-8000-0000000000d1';
const S = '00000000-0000-4000-8000-0000000000a1';
const X = '00000000-0000-4000-8000-0000000000b1';
const DEBT = { id: D, household_id: H, series_id: S, extra_series_id: X };
const TODAY = '2026-11-05';

const line = (id: string, local_date: string, status: 'paid' | 'pending' | 'skipped', over: Partial<TransactionRow> = {}): TransactionRow =>
  ({ id, local_date, status, deleted_at: null, created_at: `${local_date}T09:00:00Z`, original_amount: -31200, ...over }) as TransactionRow;

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('debtPaymentsOf', () => {
  it('takes the earliest pending line on or after today as next, and the paid lines newest first', () => {
    const rows = [
      line('p3', '2027-01-15', 'pending'),
      line('p2', '2026-12-15', 'pending'),
      line('p1', '2026-11-15', 'pending'),
      line('late', '2026-10-30', 'pending'),
      line('a', '2026-10-15', 'paid'),
      line('b', '2026-09-15', 'paid'),
      line('skip', '2026-08-15', 'skipped'),
      line('c', '2026-10-20', 'paid', { one_off: true }),
    ];
    const r = debtPaymentsOf(rows, TODAY);
    expect(r.next?.id).toBe('p1');
    expect(r.paid.map((p) => p.id)).toEqual(['c', 'a', 'b']);
  });

  it('a pending line dated today counts as next', () => {
    expect(debtPaymentsOf([line('t', TODAY, 'pending')], TODAY).next?.id).toBe('t');
  });

  it('keeps at most six paid lines', () => {
    const rows = Array.from({ length: 9 }, (_, i) => line(`m${i}`, `2026-0${i + 1}-15`, 'paid'));
    const r = debtPaymentsOf(rows, TODAY);
    expect(r.paid).toHaveLength(6);
    expect(r.paid[0]?.id).toBe('m8');
    expect(r.next).toBeNull();
  });
});

describe('debtLinkFilter', () => {
  it('covers debt_id and both series', () => {
    expect(debtLinkFilter(DEBT)).toBe(`debt_id.eq.${D},recurring_series_id.in.(${S},${X})`);
  });
  it('leaves out series the debt does not have', () => {
    expect(debtLinkFilter({ ...DEBT, series_id: null, extra_series_id: null })).toBe(`debt_id.eq.${D}`);
  });
  it('refuses an id that is not a uuid (no filter injection)', () => {
    expect(() => debtLinkFilter({ ...DEBT, series_id: 'x),id.neq.(y' })).toThrow(RangeError);
  });
});

describe('useDebtPayments', () => {
  beforeEach(() => {
    fake.calls.length = 0;
  });

  it('makes no request without a debt', async () => {
    const { result } = await renderHook(() => useDebtPayments(undefined, TODAY), { wrapper: wrapper(newClient()) });
    expect(result.current.fetchStatus).toBe('idle');
    expect(fake.calls).toHaveLength(0);
  });

  it('reads the live paid and pending lines over the three links, keyed by the debt', async () => {
    fake.respondWith({ data: [line('p1', '2026-11-15', 'pending'), line('a', '2026-10-15', 'paid', { debt_id: D })], error: null, status: 200 });
    const client = newClient();
    const { result } = await renderHook(() => useDebtPayments(DEBT, TODAY), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.next?.id).toBe('p1');
    expect(result.current.data?.paid.map((p) => p.id)).toEqual(['a']);
    expect(fake.calls[0]?.table).toBe('transactions_active');
    expect(fake.calls.find((c) => c.method === 'eq')?.args).toEqual(['household_id', H]);
    expect(fake.calls.find((c) => c.method === 'in')?.args).toEqual(['status', ['paid', 'pending']]);
    expect(fake.calls.find((c) => c.method === 'or')?.args).toEqual([`debt_id.eq.${D},recurring_series_id.in.(${S},${X})`]);
    expect(client.getQueryCache().getAll()[0]?.queryKey).toEqual(['transactions', H, 'debt-payments', D, S, X]);
  });
});
