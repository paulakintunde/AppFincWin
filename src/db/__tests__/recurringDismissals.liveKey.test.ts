// 05.2-73 (WR-03): a live-key collision (same household + payee_key + direction) resolves to the live row.
import { createFakeSupabase } from './fakeSupabase';
import { insertDismissal } from '../recurringDismissals';

const dup = { message: 'dup', code: '23505' };
const row = { id: 'mine', household_id: 'h1', payee_key: 'gym', direction: 'out' as const };
const live = { id: 'other', household_id: 'h1', payee_key: 'gym', direction: 'out', deleted_at: null, version: 3 };

describe('insertDismissal live-key collision', () => {
  it('resolves to the live row with own false when the id lookup is empty', async () => {
    const c = createFakeSupabase();
    c.respondWith({ data: null, error: dup, status: 409 });
    c.respondWith({ data: null, error: null, status: 200 });
    c.respondWith({ data: live, error: null, status: 200 });
    await expect(insertDismissal(c, row)).resolves.toEqual({ row: live, own: false });
    const eqs = c.calls.filter((x) => x.method === 'eq').map((x) => x.args);
    expect(eqs).toContainEqual(['household_id', 'h1']);
    expect(eqs).toContainEqual(['payee_key', 'gym']);
    expect(eqs).toContainEqual(['direction', 'out']);
    expect(c.calls.filter((x) => x.method === 'is').map((x) => x.args)).toContainEqual(['deleted_at', null]);
  });

  it('reads a duplicate client id back as own without a second lookup', async () => {
    const c = createFakeSupabase();
    const mine = { ...live, id: 'mine' };
    c.respondWith({ data: null, error: dup, status: 409 });
    c.respondWith({ data: mine, error: null, status: 200 });
    await expect(insertDismissal(c, row)).resolves.toEqual({ row: mine, own: true });
    expect(c.calls.filter((x) => x.method === 'maybeSingle')).toHaveLength(1);
  });

  it('throws when 23505 and both lookups are empty', async () => {
    const c = createFakeSupabase();
    c.respondWith({ data: null, error: dup, status: 409 });
    c.respondWith({ data: null, error: null, status: 200 });
    c.respondWith({ data: null, error: null, status: 200 });
    await expect(insertDismissal(c, row)).rejects.toBeDefined();
  });

  it('throws on a non-23505 error with no lookups', async () => {
    const c = createFakeSupabase();
    c.respondWith({ data: null, error: { message: 'x', code: '42501' }, status: 403 });
    await expect(insertDismissal(c, row)).rejects.toBeDefined();
    expect(c.calls.filter((x) => x.method === 'maybeSingle')).toHaveLength(0);
  });
});
