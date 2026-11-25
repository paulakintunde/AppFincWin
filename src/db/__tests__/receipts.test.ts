import { RECEIPT_COLUMNS, addReceipt, listReceipts, receiptObjectPath, removeAllReceipts, removeReceipt } from '../receipts';
import { createFakeSupabase } from './fakeSupabase';

const ok = (data: unknown) => ({ data, error: null, status: 200 });

describe('receipts', () => {
  it('makes no request for no ids', async () => {
    const client = createFakeSupabase();
    expect(await listReceipts(client, [])).toEqual([]);
    expect(client.calls).toHaveLength(0);
  });

  it('selects the receipt columns for the lines, oldest first then by page', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok([{ id: 'r1' }]));
    expect(await listReceipts(client, ['t1', 't2'])).toEqual([{ id: 'r1' }]);
    expect(client.calls.find((c) => c.method === 'select')).toMatchObject({ table: 'transaction_receipts', args: [RECEIPT_COLUMNS] });
    expect(client.calls.find((c) => c.method === 'in')?.args).toEqual(['transaction_id', ['t1', 't2']]);
    expect(client.calls.filter((c) => c.method === 'order').map((c) => (c.args[0] as string))).toEqual(['created_at', 'page_no']);
  });

  it('reads in chunks of 100 ids', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok([{ id: 'a' }]));
    client.respondWith(ok([{ id: 'b' }]));
    const rows = await listReceipts(client, Array.from({ length: 101 }, (_, i) => `t${i}`));
    expect(rows).toHaveLength(2);
    expect(client.calls.filter((c) => c.method === 'in')).toHaveLength(2);
  });

  it('asks for the object path', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok('u/t/r.jpg'));
    expect(await receiptObjectPath(client, 'r', 't', 'image/jpeg')).toBe('u/t/r.jpg');
    expect(client.calls[0]?.args).toEqual(['receipt_object_path', { p_id: 'r', p_transaction: 't', p_mime: 'image/jpeg' }]);
  });

  it('maps addReceipt arguments', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok({ ok: true, object_path: 'p', already: false }));
    await addReceipt(client, { id: 'r', transactionId: 't', groupId: 'g', pageNo: 2, kind: 'scan', mime: 'image/png', bytes: 99 });
    expect(client.calls[0]?.args).toEqual([
      'add_receipt',
      { p_id: 'r', p_transaction: 't', p_group_id: 'g', p_page_no: 2, p_kind: 'scan', p_mime: 'image/png', p_bytes: 99 },
    ]);
  });

  it('maps the two remove calls', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok({ ok: true, removed: 2 }));
    client.respondWith(ok({ ok: true, removed: 3 }));
    await removeReceipt(client, 'g');
    await removeAllReceipts(client, 't');
    expect(client.calls.map((c) => c.args)).toEqual([
      ['remove_receipt', { p_group_id: 'g' }],
      ['remove_all_receipts', { p_transaction: 't' }],
    ]);
  });
});
