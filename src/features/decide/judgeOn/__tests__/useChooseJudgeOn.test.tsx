// D-107: choose() = store + basis_override rule + changed-marker re-baseline. The data-layer hooks are mocked at their edges:
// the snapshot is built from the real store, the open checks come through a real query, the two writes are spies.
import React, { useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { DecideCheckRow } from '@/db/decideChecks';
import { emptyCheckInputs } from '../../snapshot/checkInputs';
import { TODAY } from '../../snapshot/__tests__/helpers/snapshotFixtures';
import { saveJudgeOn } from '../../hints/decideHints';
import { changedOpenCount } from '../../home/homeRowsModel';
import { resetJudgeOnStoreForTest, useJudgeOn } from '../judgeOnStore';
import { useChooseJudgeOn } from '../useChooseJudgeOn';

jest.setTimeout(30000);

jest.mock('@/services/supabase', () => ({ supabase: {} }));
const mockRows: { current: DecideCheckRow[] } = { current: [] };
jest.mock('@/db/decideChecks', () => ({ fetchDecideChecks: () => Promise.resolve(mockRows.current) }));
const mockMarkSeen = jest.fn(() => true);
jest.mock('@/data/mutations/decideChecks', () => ({ useMarkCheckSeen: () => ({ markSeen: mockMarkSeen }) }));
const mockUpdate = jest.fn();
jest.mock('@/data/mutations/decideSettings', () => ({ useUpdateDecideSettings: () => ({ update: mockUpdate }) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ ready: true, userId: 'u1', householdId: 'h1', homeCurrency: 'USD', region: null, today: '2026-10-15' }),
}));
const mockSettings: { basis_override: 'worst' | 'average' | null } = { basis_override: null };
jest.mock('@/data/queries/decide', () => {
  const actual = jest.requireActual('@/data/queries/decide');
  const R = require('react');
  const { useJudgeOn: useStore } = require('../judgeOnStore');
  const { withJudgeOn: judged } = require('../../home/homeRowsModel');
  const { loggedSource: logged, month: mk } = require('../../snapshot/__tests__/helpers/snapshotFixtures');
  return {
    ...actual,
    useDecideSettings: () => ({ data: { basis_override: mockSettings.basis_override } }),
    useDecideSnapshot: () => {
      const { judgeOn } = useStore('u1');
      const result = R.useMemo(() => {
        if (judgeOn === null) return null;
        const months = ['2026-06', '2026-07', '2026-08', '2026-09']
          .map((m: string) => mk(m, 500_000, 300_000))
          .concat([mk('2026-10', 500_000, 499_000)]);
        return judged(logged({ months }), judgeOn);
      }, [judgeOn]);
      return { status: result === null ? 'loading' : 'ready', result, source: null, retry: () => undefined };
    },
  };
});

function row(id: string, last: DecideCheckRow['last_seen_state'], advertised: number | null = 100_000): DecideCheckRow {
  const inp = { ...emptyCheckInputs('buy', TODAY), name: `Item ${id}`, advertised, method: 'cash' as const };
  return {
    id,
    household_id: 'h1',
    created_by: 'u1',
    kind: 'buy',
    name: inp.name,
    inputs: inp as unknown as Record<string, unknown>,
    status: 'open',
    furthest_step: 1,
    last_seen_state: last,
    last_seen_basis: last === null ? null : 'logged_months',
    reopened_from: null,
    decided_at: null,
    verdict_at_decision: null,
    estimate_day_one: null,
    estimate_monthly: null,
    wait_monthly: null,
    ready_by: null,
    broke_line: false,
    cooling_off_at: null,
    estimate_monthly_payment: null,
    estimate_running: null,
    is_sample: false,
    deleted_at: null,
    version: 1,
    updated_by: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  } as DecideCheckRow;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  resetJudgeOnStoreForTest();
  mockMarkSeen.mockClear();
  mockUpdate.mockClear();
  mockSettings.basis_override = null;
  mockRows.current = [];
});

