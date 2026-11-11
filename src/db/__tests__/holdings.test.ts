import { NotFoundError, VersionConflictError } from '../errors';
import {
  HOLDING_COLUMNS,
  fetchHoldings,
  insertHolding,
  updateHolding,
  type HoldingRow,
  type NewHolding,
} from '../holdings';
import { createFakeSupabase } from './fakeSupabase';

function holdingRow(overrides: Partial<HoldingRow> = {}): HoldingRow {
  return {
    id: 'ho1',
    household_id: 'h1',
    created_by: 'u1',
    updated_by: null,
    name: 'Index fund',
    type: 'brokerage',
    currency: 'GBP',
    value: 500000,
    value_as_of: '2026-11-01',
    opening_put_in: 400000,
    account_id: null,
    paid_from_account_id: null,
    monthly_amount: null,
    day: null,
    rate: null,
    is_sample: false,
    deleted_at: null,
    version: 1,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    ...overrides,
  };
}

const NEW_HOLDING: NewHolding = {
  id: 'ho1',
  household_id: 'h1',
  name: 'Index fund',
  type: 'brokerage',
  currency: 'GBP',
  value: 500000,
  value_as_of: '2026-11-01',
};

describe('holdings', () => {
  it('fetchHoldings selects live holdings of the household, oldest first', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [holdingRow()], error: null, status: 200 });
    await expect(fetchHoldings(client, 'h1')).resolves.toEqual([holdingRow()]);
    expect(client.calls.find((c) => c.method === 'select')?.args).toEqual([HOLDING_COLUMNS]);
    expect(client.calls.find((c) => c.method === 'eq')?.args).toEqual(['household_id', 'h1']);
    expect(client.calls.find((c) => c.method === 'is')?.args).toEqual(['deleted_at', null]);
    expect(client.calls.find((c) => c.method === 'order')?.args).toEqual(['created_at', { ascending: true }]);
  });

  it('insertHolding rejects a key outside the grant before any request', async () => {
    const client = createFakeSupabase();
    await expect(insertHolding(client, { ...NEW_HOLDING, is_sample: true } as unknown as NewHolding)).rejects.toBeInstanceOf(TypeError);
    expect(client.calls).toHaveLength(0);
  });

  it('insertHolding returns the row, and the existing row on a 23505 replay', async () => {
    const ok = createFakeSupabase();
    ok.respondWith({ data: holdingRow(), error: null, status: 201 });
    await expect(insertHolding(ok, NEW_HOLDING)).resolves.toEqual(holdingRow());

    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'dup', code: '23505' }, status: 409 });
    client.respondWith({ data: holdingRow(), error: null, status: 200 });
    await expect(insertHolding(client, NEW_HOLDING)).resolves.toEqual(holdingRow());
  });

  it('updateHolding is version-conditional and refuses value as a patch key', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [holdingRow({ name: 'Fund', version: 2 })], error: null, status: 200 });
    await expect(updateHolding(client, 'ho1', 1, { name: 'Fund' })).resolves.toMatchObject({ version: 2 });
    expect(client.calls.find((c) => c.method === 'eq' && (c.args[0] as string) === 'version')?.args).toEqual(['version', 1]);

    const c2 = createFakeSupabase();
    await expect(updateHolding(c2, 'ho1', 1, { value: 1 } as never)).rejects.toBeInstanceOf(TypeError);
    expect(c2.calls).toHaveLength(0);
  });

  it('updateHolding with a stale version throws VersionConflictError carrying the server row', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [], error: null, status: 200 });
    client.respondWith({ data: holdingRow({ version: 3 }), error: null, status: 200 });
    await expect(updateHolding(client, 'ho1', 1, { name: 'Fund' })).rejects.toBeInstanceOf(VersionConflictError);
  });

  it('updateHolding with no row throws NotFoundError', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [], error: null, status: 200 });
    client.respondWith({ data: null, error: null, status: 200 });
    await expect(updateHolding(client, 'ho1', 1, { name: 'Fund' })).rejects.toBeInstanceOf(NotFoundError);
  });
});
