// D-107 (walkthrough round 2): the one-time default switch to This month re-baselines the checks, like a user's own switch.
// The data-layer hooks are mocked at their edges:
// the snapshot is built from the real store, the open checks come through a real query, the two writes are spies.
import React, { useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { DecideCheckRow } from '@/db/decideChecks';
import { emptyCheckInputs } from '../../snapshot/checkInputs';
import { TODAY } from '../../snapshot/__tests__/helpers/snapshotFixtures';
import { loadJudgeOn, loadJudgeOnDefaulted, markJudgeOnDefaulted, saveJudgeOn } from '../../hints/decideHints';
import { changedOpenCount } from '../../home/homeRowsModel';
import { resetJudgeOnStoreForTest, useJudgeOn } from '../judgeOnStore';
import { useResolveJudgeOnDefault } from '../useResolveJudgeOnDefault';

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
      const { judgeOn: stored, pendingDefault, applyingDefault } = useStore('u1');
      // while the default switch is pending the snapshot is built on the settings basis, as in useDecideSnapshot
      const judgeOn = stored === null || applyingDefault ? null : pendingDefault ? (mockSettings.basis_override ?? 'worst') : stored;
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
  mockSettings.basis_override = 'average';
  mockRows.current = [];
});

async function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const counts: number[] = [];
  const { useDecideSnapshot, useOpenChecks } = jest.requireMock('@/data/queries/decide');
  const hook = await renderHook(
    () => {
      useResolveJudgeOnDefault('u1');
      const snap = useDecideSnapshot();
      const open = useOpenChecks('u1', 'h1');
      const { judgeOn, pendingDefault } = useJudgeOn('u1');
      const n = useMemo(() => changedOpenCount(snap.result, open.data ?? [], TODAY), [snap.result, open.data]);
      counts.push(n);
      return { n, judgeOn, pendingDefault, rows: open.data as DecideCheckRow[] | undefined };
    },
    { wrapper: Wrapper }
  );
  return { hook, counts };
}

describe('useResolveJudgeOnDefault', () => {
  it('D-107 the default switch on update does not mark checks changed', async () => {
    mockRows.current = [row('a', 'fits')];
    const { hook, counts } = await setup();
    // everything lands inside one act, as a device frame would batch it
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    expect(hook.result.current.judgeOn).toBe('month');
    expect(hook.result.current.pendingDefault).toBe(false);
    expect(mockMarkSeen).toHaveBeenCalledTimes(1);
    expect(mockMarkSeen).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), 'no', 'logged_months');
    expect(hook.result.current.n).toBe(0);
    // no render at any point showed a changed marker
    expect(counts.every((n) => n === 0)).toBe(true);
    expect(hook.result.current.rows?.[0]?.last_seen_state).toBe('no');
  });

  it('D-107 the default switch runs once: the done flag is remembered on the device', async () => {
    mockRows.current = [row('a', 'fits')];
    const { hook } = await setup();
    await waitFor(() => expect(hook.result.current.pendingDefault).toBe(false));
    await waitFor(async () => expect(await loadJudgeOnDefaulted('u1')).toBe(true));
    expect(await loadJudgeOn('u1')).toBeNull(); // the default itself is not stored as a choice
  });

  it('D-107 a stored explicit choice has no pending default', async () => {
    await saveJudgeOn('u1', 'worst');
    mockRows.current = [row('a', 'fits')];
    const { hook } = await setup();
    await waitFor(() => expect(hook.result.current.judgeOn).toBe('worst'));
    expect(hook.result.current.pendingDefault).toBe(false);
    expect(mockMarkSeen).not.toHaveBeenCalled();
  });

  it('D-107 an already-resolved default does not pend', async () => {
    await markJudgeOnDefaulted('u1');
    mockRows.current = [row('a', 'fits')];
    const { hook } = await setup();
    await waitFor(() => expect(hook.result.current.judgeOn).toBe('month'));
    expect(hook.result.current.pendingDefault).toBe(false);
    expect(mockMarkSeen).not.toHaveBeenCalled();
  });

  it('D-107 a real data change before the default switch still shows changed', async () => {
    mockRows.current = [row('a', 'adjust')];
    const { hook } = await setup();
    await waitFor(() => expect(hook.result.current.pendingDefault).toBe(false));
    expect(mockMarkSeen).not.toHaveBeenCalled();
    expect(hook.result.current.rows?.[0]?.last_seen_state).toBe('adjust');
    expect(hook.result.current.n).toBe(1);
  });
});
