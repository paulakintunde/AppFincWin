import { NotFoundError, VersionConflictError } from '../errors';
import {
  DECIDE_ANSWER_INSERT_KEYS,
  DECIDE_ANSWER_PATCH_KEYS,
  fetchDecideAnswers,
  insertDecideAnswer,
  updateDecideAnswer,
  type NewDecideAnswer,
} from '../decideAnswers';
import {
  DISMISSAL_INSERT_KEYS,
  DISMISSAL_PATCH_KEYS,
  fetchDismissals,
  insertDismissal,
  updateDismissal,
} from '../recurringDismissals';
import {
  PAYER_PROMPT_INSERT_KEYS,
  PAYER_PROMPT_PATCH_KEYS,
  fetchPayerPrompts,
  insertPayerPrompt,
  updatePayerPrompt,
} from '../incomePayerPrompts';
import { createFakeSupabase } from './fakeSupabase';

const ID = '11111111-1111-4111-8111-111111111111';
const dup = { message: 'duplicate', code: '23505' };

describe('grant mirrors', () => {
  it('keys equal the 05.2-03 grants', () => {
    expect([...DISMISSAL_INSERT_KEYS].sort()).toEqual(['direction', 'household_id', 'id', 'payee_key']);
    expect([...DISMISSAL_PATCH_KEYS]).toEqual(['deleted_at']);
    expect([...PAYER_PROMPT_INSERT_KEYS].sort()).toEqual(
      ['apply_to_future', 'counts_as', 'household_id', 'id', 'income_kind', 'payer_key']
    );
    expect([...PAYER_PROMPT_PATCH_KEYS].sort()).toEqual(['apply_to_future', 'counts_as', 'deleted_at', 'income_kind']);
    expect([...DECIDE_ANSWER_INSERT_KEYS].sort()).toEqual(
      ['amount', 'bool_value', 'check_id', 'household_id', 'id', 'key', 'kind', 'on_date']
    );
    expect([...DECIDE_ANSWER_PATCH_KEYS].sort()).toEqual(['amount', 'bool_value', 'deleted_at', 'on_date']);
  });
});

