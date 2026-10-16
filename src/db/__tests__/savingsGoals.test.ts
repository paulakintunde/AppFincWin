import { NotFoundError, VersionConflictError } from '../errors';
import * as goals from '../savingsGoals';
import { fetchGoalLines, fetchSavingsGoals, updateSavingsGoal, type SavingsGoalRow } from '../savingsGoals';
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
    is_sample: false,
    deleted_at: null,
    version: 1,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

describe('savingsGoals module surface', () => {
  it('exports no insert function', () => {
    expect(Object.keys(goals).filter((k) => /^insert/i.test(k))).toEqual([]);
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
  it('refuses any key other than deleted_at before a request', async () => {
    const client = createFakeSupabase();
    await expect(updateSavingsGoal(client, ID_A, 1, { name: 'x' } as unknown as { deleted_at: string })).rejects.toBeInstanceOf(TypeError);
    expect(client.calls).toHaveLength(0);
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
