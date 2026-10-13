import { DbError } from '../errors';
import { ENTRY_LIST_MAX_ROWS, ENTRY_LIST_MAX_SERIES, recordEntryList } from '../entryList';
import type { NewRecurringSeries } from '../recurringSeries';
import { createFakeSupabase } from './fakeSupabase';

const SERIES: NewRecurringSeries = {
  id: 's1',
  household_id: 'h1',
  account_id: 'a1',
  name: 'Rent',
  amount: -1000,
  currency: 'GBP',
  category_id: null,
  payment_type: null,
  freq: 'monthly',
  anchor_date: '2026-10-01',
  time_zone: 'Europe/London',
  end_date: null,
  occurrence_count: null,
};
const UNDO = { id: 'step-1', labelKey: 'addedMany' as const, labelParams: { n: 2 } };

describe('recordEntryList', () => {
  it('calls record_entry_list with snake_case params', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { status: 'applied', undo_step_id: 'step-1', changes: [] }, error: null, status: 200 });
    const result = await recordEntryList(client, ['r1', 'r2'], [{ series: SERIES, anchorTransactionId: 'r1' }], UNDO);
    expect(result).toEqual({ status: 'applied', undoStepId: 'step-1' });
    const call = client.calls.find((c) => c.method === 'rpc');
    expect(call?.args[0]).toBe('record_entry_list');
    expect(call?.args[1]).toEqual({
      p_row_ids: ['r1', 'r2'],
      p_items: [{ series: SERIES, anchor_transaction_id: 'r1' }],
      p_undo_step: { id: 'step-1', label_key: 'addedMany', label_params: { n: 2 } },
    });
  });

  it('returns already-applied', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { status: 'already-applied', undo_step_id: 'step-1' }, error: null, status: 200 });
    expect(await recordEntryList(client, ['r1'], [], UNDO)).toEqual({ status: 'already-applied', undoStepId: 'step-1' });
  });

  it('throws bad-response on an unknown status', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { status: 'weird' }, error: null, status: 200 });
    await expect(recordEntryList(client, ['r1'], [], UNDO)).rejects.toMatchObject({ code: 'bad-response' });
  });

  it('throws a DbError on a null response', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: null, status: 200 });
    await expect(recordEntryList(client, ['r1'], [], UNDO)).rejects.toBeInstanceOf(DbError);
  });

  it('refuses out-of-range sizes before calling', async () => {
    const client = createFakeSupabase();
    await expect(recordEntryList(client, [], [], UNDO)).rejects.toBeInstanceOf(RangeError);
    const many = Array.from({ length: ENTRY_LIST_MAX_ROWS + 1 }, (_, i) => `r${i}`);
    await expect(recordEntryList(client, many, [], UNDO)).rejects.toBeInstanceOf(RangeError);
    const items = Array.from({ length: ENTRY_LIST_MAX_SERIES + 1 }, () => ({ series: SERIES, anchorTransactionId: 'r1' }));
    await expect(recordEntryList(client, ['r1'], items, UNDO)).rejects.toBeInstanceOf(RangeError);
    expect(client.calls).toHaveLength(0);
  });
});
