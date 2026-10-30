// 05.3-12: the per-check read hooks. The read hooks are mocked (as in decideV3.test), so this proves composition, criterion 1
// (one code from every hook), the pending count and the refund comparison; not Supabase.
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { DecideCheckRow } from '@/db/decideChecks';
import { EMPTY_DECIDE_SETTINGS } from '@/db/decideSettings';
import { demoSource } from '@/features/decide/__tests__/helpers/demoScenario';
import type { SnapshotSource } from '@/features/decide/snapshot/buildSnapshot';
import { settingsSourceOf } from '@/features/decide/snapshot/v3/settingsSource';
import { computeV3 } from '@/features/decide/snapshot/v3/computeV3';
import { useCheckV3, useChecksV3, usePendingWriteCount } from '../decideCheckV3';

jest.setTimeout(60000); // cold transforms on a loaded machine
const TODAY = '2026-10-03';
type Q = { data: unknown; isError: boolean; refetch: jest.Mock };
const q = (data: unknown, isError = false): Q => ({ data, isError, refetch: jest.fn() });

const mockState = {
  snapshot: { status: 'ready' as 'loading' | 'error' | 'ready', source: null as SnapshotSource | null, result: null, retry: jest.fn() },
  settings: q(undefined),
  answers: q(undefined),
  dismissals: q(undefined),
  checks: q(undefined),
  links: q(undefined),
};
jest.mock('../decide', () => ({
  useDecideSnapshot: () => mockState.snapshot,
  useDecideSettings: () => mockState.settings,
  useDecideChecks: () => mockState.checks,
  useDecideLinks: () => mockState.links,
}));
jest.mock('../decideAnswers', () => ({ useDecideAnswers: () => mockState.answers }));
jest.mock('../recurringDismissals', () => ({ useRecurringDismissals: () => mockState.dismissals }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ userId: 'u1', householdId: 'h1' }) }));

const SETTINGS = { ...EMPTY_DECIDE_SETTINGS, user_id: 'u1', income_types: ['salary_or_wages'], income_pattern: 'steady' as const, income_pattern_confirmed: true };
const sofa = { price: 80000, currency: 'GBP' };
const row = (id: string, over: Partial<DecideCheckRow> = {}): DecideCheckRow =>
  ({ id, household_id: 'h1', created_by: 'u1', kind: 'buy', name: id, inputs: sofa, status: 'open', deleted_at: null, answer_v3: null, ...over }) as unknown as DecideCheckRow;

function ready(source: SnapshotSource = demoSource(TODAY), checks: DecideCheckRow[] = [row('c1'), row('c2', { inputs: { price: 5000, currency: 'GBP' } })]): void {
  mockState.snapshot = { status: 'ready', source, result: null, retry: jest.fn() };
  mockState.settings = q(SETTINGS);
  mockState.answers = q([]);
  mockState.dismissals = q([]);
  mockState.checks = q(checks);
  mockState.links = q([]);
}

let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }): React.JSX.Element => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

beforeEach(() => {
  client = new QueryClient();
  ready();
});

const withRefund = (): SnapshotSource => {
  const base = demoSource(TODAY);
  const first = base.rows.find((r) => r.status === 'paid' && r.original_amount > 0 && r.transfer_id === null);
  const target = base.rows.find((r) => r.original_amount < 0 && r.transfer_id === null && r.status === 'paid')!;
  return { ...base, rows: base.rows.map((r) => (r === first ? { ...r, is_refund: true, refund_of: target.id } : r)) };
};

describe('usePendingWriteCount', () => {
  it('is 0 with none, counts queued writes, and settles back', async () => {
    const { result } = await renderHook(() => usePendingWriteCount(), { wrapper });
    expect(result.current).toBe(0);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    const m1 = client.getMutationCache().build(client, { mutationFn: () => gate });
    const m2 = client.getMutationCache().build(client, { mutationFn: () => gate });
    let done: Promise<unknown[]> = Promise.resolve([]);
    await act(async () => { done = Promise.all([m1.execute(undefined), m2.execute(undefined)]); });
    await waitFor(() => expect(result.current).toBe(2));
    await act(async () => { release(); await done; });
    await waitFor(() => expect(result.current).toBe(0));
  });
});

