import { NotFoundError, VersionConflictError } from '../errors';
import {
  HOLDING_LOT_COLUMNS,
  fetchHoldingLots,
  insertHoldingLot,
  updateHoldingLot,
  type HoldingLotRow,
  type NewHoldingLot,
} from '../holdingLots';
import { createFakeSupabase } from './fakeSupabase';

function lotRow(overrides: Partial<HoldingLotRow> = {}): HoldingLotRow {
  return {
    id: 'l1',
    holding_id: 'ho1',
    household_id: 'h1',
    created_by: 'u1',
    updated_by: null,
    kind: 'buy',
    amount: 10000,
    units: '2.5',
    local_date: '2026-11-01',
    note: null,
    is_sample: false,
    deleted_at: null,
    version: 1,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    ...overrides,
  };
}

const NEW_LOT: NewHoldingLot = {
  id: 'l1',
  holding_id: 'ho1',
  household_id: 'h1',
  kind: 'buy',
  amount: 10000,
  local_date: '2026-11-01',
};

describe('holding lots', () => {
  it('fetchHoldingLots selects live entries ordered by date then creation', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [lotRow()], error: null, status: 200 });
    await expect(fetchHoldingLots(client, 'h1')).resolves.toEqual([lotRow()]);
    expect(client.calls.find((c) => c.method === 'select')?.args).toEqual([HOLDING_LOT_COLUMNS]);
    expect(client.calls.find((c) => c.method === 'is')?.args).toEqual(['deleted_at', null]);
    expect(client.calls.filter((c) => c.method === 'order').map((c) => c.args[0])).toEqual(['local_date', 'created_at']);
  });

  it('insertHoldingLot rejects a key outside the grant before any request', async () => {
    const client = createFakeSupabase();
    await expect(insertHoldingLot(client, { ...NEW_LOT, is_sample: true } as unknown as NewHoldingLot)).rejects.toBeInstanceOf(TypeError);
    expect(client.calls).toHaveLength(0);
  });

  it('insertHoldingLot returns the row, and the existing row on a 23505 replay', async () => {
    const ok = createFakeSupabase();
    ok.respondWith({ data: lotRow(), error: null, status: 201 });
    await expect(insertHoldingLot(ok, NEW_LOT)).resolves.toEqual(lotRow());

    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'dup', code: '23505' }, status: 409 });
    client.respondWith({ data: lotRow(), error: null, status: 200 });
    await expect(insertHoldingLot(client, NEW_LOT)).resolves.toEqual(lotRow());
  });

  it('updateHoldingLot is version-conditional and never patches kind', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [lotRow({ amount: 20000, version: 2 })], error: null, status: 200 });
    await expect(updateHoldingLot(client, 'l1', 1, { amount: 20000 })).resolves.toMatchObject({ version: 2 });

    const c2 = createFakeSupabase();
    await expect(updateHoldingLot(c2, 'l1', 1, { kind: 'sell' } as never)).rejects.toBeInstanceOf(TypeError);
    expect(c2.calls).toHaveLength(0);
  });

  it('updateHoldingLot with a stale version throws VersionConflictError', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [], error: null, status: 200 });
    client.respondWith({ data: lotRow({ version: 3 }), error: null, status: 200 });
    await expect(updateHoldingLot(client, 'l1', 1, { amount: 1 })).rejects.toBeInstanceOf(VersionConflictError);
  });

  it('updateHoldingLot with no row throws NotFoundError', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [], error: null, status: 200 });
    client.respondWith({ data: null, error: null, status: 200 });
    await expect(updateHoldingLot(client, 'l1', 1, { amount: 1 })).rejects.toBeInstanceOf(NotFoundError);
  });
});
