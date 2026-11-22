import { fetchOptins, fetchOwnNetShares } from '../partnerOptins';
import { createFakeSupabase } from './fakeSupabase';

const ok = (data: unknown) => ({ data, error: null, status: 200 });
const fail = { data: null, error: { message: 'boom', code: 'XX000' }, status: 500 };

// 08.1 review C-CR-01 / C-WR-01: a leaver's device must not publish into the household it left, so the reads that drive the
// hourly publish ask for the current household's rows only.
describe('partner opt-ins db, current household only', () => {
  it('reads only the safety-net shares of the current household', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok([{ household_id: 'h2', goal_id: 'g1', owner_id: 'u1', enabled: true, rounded_saved: 1000, updated_at: 't' }]));
    expect(await fetchOwnNetShares(client, 'h2')).toHaveLength(1);
    expect(client.calls.filter((c) => c.method === 'eq').map((c) => c.args)).toEqual([['household_id', 'h2']]);
    expect(client.calls[0]?.table).toBe('safety_net_shares');
  });

  it('reads only the opt-ins of the current household', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok([]));
    expect(await fetchOptins(client, 'h2')).toEqual([]);
    expect(client.calls.filter((c) => c.method === 'eq').map((c) => c.args)).toEqual([['household_id', 'h2']]);
    expect(client.calls[0]?.table).toBe('decide_partner_optins');
  });

  it('treats a null body as empty and throws on a read error', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok(null));
    expect(await fetchOwnNetShares(client, 'h1')).toEqual([]);
    client.respondWith(ok(null));
    expect(await fetchOptins(client, 'h1')).toEqual([]);
    client.respondWith(fail);
    await expect(fetchOwnNetShares(client, 'h1')).rejects.toBeDefined();
    client.respondWith(fail);
    await expect(fetchOptins(client, 'h1')).rejects.toBeDefined();
  });
});
