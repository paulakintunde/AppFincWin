// 05.2-19: useDecideV3 composes the existing reads into V3Inputs and one Evaluation. The read hooks are mocked, so this
// proves composition, status and the plan-live rule, not Supabase.
import React from 'react';
import { renderHook } from '@testing-library/react-native';
import type { DecideLinkRow } from '@/db/decideLinks';
import { EMPTY_DECIDE_SETTINGS } from '@/db/decideSettings';
import { demoSource } from '@/features/decide/__tests__/helpers/demoScenario';
import type { SnapshotSource } from '@/features/decide/snapshot/buildSnapshot';
import { DecideV3Scope, planLiveOf, useDecideV3 } from '../decideV3';

const TODAY = '2026-10-03';
type Q = { data: unknown; isError: boolean; error?: unknown; refetch: jest.Mock };
const q = (data: unknown, isError = false, error: unknown = null): Q => ({ data, isError, error, refetch: jest.fn() });

const mockState = {
  snapshot: {
    status: 'ready' as 'loading' | 'error' | 'ready',
    source: null as SnapshotSource | null,
    result: null,
    retry: jest.fn(),
    errorKind: undefined as 'network' | 'server' | null | undefined,
    missingReads: undefined as readonly string[] | undefined,
  },
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

const link = (over: Partial<DecideLinkRow>): DecideLinkRow => ({
  id: 'l', household_id: 'h1', created_by: 'u1', check_id: 'c1', entity: 'recurring_series', target_id: 's1', source: 'written', role: null, deleted_at: null, version: 1,
  created_at: '', updated_at: '', ...over,
});

function ready(): void {
  mockState.snapshot = { status: 'ready', source: demoSource(TODAY), result: null, retry: jest.fn(), errorKind: undefined, missingReads: undefined };
  mockState.settings = q({ ...EMPTY_DECIDE_SETTINGS, user_id: 'u1', income_types: ['salary_or_wages'], income_pattern: 'steady', income_pattern_confirmed: true });
  mockState.answers = q([]);
  mockState.dismissals = q([]);
  mockState.checks = q([]);
  mockState.links = q([]);
}

beforeEach(() => ready());

describe('useDecideV3', () => {
  it('is ready with inputs and an evaluation built from the stored rows', async () => {
    const { result } = await renderHook(() => useDecideV3());
    expect(result.current.status).toBe('ready');
    expect(result.current.inputs!.profile).toMatchObject({ types: ['salary'], pattern: 'steady', patternConfirmed: true });
    expect(typeof result.current.evaluation!.result.code).toBe('string');
  });

  it('is loading, with no evaluation, while any read or the snapshot is missing', async () => {
    mockState.settings = q(undefined);
    const a = await renderHook(() => useDecideV3());
    expect(a.result.current).toMatchObject({ status: 'loading', inputs: null, evaluation: null });
    ready();
    mockState.snapshot = { ...mockState.snapshot, status: 'loading', source: null };
    const b = await renderHook(() => useDecideV3());
    expect(b.result.current.status).toBe('loading');
  });

  it('is an error when a read failed with nothing cached, and refetch retries them all', async () => {
    mockState.answers = q(undefined, true);
    const { result } = await renderHook(() => useDecideV3());
    expect(result.current.status).toBe('error');
    result.current.refetch();
    expect(mockState.snapshot.retry).toHaveBeenCalled();
    expect(mockState.answers.refetch).toHaveBeenCalled();
    expect(mockState.settings.refetch).toHaveBeenCalled();
  });

  it('is an error when the snapshot itself failed', async () => {
    mockState.snapshot = { ...mockState.snapshot, status: 'error', source: null };
    expect((await renderHook(() => useDecideV3())).result.current.status).toBe('error');
  });

  it('offline with cached data stays ready even if a refetch errored', async () => {
    mockState.dismissals = q([], true);
    expect((await renderHook(() => useDecideV3())).result.current.status).toBe('ready');
  });

  it('a held-back bridge reaches the inputs only for a bought check with a live plan', async () => {
    const cid = '11111111-1111-1111-1111-111111111111';
    mockState.answers = q([{ id: 'a', household_id: 'h1', created_by: 'u1', kind: 'held_bridge', key: cid, amount: 40000, bool_value: null, on_date: null, check_id: cid, deleted_at: null, version: 1, created_at: '', updated_at: '' }]);
    mockState.checks = q([{ id: cid, status: 'bought', deleted_at: null }]);
    expect((await renderHook(() => useDecideV3())).result.current.inputs!.heldBridges).toEqual([{ id: cid, amount: 40000 }]);
    mockState.checks = q([{ id: cid, status: 'open', deleted_at: null }]);
    expect((await renderHook(() => useDecideV3())).result.current.inputs!.heldBridges).toEqual([]);
  });

  it('settings missing gives defaults, not an error', async () => {
    mockState.settings = q(null);
    const { result } = await renderHook(() => useDecideV3());
    expect(result.current.status).toBe('ready');
    expect(result.current.inputs!.profile).toBeNull();
  });
});

describe('useDecideV3 read errors and missing reads (05.4-33 APP-01, APP-10)', () => {
  it('a ready state has no error kind and nothing missing', async () => {
    const { result } = await renderHook(() => useDecideV3());
    expect(result.current.errorKind).toBeNull();
    expect(result.current.missingReads).toEqual([]);
  });

  it('a network failure of its own read is kind network; the missing reads are named with the snapshot ones', async () => {
    mockState.answers = q(undefined, true, new TypeError('Network request failed'));
    mockState.snapshot = { ...mockState.snapshot, missingReads: ['history'] };
    const { result } = await renderHook(() => useDecideV3());
    expect(result.current.status).toBe('error');
    expect(result.current.errorKind).toBe('network');
    expect(result.current.missingReads).toEqual(['history', 'answers']);
  });

  it('a failed snapshot passes its own kind through, or server when it has none', async () => {
    mockState.snapshot = { ...mockState.snapshot, status: 'error', source: null, errorKind: 'network' };
    expect((await renderHook(() => useDecideV3())).result.current.errorKind).toBe('network');
    mockState.snapshot = { ...mockState.snapshot, errorKind: undefined };
    expect((await renderHook(() => useDecideV3())).result.current.errorKind).toBe('server');
  });
});

describe('planLiveOf (Pitfall 9)', () => {
  const src = (): SnapshotSource => {
    const base = demoSource(TODAY);
    const s = base.series[0]!;
    return {
      ...base,
      series: [{ ...s, id: 's1', end_date: null }, { ...s, id: 's-ended', end_date: '2026-01-01' }, { ...s, id: 's-gone', deleted_at: 'x', end_date: null }],
      debts: [{ ...base.debts[0]!, id: 'd-open', balance: 5, deleted_at: null }, { ...base.debts[0]!, id: 'd-paid', balance: 0, deleted_at: null }, { ...base.debts[0]!, id: 'd-gone', balance: 9, deleted_at: 'x' }],
    };
  };
  const live = (links: DecideLinkRow[], id = 'c1') => planLiveOf(links, src())(id);

  it('is live while a linked series runs or a linked debt has a balance', () => {
    expect(live([link({ target_id: 's1' })])).toBe(true);
    expect(live([link({ entity: 'debts', target_id: 'd-open' })])).toBe(true);
    expect(live([link({ target_id: 's-ended' }), link({ id: 'l2', entity: 'debts', target_id: 'd-open' })])).toBe(true);
  });

  it('has ended when every linked series has ended or is gone and every debt is paid or gone', () => {
    expect(live([link({ target_id: 's-ended' })])).toBe(false);
    expect(live([link({ target_id: 's-gone' })])).toBe(false);
    expect(live([link({ target_id: 'missing' })])).toBe(false);
    expect(live([link({ entity: 'debts', target_id: 'd-paid' })])).toBe(false);
    expect(live([link({ entity: 'debts', target_id: 'd-gone' })])).toBe(false);
    expect(live([link({ entity: 'debts', target_id: 'missing' })])).toBe(false);
  });

  it('ignores other checks, deleted links and one-off transaction links; a check with no plan stays held', () => {
    expect(live([link({ check_id: 'other', target_id: 's1' })])).toBe(true); // no plan link for c1
    expect(live([link({ target_id: 's1', deleted_at: 'x' })])).toBe(true);
    expect(live([link({ entity: 'transactions', target_id: 't1' })])).toBe(true);
    expect(live([link({ target_id: 's-ended' }), link({ id: 'l2', entity: 'transactions', target_id: 't1' })])).toBe(false);
    expect(live([])).toBe(true);
  });
});

describe('06.1-72 DecideV3Scope (G-73-1)', () => {
  it('gives every useDecideV3 below it the one state the scope built', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => <DecideV3Scope>{children}</DecideV3Scope>;
    const { result } = await renderHook(() => [useDecideV3(), useDecideV3()] as const, { wrapper });
    expect(result.current[0].status).toBe('ready');
    expect(result.current[1]).toBe(result.current[0]);
  });

  it('keeps the same state object across a render where nothing changed', async () => {
    const { result, rerender } = await renderHook(() => useDecideV3());
    const first = result.current;
    await rerender({});
    expect(result.current).toBe(first);
  });
});

