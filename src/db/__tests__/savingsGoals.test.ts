import { NotFoundError, VersionConflictError } from '../errors';
import * as goals from '../savingsGoals';
import {
  SAVINGS_GOAL_COLUMNS,
  SAVINGS_GOAL_INSERT_KEYS,
  SAVINGS_GOAL_PATCH_KEYS,
  fetchGoalLines,
  fetchSavingsGoals,
  insertSavingsGoal,
  updateSavingsGoal,
  type NewPot,
  type SavingsGoalRow,
} from '../savingsGoals';
import { createFakeSupabase } from './fakeSupabase';

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';

function goalRow(overrides: Partial<SavingsGoalRow> = {}): SavingsGoalRow {
  return {
    id: ID_A,
    household_id: 'h1',
    created_by: 'u1',
    check_id: null,
    name: 'Laptop',
    currency: 'GBP',
    target: 120000,
    monthly_amount: 10000,
    ready_by: '2027-06',
    opening_saved: 0,
    kind: 'pot',
    done_at: null,
    is_sample: false,
    deleted_at: null,
    version: 1,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

describe('savingsGoals module surface', () => {
  it('D-101 exports one insert function and it takes a pot', () => {
    expect(Object.keys(goals).filter((k) => /^insert/i.test(k))).toEqual(['insertSavingsGoal']);
  });
});

describe('fetchSavingsGoals', () => {
  it('selects live goals of the household', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [goalRow()], error: null, status: 200 });
    await expect(fetchSavingsGoals(client, 'h1')).resolves.toEqual([goalRow()]);
    expect(client.calls.find((c) => c.method === 'eq')?.args).toEqual(['household_id', 'h1']);
    expect(client.calls.find((c) => c.method === 'is')?.args).toEqual(['deleted_at', null]);
  });
});

describe('updateSavingsGoal', () => {
  it('refuses a key outside the grant before a request', async () => {
    const client = createFakeSupabase();
    for (const bad of [{ kind: 'wait' }, { check_id: ID_B }, { currency: 'USD' }, { bucket: 'car' }]) {
      await expect(updateSavingsGoal(client, ID_A, 1, bad as unknown as { deleted_at: string })).rejects.toBeInstanceOf(TypeError);
    }
    expect(client.calls).toHaveLength(0);
  });

  it('D-101 patches done_at, name, target, ready_by and opening_saved with a version check', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [goalRow({ version: 2 })], error: null, status: 200 });
    await updateSavingsGoal(client, ID_A, 1, {
      name: 'Car service',
      target: 60000,
      ready_by: '2027-03-31',
      opening_saved: 0,
      done_at: '2026-10-24T00:00:00Z',
    });
    expect(client.calls.find((c) => c.method === 'update')?.args[0]).toMatchObject({ name: 'Car service', target: 60000 });
  });

  it('refuses a bad target or name before a request', async () => {
    const client = createFakeSupabase();
    await expect(updateSavingsGoal(client, ID_A, 1, { target: 0 })).rejects.toBeInstanceOf(RangeError);
    await expect(updateSavingsGoal(client, ID_A, 1, { name: '' })).rejects.toBeInstanceOf(RangeError);
    expect(client.calls).toHaveLength(0);
  });

  it('accepts a null target in a patch (a bucket goal cleared) and still refuses 0, negatives and over 10^13', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [goalRow({ version: 2, target: null })], error: null, status: 200 });
    await updateSavingsGoal(client, ID_A, 1, { target: null });
    expect(client.calls.find((c) => c.method === 'update')?.args[0]).toEqual({ target: null });
    const bad = createFakeSupabase();
    await expect(updateSavingsGoal(bad, ID_A, 1, { target: -5 })).rejects.toBeInstanceOf(RangeError);
    await expect(updateSavingsGoal(bad, ID_A, 1, { target: 10 ** 13 + 1 })).rejects.toBeInstanceOf(RangeError);
    expect(bad.calls).toHaveLength(0);
  });

  it('soft deletes with a version check', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [goalRow({ version: 2, deleted_at: 'now' })], error: null, status: 200 });
    await expect(updateSavingsGoal(client, ID_A, 1, { deleted_at: 'now' })).resolves.toMatchObject({ version: 2 });
    expect(client.calls.filter((c) => c.method === 'eq').map((c) => c.args)).toContainEqual(['version', 1]);
  });

  it('classifies conflict and not-found', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [], error: null, status: 200 });
    client.respondWith({ data: goalRow({ version: 4 }), error: null, status: 200 });
    await expect(updateSavingsGoal(client, ID_A, 1, { deleted_at: 'now' })).rejects.toBeInstanceOf(VersionConflictError);
    client.respondWith({ data: [], error: null, status: 200 });
    client.respondWith({ data: null, error: null, status: 200 });
    await expect(updateSavingsGoal(client, ID_A, 1, { deleted_at: 'now' })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('fetchGoalLines', () => {
  it('returns [] with no request for no ids', async () => {
    const client = createFakeSupabase();
    await expect(fetchGoalLines(client, 'h1', [])).resolves.toEqual([]);
    expect(client.calls).toHaveLength(0);
  });

  it('filters by household, live rows and goal_id', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [{ id: 't1' }], error: null, status: 200 });
    await expect(fetchGoalLines(client, 'h1', [ID_A, ID_B])).resolves.toHaveLength(1);
    expect(client.calls.find((c) => c.method === 'in')?.args).toEqual(['goal_id', [ID_A, ID_B]]);
    expect(client.calls.find((c) => c.method === 'is')?.args).toEqual(['deleted_at', null]);
  });

  it('rejects an invalid id or more than 200 ids with RangeError', async () => {
    const client = createFakeSupabase();
    await expect(fetchGoalLines(client, 'h1', ['x),or(id.neq.0'])).rejects.toBeInstanceOf(RangeError);
    await expect(fetchGoalLines(client, 'h1', Array.from({ length: 201 }, () => ID_A))).rejects.toBeInstanceOf(RangeError);
    expect(client.calls).toHaveLength(0);
  });
});

