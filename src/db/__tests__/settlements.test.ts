import { DbError } from '../errors';
import { fetchFormerMembers } from '../householdFormerMembers';
import {
  askToSettle,
  cancelSettlement,
  confirmSettlement,
  fetchLiveSettlementLines,
  fetchMySettlements,
  myDepartedBalances,
  proposeLeaverPayment,
  proposeSettlement,
  recordPaid,
  recordReceived,
  rejectSettlement,
  setSettlementPayerAccount,
  undoSettlement,
  writeOffBalance,
} from '../settlements';
import { createFakeSupabase } from './fakeSupabase';

const ok = (data: unknown) => ({ data, error: null, status: 200 });

describe('settlement reads', () => {
  it('reads my settlements with their lines, newest first', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok([{ id: 's1', lines: [{ transaction_id: 't1' }] }]));
    const rows = await fetchMySettlements(client, 'h1');
    expect(rows[0]?.lines).toHaveLength(1);
    expect(client.calls.find((c) => c.method === 'select')?.table).toBe('settlements');
    expect(String(client.calls.find((c) => c.method === 'select')?.args[0])).toContain('settlement_lines(');
    expect(client.calls.find((c) => c.method === 'order')?.args).toEqual(['created_at', { ascending: false }]);
  });

  it('reads only live lines, in chunks', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok([{ transaction_id: 'a' }]));
    client.respondWith(ok([{ transaction_id: 'z' }]));
    const ids = Array.from({ length: 150 }, (_, i) => `t${i}`);
    expect(await fetchLiveSettlementLines(client, ids)).toHaveLength(2);
    expect(client.calls.filter((c) => c.method === 'eq').map((c) => c.args)).toEqual([
      ['live', true],
      ['live', true],
    ]);
  });

  it('reads former members oldest first and throws read errors as DbError', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok([{ former_key: 'k' }]));
    expect(await fetchFormerMembers(client, 'h1')).toEqual([{ former_key: 'k' }]);
    expect(client.calls.find((c) => c.method === 'order')?.args).toEqual(['left_at', { ascending: true }]);
    client.respondWith({ data: null, error: { message: 'denied', code: '42501' }, status: 403 });
    await expect(fetchFormerMembers(client, 'h1')).rejects.toBeInstanceOf(DbError);
  });
});

describe('settlement RPC wrappers', () => {
  it('calls each 08-11 and 08-14 RPC by its server name and argument names', async () => {
    const client = createFakeSupabase();
    for (let i = 0; i < 12; i += 1) client.respondWith(ok({ ok: true }));
    await proposeSettlement(client, { receiver: 'r', lineIds: ['l1'], payerAccount: 'pa', expectedAmount: 700 });
    await confirmSettlement(client, 's1', 'ra');
    await recordReceived(client, { payer: 'p', lineIds: ['l1'], receiverAccount: 'ra', expectedAmount: 700 });
    await recordPaid(client, { other: 'o', lineIds: ['l1'], payerAccount: 'pa', expectedAmount: 700 });
    await setSettlementPayerAccount(client, 's1', 'pa');
    await rejectSettlement(client, 's1');
    await cancelSettlement(client, 's1');
    await undoSettlement(client, 's1');
    await writeOffBalance(client, 'o', ['l1']);
    await askToSettle(client, 'o');
    await proposeLeaverPayment(client, { household: 'h1', receiver: 'r', lineIds: ['l1'], expectedAmount: 700 });
    await myDepartedBalances(client);
    expect(client.calls.filter((c) => c.method === 'rpc').map((c) => c.args)).toEqual([
      ['propose_settlement', { p_receiver: 'r', p_line_ids: ['l1'], p_payer_account: 'pa', p_expected_amount: 700 }],
      ['confirm_settlement', { p_id: 's1', p_receiver_account: 'ra' }],
      ['record_received', { p_payer: 'p', p_line_ids: ['l1'], p_receiver_account: 'ra', p_expected_amount: 700 }],
      ['record_paid', { p_other: 'o', p_line_ids: ['l1'], p_payer_account: 'pa', p_expected_amount: 700 }],
      ['set_settlement_payer_account', { p_id: 's1', p_account: 'pa' }],
      ['reject_settlement', { p_id: 's1' }],
      ['cancel_settlement', { p_id: 's1' }],
      ['undo_settlement', { p_id: 's1' }],
      ['write_off_balance', { p_other: 'o', p_line_ids: ['l1'] }],
      ['ask_to_settle', { p_other: 'o' }],
      ['propose_leaver_payment', { p_household: 'h1', p_receiver: 'r', p_line_ids: ['l1'], p_expected_amount: 700 }],
      ['my_departed_balances', undefined],
    ]);
  });

  it('returns lines_changed with the server amount untouched and throws transport errors as DbError', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok({ ok: false, reason: 'lines_changed', server_amount: 650 }));
    expect(await proposeSettlement(client, { receiver: 'r', lineIds: [], payerAccount: 'pa', expectedAmount: 700 })).toEqual({
      ok: false,
      reason: 'lines_changed',
      server_amount: 650,
    });
    client.respondWith({ data: null, error: { message: 'boom', code: '' }, status: 0 });
    await expect(askToSettle(client, 'o')).rejects.toBeInstanceOf(DbError);
  });

  it('carries the pending "I paid" fields of a departed balance', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok({ ok: true, balances: [{ other_id: 'o', amount: 1700, pending_settlement_id: 's9', pending_amount: 1700 }] }));
    const res = await myDepartedBalances(client);
    expect(res.ok && res.balances?.[0]?.pending_settlement_id).toBe('s9');
  });
});
