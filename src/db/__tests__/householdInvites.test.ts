import { DbError } from '../errors';
import {
  cancelInvite,
  createInvite,
  fetchOpenInvites,
  inviteLink,
  normaliseInviteCode,
  previewInvite,
  redeemInvite,
  restoreInvite,
} from '../householdInvites';
import { createFakeSupabase } from './fakeSupabase';

const ok = (data: unknown) => ({ data, error: null, status: 200 });

describe('normaliseInviteCode', () => {
  it('groups 12 valid characters', () => {
    expect(normaliseInviteCode('abcd1234efgh')).toBe('ABCD-1234-EFGH');
    expect(normaliseInviteCode(' abcd-1234 efgh ')).toBe('ABCD-1234-EFGH');
  });
  it('reads O as 0 and I or L as 1', () => {
    expect(normaliseInviteCode('OOOO-IIII-LLLL')).toBe('0000-1111-1111');
  });
  it('rejects wrong length and characters outside the alphabet', () => {
    expect(normaliseInviteCode('ABCD-1234')).toBeNull();
    expect(normaliseInviteCode('ABCD-1234-EFGU')).toBeNull();
    expect(normaliseInviteCode('')).toBeNull();
  });
});

describe('inviteLink', () => {
  it('uses the custom scheme only', () => {
    expect(inviteLink('ABCD-1234-EFGH')).toBe('fincwin://invite?code=ABCD-1234-EFGH');
  });
});

describe('invite RPC wrappers', () => {
  it('createInvite returns the code or a refusal', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok({ ok: true, invite_id: 'i1', code: 'ABCD-1234-EFGH', expires_at: 'x' }));
    client.respondWith(ok({ ok: false, reason: 'full' }));
    expect(await createInvite(client)).toMatchObject({ ok: true, code: 'ABCD-1234-EFGH' });
    expect(await createInvite(client)).toEqual({ ok: false, reason: 'full' });
    expect(client.calls[0]).toEqual({ method: 'rpc', args: ['create_invite', undefined] });
  });

  it('fetchOpenInvites unwraps the list', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok({ ok: true, invites: [{ invite_id: 'i1', code: 'A', expires_at: 'e', created_at: 'c' }] }));
    expect(await fetchOpenInvites(client)).toHaveLength(1);
  });

  it('cancel, restore, preview and redeem pass the right argument names', async () => {
    const client = createFakeSupabase();
    for (let i = 0; i < 4; i++) client.respondWith(ok({ ok: true }));
    await cancelInvite(client, 'i1');
    await restoreInvite(client, 'i1');
    await previewInvite(client, 'C');
    await redeemInvite(client, 'C');
    expect(client.calls.map((c) => c.args)).toEqual([
      ['cancel_invite', { p_invite_id: 'i1' }],
      ['restore_invite', { p_invite_id: 'i1' }],
      ['preview_invite', { p_code: 'C' }],
      ['redeem_invite', { p_code: 'C', p_store_country: null }],
    ]);
  });

  it('throws a db error when the call itself fails', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'boom', code: '42501' }, status: 403 });
    await expect(redeemInvite(client, 'C')).rejects.toBeInstanceOf(DbError);
  });
});
