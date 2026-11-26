// 10.1-23 (D-07): a partner's receipt on a shared line shows without a manual refresh. A transaction_receipts INSERT or DELETE
// refetches that line's receipts and nothing else; the channel listens to the table (filtered by household like the others).
import { QueryClient } from '@tanstack/react-query';
import { applyRealtimeEvent, type RealtimePayload } from '../applyEvent';
import { HOUSEHOLD_CHANNEL_TABLES } from '../channel';
import { queryKeys } from '../../keys';
jest.mock('@/services/supabase', () => ({ supabase: {} }));

const H = 'h1';
const ctx = { activeHouseholdId: H, viewerId: 'u-me' };

function receiptEvent(eventType: RealtimePayload['eventType'], over: Partial<RealtimePayload> = {}): RealtimePayload {
  return {
    eventType,
    table: 'transaction_receipts',
    new: eventType === 'DELETE' ? {} : { id: 'r1', transaction_id: 't1', household_id: H, group_id: 'g1', page_no: 1 },
    old: eventType === 'DELETE' ? { id: 'r1', transaction_id: 't1' } : {},
    ...over,
  };
}

function seeded() {
  const qc = new QueryClient();
  qc.setQueryData(queryKeys.receipts(H, 't1'), []);
  qc.setQueryData(queryKeys.receipts(H, 't2'), []);
  qc.setQueryData(queryKeys.transactionsMonth(H, '2026-11'), [{ id: 't1', version: 1 }]);
  const spy = jest.spyOn(qc, 'invalidateQueries');
  return { qc, spy };
}

const invalidated = (spy: jest.SpyInstance) => spy.mock.calls.map((c) => (c[0] as { queryKey: unknown }).queryKey);

describe('transaction_receipts realtime', () => {
  it('is one of the household channel tables', () => {
    expect(HOUSEHOLD_CHANNEL_TABLES).toContain('transaction_receipts');
  });

  it('an INSERT invalidates that line’s receipts and nothing else', () => {
    const { qc, spy } = seeded();
    expect(applyRealtimeEvent(qc, receiptEvent('INSERT'), ctx)).toBe('invalidate');
    expect(invalidated(spy)).toEqual([queryKeys.receipts(H, 't1')]);
    expect(qc.getQueryState(queryKeys.receipts(H, 't1'))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(queryKeys.receipts(H, 't2'))?.isInvalidated).toBe(false);
    expect(qc.getQueryState(queryKeys.transactionsMonth(H, '2026-11'))?.isInvalidated).toBe(false);
  });

  it('a DELETE with the old line id invalidates that line’s receipts and nothing else', () => {
    const { qc, spy } = seeded();
    expect(applyRealtimeEvent(qc, receiptEvent('DELETE'), ctx)).toBe('invalidate');
    expect(invalidated(spy)).toEqual([queryKeys.receipts(H, 't1')]);
  });

  it('a DELETE carrying only the key refetches the household’s receipt lists only', () => {
    const { qc, spy } = seeded();
    expect(applyRealtimeEvent(qc, receiptEvent('DELETE', { old: { id: 'r1' } }), ctx)).toBe('invalidate');
    expect(invalidated(spy)).toEqual([['receipts', H]]);
    expect(qc.getQueryState(queryKeys.receipts(H, 't2'))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(queryKeys.transactionsMonth(H, '2026-11'))?.isInvalidated).toBe(false);
  });

  it('drops an INSERT for another household', () => {
    const { qc, spy } = seeded();
    const other = receiptEvent('INSERT', { new: { id: 'r9', transaction_id: 't9', household_id: 'h2' } });
    expect(applyRealtimeEvent(qc, other, ctx)).toBe('drop');
    expect(spy).not.toHaveBeenCalled();
  });
});