describe('useChecksV3', () => {
  it('is ready with home and one evaluation per non-deleted check, equal to computeV3', async () => {
    ready(demoSource(TODAY), [row('c1'), row('c2', { inputs: { price: 5000, currency: 'GBP' } }), row('gone', { deleted_at: 'x' })]);
    const { result } = await renderHook(() => useChecksV3(), { wrapper });
    const s = result.current;
    expect(s.status).toBe('ready');
    expect(s.rows.map((r) => r.id)).toEqual(['c1', 'c2']);
    expect([...s.byId.keys()]).toEqual(['c1', 'c2']);
    const v3 = settingsSourceOf({ settings: SETTINGS, answers: [], dismissals: [], checks: s.rows, planLive: () => true });
    expect(s.byId.get('c1')!.result.code).toBe(computeV3(demoSource(TODAY), v3, sofa, undefined, 'c1').result.code);
    expect(s.home!.result.code).toBe(computeV3(demoSource(TODAY), v3, {}, undefined, null).result.code);
    expect(s.inputs).not.toBeNull();
    expect(s.withoutRefunds.size).toBe(0);
  });

  it('adds the refund-stripped evaluation only when the records hold refund links', async () => {
    ready(withRefund());
    const { result } = await renderHook(() => useChecksV3(), { wrapper });
    expect([...result.current.withoutRefunds.keys()]).toEqual(['c1', 'c2']);
  });

  it('is loading while a read is missing, error when a read failed with nothing cached, ready offline with cache', async () => {
    mockState.settings = q(undefined);
    const a = await renderHook(() => useChecksV3(), { wrapper });
    expect(a.result.current).toMatchObject({ status: 'loading', home: null, inputs: null });
    expect(a.result.current.rows).toEqual([]);
    expect(a.result.current.byId.size).toBe(0);
    mockState.answers = q(undefined, true);
    const b = await renderHook(() => useChecksV3(), { wrapper });
    expect(b.result.current.status).toBe('error');
    b.result.current.refetch();
    expect(mockState.snapshot.retry).toHaveBeenCalled();
    expect(mockState.answers.refetch).toHaveBeenCalled();
    ready();
    mockState.dismissals = q([], true);
    expect((await renderHook(() => useChecksV3(), { wrapper })).result.current.status).toBe('ready');
  });

  it('is an error when the snapshot failed', async () => {
    mockState.snapshot = { ...mockState.snapshot, status: 'error', source: null };
    expect((await renderHook(() => useChecksV3(), { wrapper })).result.current.status).toBe('error');
  });
});

describe('useCheckV3', () => {
  it('criterion 1: gives the same code as useChecksV3 for the same stored check', async () => {
    const list = await renderHook(() => useChecksV3(), { wrapper });
    for (const id of ['c1', 'c2']) {
      const one = await renderHook(() => useCheckV3(id), { wrapper });
      expect(one.result.current.status).toBe('ready');
      expect(one.result.current.row!.id).toBe(id);
      expect(one.result.current.evaluation!.result.code).toBe(list.result.current.byId.get(id)!.result.code);
      expect(one.result.current.withoutRefunds).toBeNull();
    }
  });

  it('evaluates a draft instead of the stored inputs and still passes the check id', async () => {
    const draft = { price: 90000000, currency: 'GBP' };
    const d = await renderHook(() => useCheckV3('c1', { inputs: draft }), { wrapper });
    const v3 = settingsSourceOf({ settings: SETTINGS, answers: [], dismissals: [], checks: [row('c1'), row('c2')], planLive: () => true });
    expect(d.result.current.evaluation!.result.code).toBe(computeV3(demoSource(TODAY), v3, draft, undefined, 'c1').result.code);
  });

  it('returns the refund comparison for a check when refund links exist', async () => {
    ready(withRefund());
    const one = await renderHook(() => useCheckV3('c1'), { wrapper });
    expect(one.result.current.withoutRefunds).not.toBeNull();
  });

  it('an unknown, deleted or null id is ready with no row and no evaluation', async () => {
    ready(demoSource(TODAY), [row('c1'), row('gone', { deleted_at: 'x' })]);
    for (const id of ['nope', 'gone', null]) {
      const r = await renderHook(() => useCheckV3(id), { wrapper });
      expect(r.result.current).toMatchObject({ status: 'ready', row: null, evaluation: null, withoutRefunds: null });
      expect(r.result.current.inputs).not.toBeNull();
    }
  });

  it('is loading with nothing while reads are missing', async () => {
    mockState.checks = q(undefined);
    const r = await renderHook(() => useCheckV3('c1'), { wrapper });
    expect(r.result.current).toMatchObject({ status: 'loading', row: null, inputs: null, evaluation: null });
  });
});
