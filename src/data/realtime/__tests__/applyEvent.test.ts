import { QueryClient } from '@tanstack/react-query';
import { applyRealtimeEvent, remoteVersions, type RealtimePayload } from '../applyEvent';
import { queryKeys } from '../../keys';
jest.mock('@/services/supabase', () => ({ supabase: {} }));

const H = 'h1';
const ME = 'u-me';
const ctx = { activeHouseholdId: H, viewerId: ME };

function qcWith(rows: Record<string, unknown>[]) {
  const qc = new QueryClient();
  qc.setQueryData(queryKeys.transactionsMonth(H, '2026-11'), rows);
  return qc;
}
const month = (qc: QueryClient) => qc.getQueryData<Record<string, unknown>[]>(queryKeys.transactionsMonth(H, '2026-11'));

const tx = (over: Record<string, unknown> = {}): RealtimePayload => ({
  eventType: 'UPDATE',
  table: 'transactions',
  new: { id: 't1', household_id: H, version: 3, local_date: '2026-11-15', note: 'remote', deleted_at: null, ...over },
  old: {},
});

describe('applyRealtimeEvent', () => {
  beforeEach(() => remoteVersions.clear());

  it('drops an own-write echo (same version as the cache)', () => {
    const qc = qcWith([{ id: 't1', version: 3, note: 'mine' }]);
    expect(applyRealtimeEvent(qc, tx(), ctx)).toBe('drop');
    expect(month(qc)![0]!.note).toBe('mine');
  });

  it('applies a newer version by merging over the cached row and clearing pending', () => {
    const qc = qcWith([{ id: 't1', version: 2, note: 'old', amount: 5, pending: true }]);
    expect(applyRealtimeEvent(qc, tx(), ctx)).toBe('apply');
    expect(month(qc)![0]).toMatchObject({ id: 't1', version: 3, note: 'remote', amount: 5 });
    expect(month(qc)![0]!.pending).toBeUndefined();
  });

  it('holds when a queued write names the row, leaving the cache untouched', async () => {
    const qc = qcWith([{ id: 't1', version: 2, note: 'old' }]);
    const m = qc.getMutationCache().build(qc, { mutationKey: ['transactions', 'edit'], mutationFn: () => new Promise(() => undefined) });
    void m.execute({ id: 't1', patch: { note: 'local' } }).catch(() => undefined);
    expect(applyRealtimeEvent(qc, tx(), ctx)).toBe('hold');
    expect(month(qc)![0]!.note).toBe('old');
    expect(remoteVersions.get('t1')).toBe(3);
  });

  it('removes a row that arrives soft-deleted', () => {
    const qc = qcWith([{ id: 't1', version: 2 }, { id: 't2', version: 1 }]);
    expect(applyRealtimeEvent(qc, tx({ deleted_at: '2026-11-15T00:00:00Z' }), ctx)).toBe('apply');
    expect(month(qc)!.map((r) => r.id)).toEqual(['t2']);
  });

  it('refetches the month for a row that is not cached yet instead of inserting a partial row', () => {
    const qc = qcWith([{ id: 't2', version: 1 }]);
    const spy = jest.spyOn(qc, 'invalidateQueries');
    expect(applyRealtimeEvent(qc, { ...tx(), eventType: 'INSERT' }, ctx)).toBe('apply');
    expect(month(qc)!.map((r) => r.id)).toEqual(['t2']);
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.transactionsMonth(H, '2026-11') });
  });

  it('removes the line on a made_private notice', () => {
    const qc = qcWith([{ id: 't1', version: 2 }, { id: 't2', version: 1 }]);
    const ev: RealtimePayload = { eventType: 'INSERT', table: 'household_events', new: { id: 'e1', household_id: H, kind: 'made_private', ref_id: 't1' }, old: {} };
    expect(applyRealtimeEvent(qc, ev, ctx)).toBe('remove');
    expect(month(qc)!.map((r) => r.id)).toEqual(['t2']);
  });

  it('resets the household scope when the viewer is the removed member', () => {
    const qc = qcWith([{ id: 't1', version: 2 }]);
    qc.setQueryData(queryKeys.household(ME), H);
    const ev: RealtimePayload = { eventType: 'INSERT', table: 'household_events', new: { id: 'e2', household_id: H, kind: 'removed', subject_id: ME }, old: {} };
    expect(applyRealtimeEvent(qc, ev, ctx)).toBe('reset');
    expect(month(qc)).toBeUndefined();
  });

  it('refreshes members when someone else leaves', () => {
    const qc = qcWith([]);
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const ev: RealtimePayload = { eventType: 'INSERT', table: 'household_events', new: { id: 'e3', household_id: H, kind: 'left', subject_id: 'other' }, old: {} };
    expect(applyRealtimeEvent(qc, ev, ctx)).toBe('invalidate');
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.householdMembers(H) });
  });

  it('drops an event for another household', () => {
    const qc = qcWith([{ id: 't1', version: 1, note: 'mine' }]);
    expect(applyRealtimeEvent(qc, tx({ household_id: 'other' }), ctx)).toBe('drop');
    expect(month(qc)![0]!.note).toBe('mine');
  });

  it('drops everything when no household is active', () => {
    expect(applyRealtimeEvent(qcWith([]), tx(), { activeHouseholdId: null, viewerId: ME })).toBe('drop');
  });

  it('refetches settlements and balances on a settlement event', () => {
    const qc = qcWith([]);
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const ev: RealtimePayload = { eventType: 'UPDATE', table: 'settlements', new: { id: 's1', household_id: H }, old: {} };
    expect(applyRealtimeEvent(qc, ev, ctx)).toBe('invalidate');
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.settlements(H) });
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.householdBalances(H) });
  });

  it('refetches on a DELETE (keys only) without trusting the payload', () => {
    const qc = qcWith([]);
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const ev: RealtimePayload = { eventType: 'DELETE', table: 'settlement_lines', new: {}, old: { settlement_id: 's1', transaction_id: 't1' } };
    expect(applyRealtimeEvent(qc, ev, ctx)).toBe('invalidate');
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.settlements(H) });
  });
});