describe('recurring dismissals', () => {
  it('fetches live rows of the household', async () => {
    const c = createFakeSupabase();
    c.respondWith({ data: [{ id: ID }], error: null, status: 200 });
    await expect(fetchDismissals(c, 'h1')).resolves.toEqual([{ id: ID }]);
    expect(c.calls.find((x) => x.method === 'eq')?.args).toEqual(['household_id', 'h1']);
    expect(c.calls.find((x) => x.method === 'is')?.args).toEqual(['deleted_at', null]);
    c.respondWith({ data: null, error: null, status: 200 });
    await expect(fetchDismissals(c, 'h1')).resolves.toEqual([]);
    c.respondWith({ data: null, error: { message: 'x', code: '42501' }, status: 403 });
    await expect(fetchDismissals(c, 'h1')).rejects.toBeDefined();
  });

  it('inserts, reads back on 23505, and rethrows otherwise', async () => {
    const row = { id: ID, household_id: 'h1', payee_key: 'netflix', direction: 'out' as const };
    const c = createFakeSupabase();
    c.respondWith({ data: { id: ID }, error: null, status: 201 });
    await expect(insertDismissal(c, row)).resolves.toEqual({ row: { id: ID }, own: true });
    c.respondWith({ data: null, error: dup, status: 409 });
    c.respondWith({ data: { id: ID, version: 1 }, error: null, status: 200 });
    await expect(insertDismissal(c, row)).resolves.toEqual({ row: { id: ID, version: 1 }, own: true });
    c.respondWith({ data: null, error: dup, status: 409 });
    c.respondWith({ data: null, error: null, status: 200 });
    c.respondWith({ data: null, error: null, status: 200 });
    await expect(insertDismissal(c, row)).rejects.toBeDefined();
    c.respondWith({ data: null, error: { message: 'x', code: '42501' }, status: 403 });
    await expect(insertDismissal(c, row)).rejects.toBeDefined();
    await expect(insertDismissal(c, { ...row, created_by: 'u' } as never)).rejects.toBeInstanceOf(TypeError);
  });

  it('updates with a version check and classifies failures', async () => {
    const c = createFakeSupabase();
    c.respondWith({ data: [{ id: ID, version: 2 }], error: null, status: 200 });
    await expect(updateDismissal(c, ID, 1, { deleted_at: 'now' })).resolves.toMatchObject({ version: 2 });
    expect(c.calls.filter((x) => x.method === 'eq').map((x) => x.args)).toContainEqual(['version', 1]);
    c.respondWith({ data: null, error: { message: 'x', code: '42501' }, status: 403 });
    await expect(updateDismissal(c, ID, 1, { deleted_at: null })).rejects.toBeDefined();
    c.respondWith({ data: [], error: null, status: 200 });
    c.respondWith({ data: { id: ID, version: 4 }, error: null, status: 200 });
    await expect(updateDismissal(c, ID, 1, { deleted_at: 'now' })).rejects.toBeInstanceOf(VersionConflictError);
    c.respondWith({ data: null, error: null, status: 200 });
    c.respondWith({ data: null, error: null, status: 200 });
    await expect(updateDismissal(c, ID, 1, { deleted_at: 'now' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateDismissal(c, ID, 1, { payee_key: 'x' } as never)).rejects.toBeInstanceOf(TypeError);
  });
});

describe('income payer prompts', () => {
  const row = {
    id: ID,
    household_id: 'h1',
    payer_key: 'acme',
    income_kind: 'salary',
    counts_as: 'available' as const,
    apply_to_future: true,
  };

  it('fetches live rows', async () => {
    const c = createFakeSupabase();
    c.respondWith({ data: [row], error: null, status: 200 });
    await expect(fetchPayerPrompts(c, 'h1')).resolves.toEqual([row]);
    expect(c.calls.find((x) => x.method === 'is')?.args).toEqual(['deleted_at', null]);
    c.respondWith({ data: null, error: null, status: 200 });
    await expect(fetchPayerPrompts(c, 'h1')).resolves.toEqual([]);
    c.respondWith({ data: null, error: { message: 'x', code: '42501' }, status: 403 });
    await expect(fetchPayerPrompts(c, 'h1')).rejects.toBeDefined();
  });

  it('inserts replay-safely', async () => {
    const c = createFakeSupabase();
    c.respondWith({ data: row, error: null, status: 201 });
    await expect(insertPayerPrompt(c, row)).resolves.toEqual(row);
    c.respondWith({ data: null, error: dup, status: 409 });
    c.respondWith({ data: row, error: null, status: 200 });
    await expect(insertPayerPrompt(c, row)).resolves.toEqual(row);
    c.respondWith({ data: null, error: dup, status: 409 });
    c.respondWith({ data: null, error: null, status: 200 });
    await expect(insertPayerPrompt(c, row)).rejects.toBeDefined();
    c.respondWith({ data: null, error: { message: 'x', code: '42501' }, status: 403 });
    await expect(insertPayerPrompt(c, row)).rejects.toBeDefined();
    await expect(insertPayerPrompt(c, { ...row, version: 3 } as never)).rejects.toBeInstanceOf(TypeError);
  });

  it('updates with a version check', async () => {
    const c = createFakeSupabase();
    c.respondWith({ data: [{ ...row, version: 2 }], error: null, status: 200 });
    await expect(updatePayerPrompt(c, ID, 1, { counts_as: 'kept' })).resolves.toMatchObject({ version: 2 });
    c.respondWith({ data: null, error: { message: 'x', code: '42501' }, status: 403 });
    await expect(updatePayerPrompt(c, ID, 1, { counts_as: 'kept' })).rejects.toBeDefined();
    c.respondWith({ data: [], error: null, status: 200 });
    c.respondWith({ data: { ...row, version: 5 }, error: null, status: 200 });
    await expect(updatePayerPrompt(c, ID, 1, { counts_as: 'kept' })).rejects.toBeInstanceOf(VersionConflictError);
    c.respondWith({ data: [], error: null, status: 200 });
    c.respondWith({ data: null, error: null, status: 200 });
    await expect(updatePayerPrompt(c, ID, 1, { counts_as: 'kept' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(updatePayerPrompt(c, ID, 1, { payer_key: 'x' } as never)).rejects.toBeInstanceOf(TypeError);
  });
});

describe('decide answers', () => {
  const row: NewDecideAnswer = {
    id: ID,
    household_id: 'h1',
    kind: 'expected_income',
    key: '2026-11',
    amount: 250000,
    bool_value: null,
    on_date: '2026-11-25',
    check_id: null,
  };

  it('fetches this user\'s live rows', async () => {
    const c = createFakeSupabase();
    c.respondWith({ data: [row], error: null, status: 200 });
    await expect(fetchDecideAnswers(c, 'u1', 'h1')).resolves.toEqual([row]);
    const eqs = c.calls.filter((x) => x.method === 'eq').map((x) => x.args);
    expect(eqs).toEqual([
      ['household_id', 'h1'],
      ['created_by', 'u1'],
    ]);
    expect(c.calls.find((x) => x.method === 'is')?.args).toEqual(['deleted_at', null]);
    c.respondWith({ data: null, error: null, status: 200 });
    await expect(fetchDecideAnswers(c, 'u1', 'h1')).resolves.toEqual([]);
    c.respondWith({ data: null, error: { message: 'x', code: '42501' }, status: 403 });
    await expect(fetchDecideAnswers(c, 'u1', 'h1')).rejects.toBeDefined();
  });

  it('inserts replay-safely', async () => {
    const c = createFakeSupabase();
    c.respondWith({ data: row, error: null, status: 201 });
    await expect(insertDecideAnswer(c, row)).resolves.toEqual(row);
    c.respondWith({ data: null, error: dup, status: 409 });
    c.respondWith({ data: row, error: null, status: 200 });
    await expect(insertDecideAnswer(c, row)).resolves.toEqual(row);
    c.respondWith({ data: null, error: dup, status: 409 });
    c.respondWith({ data: null, error: null, status: 200 });
    await expect(insertDecideAnswer(c, row)).rejects.toBeDefined();
    c.respondWith({ data: null, error: { message: 'x', code: '42501' }, status: 403 });
    await expect(insertDecideAnswer(c, row)).rejects.toBeDefined();
    await expect(insertDecideAnswer(c, { ...row, created_by: 'u2' } as never)).rejects.toBeInstanceOf(TypeError);
  });

  it('updates with a version check', async () => {
    const c = createFakeSupabase();
    c.respondWith({ data: [{ ...row, version: 2 }], error: null, status: 200 });
    await expect(updateDecideAnswer(c, ID, 1, { amount: 1 })).resolves.toMatchObject({ version: 2 });
    c.respondWith({ data: null, error: { message: 'x', code: '42501' }, status: 403 });
    await expect(updateDecideAnswer(c, ID, 1, { amount: 1 })).rejects.toBeDefined();
    c.respondWith({ data: [], error: null, status: 200 });
    c.respondWith({ data: { ...row, version: 5 }, error: null, status: 200 });
    await expect(updateDecideAnswer(c, ID, 1, { amount: 1 })).rejects.toBeInstanceOf(VersionConflictError);
    c.respondWith({ data: [], error: null, status: 200 });
    c.respondWith({ data: null, error: null, status: 200 });
    await expect(updateDecideAnswer(c, ID, 1, { amount: 1 })).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateDecideAnswer(c, ID, 1, { kind: 'x' } as never)).rejects.toBeInstanceOf(TypeError);
  });
});
