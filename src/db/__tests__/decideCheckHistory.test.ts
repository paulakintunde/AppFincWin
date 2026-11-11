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