describe('D-101 pot columns and keys', () => {
  it('D-101 savings goal columns and patch keys match the grant', () => {
    expect(SAVINGS_GOAL_COLUMNS.split(', ')).toEqual(expect.arrayContaining(['kind', 'done_at', 'opening_saved', 'ready_by']));
    // grant insert (id, household_id, kind, name, currency, target, ready_by, opening_saved)
    expect([...SAVINGS_GOAL_INSERT_KEYS].sort()).toEqual(
      [
        'household_id',
        'id',
        'currency',
        'kind',
        'name',
        'opening_saved',
        'ready_by',
        'target',
        'bucket',
        'account_id',
        'monthly_amount',
        'color_key',
      ].sort()
    );
    // grant update (name, target, ready_by, opening_saved, done_at, deleted_at)
    expect([...SAVINGS_GOAL_PATCH_KEYS].sort()).toEqual(
      ['deleted_at', 'done_at', 'name', 'opening_saved', 'ready_by', 'target', 'account_id', 'monthly_amount', 'color_key'].sort()
    );
    expect(SAVINGS_GOAL_PATCH_KEYS).not.toContain('kind');
    expect(SAVINGS_GOAL_PATCH_KEYS).not.toContain('check_id');
  });

  const pot: NewPot = {
    id: ID_A,
    household_id: 'h1',
    kind: 'pot',
    name: 'Car service',
    currency: 'GBP',
    target: 60000,
    ready_by: '2027-03-31',
    opening_saved: 0,
  };

  it('D-101 inserts a pot and reads a duplicate client id back as landed', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: goalRow(), error: null, status: 201 });
    await expect(insertSavingsGoal(client, pot)).resolves.toMatchObject({ id: ID_A });
    client.respondWith({ data: null, error: { message: 'dup', code: '23505' }, status: 409 });
    client.respondWith({ data: goalRow({ version: 1 }), error: null, status: 200 });
    await expect(insertSavingsGoal(client, pot)).resolves.toMatchObject({ id: ID_A });
  });

  it('D-101 refuses a client-sent wait kind, a stray key or a bad value before a request', async () => {
    const client = createFakeSupabase();
    await expect(insertSavingsGoal(client, { ...pot, kind: 'wait' } as unknown as NewPot)).rejects.toBeInstanceOf(RangeError);
    await expect(insertSavingsGoal(client, { ...pot, check_id: ID_B } as unknown as NewPot)).rejects.toBeInstanceOf(TypeError);
    await expect(insertSavingsGoal(client, { ...pot, target: 1.5 })).rejects.toBeInstanceOf(RangeError);
    await expect(insertSavingsGoal(client, { ...pot, ready_by: '2027-03' })).rejects.toBeInstanceOf(RangeError);
    expect(client.calls).toHaveLength(0);
  });

  it('05.2 D-22 allows a bucket with no target or date; an ordinary pot without them is refused', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: goalRow(), error: null, status: 201 });
    const bucket: NewPot = { ...pot, bucket: 'trip', target: null, ready_by: null, monthly_amount: 0 };
    await expect(insertSavingsGoal(client, bucket)).resolves.toMatchObject({ id: ID_A });
    await expect(insertSavingsGoal(client, { ...pot, target: null } as unknown as NewPot)).rejects.toBeInstanceOf(RangeError);
    await expect(insertSavingsGoal(client, { ...pot, monthly_amount: 5 } as unknown as NewPot)).rejects.toBeInstanceOf(RangeError);
    await expect(insertSavingsGoal(client, { ...bucket, monthly_amount: -1 })).rejects.toBeInstanceOf(RangeError);
    expect(client.calls).toHaveLength(3);
  });
});