async function setup(initial: 'month' | 'worst' | 'average' = 'worst') {
  await saveJudgeOn('u1', initial);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const counts: number[] = [];
  const { useDecideSnapshot, useOpenChecks } = jest.requireMock('@/data/queries/decide');
  const hook = await renderHook(
    () => {
      const { choose } = useChooseJudgeOn('u1');
      const snap = useDecideSnapshot();
      const open = useOpenChecks('u1', 'h1');
      const { judgeOn } = useJudgeOn('u1');
      const n = useMemo(() => changedOpenCount(snap.result, open.data ?? [], TODAY), [snap.result, open.data]);
      counts.push(n);
      return { choose, n, judgeOn, rows: open.data as DecideCheckRow[] | undefined };
    },
    { wrapper: Wrapper }
  );
  await waitFor(() => expect(hook.result.current.judgeOn).toBe(initial));
  await waitFor(() => expect(hook.result.current.rows).toBeDefined());
  return { hook, counts };
}

// The store flip is queued behind the cache notifications (one macrotask), so let it land inside act.
async function pick(hook: { result: { current: { choose(v: 'month' | 'worst' | 'average'): void } } }, v: 'month' | 'worst' | 'average') {
  await act(async () => {
    hook.result.current.choose(v);
    await new Promise((r) => setTimeout(r, 20));
  });
}

describe('useChooseJudgeOn', () => {
  it('D-107 switching the basis does not mark checks changed', async () => {
    mockRows.current = [row('a', 'no')];
    const { hook } = await setup('worst');
    expect(hook.result.current.n).toBe(0);
    await pick(hook, 'average');
    expect(hook.result.current.judgeOn).toBe('average');
    expect(mockMarkSeen).toHaveBeenCalledTimes(1);
    expect(mockMarkSeen).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), 'fits', 'logged_months');
    expect(hook.result.current.n).toBe(0);
    expect(hook.result.current.rows?.[0]?.last_seen_state).toBe('fits');
  });

  it('D-107 changedOpenCount stays 0 on the first render after a switch', async () => {
    mockRows.current = [row('a', 'no')];
    const { hook, counts } = await setup('worst');
    const mark = counts.length;
    await pick(hook, 'average');
    const after = counts.slice(mark);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((n) => n === 0)).toBe(true);
  });

  it('D-107 a real data change before the switch still shows changed', async () => {
    mockRows.current = [row('a', 'adjust')];
    const { hook } = await setup('worst');
    await pick(hook, 'average');
    expect(mockMarkSeen).not.toHaveBeenCalled();
    expect(hook.result.current.rows?.[0]?.last_seen_state).toBe('adjust');
    expect(hook.result.current.n).toBe(1);
  });

  it('D-107 first-read and incomplete checks are left alone', async () => {
    mockRows.current = [row('a', null), row('b', 'fits', null)];
    const { hook } = await setup('worst');
    await pick(hook, 'average');
    expect(mockMarkSeen).not.toHaveBeenCalled();
  });

  it('D-107 choosing Worst writes basis_override worst once', async () => {
    const { hook } = await setup('month');
    await pick(hook, 'worst');
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith({ basis_override: 'worst' });
    expect(hook.result.current.judgeOn).toBe('worst');
  });

  it('D-107 choosing Worst when basis_override is already worst writes nothing', async () => {
    mockSettings.basis_override = 'worst';
    const { hook } = await setup('month');
    await pick(hook, 'worst');
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(hook.result.current.judgeOn).toBe('worst');
  });

  it('D-107 choosing Average writes average', async () => {
    const { hook } = await setup('month');
    await pick(hook, 'average');
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith({ basis_override: 'average' });
  });

  it('D-107 choosing This month writes no setting', async () => {
    mockSettings.basis_override = 'worst';
    const { hook } = await setup('worst');
    await pick(hook, 'month');
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(hook.result.current.judgeOn).toBe('month');
  });

  it('D-107 switching back restores the original states with no markers', async () => {
    mockRows.current = [row('a', 'no')];
    const { hook, counts } = await setup('worst');
    await pick(hook, 'average');
    expect(hook.result.current.rows?.[0]?.last_seen_state).toBe('fits');
    const mark = counts.length;
    await pick(hook, 'worst');
    expect(hook.result.current.rows?.[0]?.last_seen_state).toBe('no');
    expect(hook.result.current.n).toBe(0);
    expect(counts.slice(mark).every((n) => n === 0)).toBe(true);
  });
});
