import { DbError } from '../errors';
import {
  DECIDE_CHECK_HISTORY_COLUMNS,
  DECIDE_CHECK_HISTORY_INSERT_KEYS,
  insertCheckHistory,
  listCheckHistory,
  type DecideCheckHistoryRow,
  type NewDecideCheckHistory,
} from '../decideCheckHistory';
import { createFakeSupabase } from './fakeSupabase';

const NEW: NewDecideCheckHistory = { id: 'h1', check_id: 'c1', said_on: '2026-11-11', code: 'fits', variant: null, result: { v: 1 } };
const ROW: DecideCheckHistoryRow = { ...NEW, created_by: 'u1', created_at: '2026-11-11T00:00:00Z' };

describe('decide_check_history db module (06.1 CO-D-64 (6))', () => {
  it('inserts only the granted columns and returns the row', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: ROW, error: null, status: 201 });
    await expect(insertCheckHistory(client, NEW)).resolves.toEqual(ROW);
    const sent = client.calls.find((c) => c.method === 'insert')?.args[0] as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual([...DECIDE_CHECK_HISTORY_INSERT_KEYS].sort());
    expect(sent).not.toHaveProperty('created_by');
  });

  // 06.1-84 (G-61-12): the device's failed-write list showed "An item with the same details already exists." for this insert
  // during decide-bought. The table's only unique key is the client id, so a 23505 is a replay of a write that landed (a lost
  // response retried, or a paused write resumed): it reads the row back as success, like every other Decide insert.
  it('a replay of the same id (23505) reads the landed row back as success', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' }, status: 409 });
    client.respondWith({ data: ROW, error: null, status: 200 });
    await expect(insertCheckHistory(client, NEW)).resolves.toEqual(ROW);
  });

  it('a 23505 with no row to read back is still a failure', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'dup', code: '23505' }, status: 409 });
    client.respondWith({ data: null, error: null, status: 200 });
    await expect(insertCheckHistory(client, NEW)).rejects.toBeInstanceOf(DbError);
  });

  it('refuses a key outside the grant', async () => {
    const client = createFakeSupabase();
    await expect(insertCheckHistory(client, { ...NEW, created_by: 'x' } as unknown as NewDecideCheckHistory)).rejects.toThrow(TypeError);
  });

  it('lists a check history and maps errors', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [ROW], error: null, status: 200 });
    await expect(listCheckHistory(client, 'c1')).resolves.toEqual([ROW]);
    client.respondWith({ data: null, error: { message: 'x', code: '500' }, status: 500 });
    await expect(listCheckHistory(client, 'c1')).rejects.toBeInstanceOf(DbError);
    expect(DECIDE_CHECK_HISTORY_COLUMNS).toContain('said_on');
  });
});
