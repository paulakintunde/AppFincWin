// 08-15 (HH-07, HH-08, T-08-59): settle-up calls are online-only: no replay, an offline call answers 'offline' without a request.
import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import {
  OFFLINE_RESULT,
  useAskToSettle,
  useConfirmSettlement,
  useProposeLeaverPayment,
  useProposeSettlement,
  useUndoSettlement,
  useWriteOff,
} from '../settlements';

let mockActiveClient: unknown;

jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));

const ok = (data: unknown) => ({ data, error: null, status: 200 });
const HH = 'hh-1';

function setup() {
  const fake = createFakeSupabase() as FakeSupabase & DbClient;
  mockActiveClient = fake;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { fake, qc, wrapper };
}

const rpcCalls = (fake: FakeSupabase) => fake.calls.filter((c) => c.method === 'rpc').map((c) => c.args);

beforeEach(() => onlineManager.setOnline(true));

describe('settle-up calls', () => {
  it('propose sends the ticked lines and the amount the screen showed, then refreshes balances, settle-ups and notices', async () => {
    const { fake, qc, wrapper } = setup();
    fake.respondWith(ok({ ok: true, settlement_id: 's1', amount: 700 }));
    const invalidate = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useProposeSettlement(), { wrapper });

    let res: unknown;
    await act(async () => {
      res = await result.current.mutateAsync({ householdId: HH, receiver: 'sam', lineIds: ['l1'], payerAccount: 'a1', expectedAmount: 700 });
    });
    expect(res).toEqual({ ok: true, settlement_id: 's1', amount: 700 });
    expect(rpcCalls(fake)).toEqual([
      ['propose_settlement', { p_receiver: 'sam', p_line_ids: ['l1'], p_payer_account: 'a1', p_expected_amount: 700 }],
    ]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.transactionsRoot(HH) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.settlements(HH) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.householdEvents(HH) });
  });

  it('answers offline without sending anything and without waiting for a connection', async () => {
    const { fake, qc, wrapper } = setup();
    onlineManager.setOnline(false);
    const invalidate = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => ({ confirm: useConfirmSettlement(), undo: useUndoSettlement() }), { wrapper });

    let a: unknown;
    let b: unknown;
    await act(async () => {
      a = await result.current.confirm.mutateAsync({ householdId: HH, id: 's1', receiverAccount: 'a2' });
      b = await result.current.undo.mutateAsync({ householdId: HH, id: 's1' });
    });
    expect(a).toEqual(OFFLINE_RESULT);
    expect(b).toEqual(OFFLINE_RESULT);
    expect(rpcCalls(fake)).toHaveLength(0);
    expect(result.current.confirm.isPaused).toBe(false);
    expect(invalidate).not.toHaveBeenCalled();

    // Coming back online replays nothing: the calls were never queued.
    onlineManager.setOnline(true);
    await act(async () => {
      await qc.resumePausedMutations();
    });
    expect(rpcCalls(fake)).toHaveLength(0);
  });

  it('returns lines_changed with the server amount untouched and still refreshes the reads', async () => {
    const { fake, qc, wrapper } = setup();
    fake.respondWith(ok({ ok: false, reason: 'lines_changed', server_amount: 650 }));
    const invalidate = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useProposeSettlement(), { wrapper });
    let res: unknown;
    await act(async () => {
      res = await result.current.mutateAsync({ householdId: HH, receiver: 'sam', lineIds: ['l1'], payerAccount: 'a1', expectedAmount: 700 });
    });
    expect(res).toEqual({ ok: false, reason: 'lines_changed', server_amount: 650 });
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.transactionsRoot(HH) }));
  });

  it('does not retry a transport failure', async () => {
    const { fake, wrapper } = setup();
    fake.respondWith({ data: null, error: { message: 'boom', code: '' }, status: 0 });
    const { result } = await renderHook(() => useAskToSettle(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ householdId: HH, other: 'sam' })).rejects.toBeTruthy();
    });
    expect(rpcCalls(fake)).toHaveLength(1);
  });

  it('write-off and the leaver "I paid" use their server argument names', async () => {
    const { fake, wrapper } = setup();
    fake.respondWith(ok({ ok: true, settlement_id: 's2', amount: 100 }));
    fake.respondWith(ok({ ok: true, settlement_id: 's3', amount: 1700 }));
    const { result } = await renderHook(() => ({ off: useWriteOff(), leaver: useProposeLeaverPayment() }), { wrapper });
    await act(async () => {
      await result.current.off.mutateAsync({ householdId: HH, other: 'k-sam', lineIds: ['l1'] });
      await result.current.leaver.mutateAsync({ householdId: HH, household: HH, receiver: 'sam', lineIds: ['l2'], expectedAmount: 1700 });
    });
    expect(rpcCalls(fake)).toEqual([
      ['write_off_balance', { p_other: 'k-sam', p_line_ids: ['l1'] }],
      ['propose_leaver_payment', { p_household: HH, p_receiver: 'sam', p_line_ids: ['l2'], p_expected_amount: 1700 }],
    ]);
  });
});
