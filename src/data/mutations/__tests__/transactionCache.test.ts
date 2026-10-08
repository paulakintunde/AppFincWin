// followUpIfRatePending / followUpPendingByDate: fxLatest refresh, per-date grouping, call budget.
import { QueryClient } from '@tanstack/react-query';
import type { DbClient, TransactionRow } from '@/db/rows';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import { noteResolveRateThrottled, resetResolveRateBackoffForTests } from '@/data/sync/resolveRateBackoff';
import { followUpIfRatePending, followUpPendingByDate } from '../transactionCache';

let mockActiveClient: unknown;

jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));

type Fake = FakeSupabase & DbClient;
const invokes = (fake: Fake) => fake.calls.filter((c) => c.method === 'functions.invoke');
const bodyOf = (c: { args: unknown[] }) => (c.args[1] as { body: unknown }).body;

const pending = (id: string, local_date: string, rate_pending = true) => ({
  id,
  household_id: 'h1',
  local_date,
  rate_pending,
});
const full = (id: string, local_date: string, rate_pending: boolean) =>
  ({ id, household_id: 'h1', local_date, rate_pending }) as TransactionRow;

beforeEach(() => resetResolveRateBackoffForTests());
afterEach(() => resetResolveRateBackoffForTests());

describe('followUpIfRatePending', () => {
  it('invalidates fxLatest once after a call returns, even when unresolved', async () => {
    const fake = createFakeSupabase() as Fake;
    mockActiveClient = fake;
    fake.respondWith({ data: {}, error: null, status: 200 });
    const qc = new QueryClient();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    await followUpIfRatePending(qc, 'h1', '2026-09', { id: 't1', rate_pending: true });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.fxLatest() });
  });

  it('non-pending row or active throttle: no call, no invalidation', async () => {
    const fake = createFakeSupabase() as Fake;
    mockActiveClient = fake;
    const qc = new QueryClient();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    await followUpIfRatePending(qc, 'h1', '2026-09', { id: 't1', rate_pending: false });
    noteResolveRateThrottled();
    await followUpIfRatePending(qc, 'h1', '2026-09', { id: 't1', rate_pending: true });
    expect(invokes(fake)).toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('followUpPendingByDate', () => {
  it('groups pending rows by date, most recent first, ignoring non-pending rows', async () => {
    const fake = createFakeSupabase() as Fake;
    mockActiveClient = fake;
    fake.respondWith({ data: { rows: [full('b', '2026-09-24', false)] }, error: null, status: 200 });
    fake.respondWith({ data: { rows: [full('a', '2026-09-20', false)] }, error: null, status: 200 });
    const qc = new QueryClient();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const out = await followUpPendingByDate(qc, [
      pending('a', '2026-09-20'),
      pending('b', '2026-09-24'),
      pending('c', '2026-09-24', false),
    ]);
    expect(out).toEqual({ calls: 2, stillPendingDates: [] });
    expect(invokes(fake).map(bodyOf)).toEqual([{ transactionIds: ['b'] }, { transactionIds: ['a'] }]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.fxLatest() });
  });

  it('chunks a date at 50 ids and honours maxCalls', async () => {
    const fake = createFakeSupabase() as Fake;
    mockActiveClient = fake;
    fake.respondWith({ data: { rows: [] }, error: null, status: 200 });
    fake.respondWith({ data: { rows: [] }, error: null, status: 200 });
    const rows = Array.from({ length: 120 }, (_, i) => pending(`t${i}`, '2026-09-24'));
    const out = await followUpPendingByDate(new QueryClient(), rows, { maxCalls: 2 });
    expect(out.calls).toBe(2);
    expect(invokes(fake).map((c) => (bodyOf(c) as { transactionIds: string[] }).transactionIds.length)).toEqual([50, 50]);
  });

  it('patches returned rows into a loaded month and reports dates still pending', async () => {
    const fake = createFakeSupabase() as Fake;
    mockActiveClient = fake;
    fake.respondWith({ data: { rows: [full('a', '2026-09-24', false)] }, error: null, status: 200 });
    fake.respondWith({ data: { rows: [full('b', '2026-09-20', true)] }, error: null, status: 200 });
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.transactionsMonth('h1', '2026-09'), [full('a', '2026-09-24', true)]);
    const out = await followUpPendingByDate(qc, [pending('a', '2026-09-24'), pending('b', '2026-09-20')]);
    expect(out.stillPendingDates).toEqual(['2026-09-20']);
    const cached = qc.getQueryData<TransactionRow[]>(queryKeys.transactionsMonth('h1', '2026-09'));
    expect(cached?.[0]?.rate_pending).toBe(false);
    expect(qc.getQueryData(queryKeys.transactionsMonth('h1', '2026-08'))).toBeUndefined();
  });

  it('swallows a failed call and reports its date as still pending', async () => {
    const fake = createFakeSupabase() as Fake;
    mockActiveClient = fake;
    fake.respondWith({ data: null, error: new Error('network down'), status: 0 });
    const out = await followUpPendingByDate(new QueryClient(), [pending('a', '2026-09-24')]);
    expect(out).toEqual({ calls: 1, stillPendingDates: ['2026-09-24'] });
  });

  it('does nothing while throttled, and nothing for no pending rows', async () => {
    const fake = createFakeSupabase() as Fake;
    mockActiveClient = fake;
    const qc = new QueryClient();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    expect(await followUpPendingByDate(qc, [pending('a', '2026-09-24', false)])).toEqual({ calls: 0, stillPendingDates: [] });
    noteResolveRateThrottled();
    expect(await followUpPendingByDate(qc, [pending('a', '2026-09-24')])).toEqual({ calls: 0, stillPendingDates: [] });
    expect(invokes(fake)).toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();
  });
});
