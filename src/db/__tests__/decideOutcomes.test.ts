import { DbError } from '../errors';
import { recordDecideGo, recordDecideOutcome, type DecideGoInput } from '../decideOutcomes';
import type { NewRecurringSeries } from '../recurringSeries';
import type { NewTransaction } from '../rows';
import { createFakeSupabase } from './fakeSupabase';

const SERIES = { id: 's1' } as unknown as NewRecurringSeries;

const txRow = (id: string, over: Partial<NewTransaction> = {}): NewTransaction => ({
  id,
  household_id: 'h1',
  account_id: 'a1',
  original_amount: -1000,
  original_currency: 'USD',
  local_date: '2026-10-21',
  time_zone: 'UTC',
  note: null,
  name: 'Laptop',
  category_id: null,
  status: 'pending',
  ...over,
});

function goInput(overrides: Partial<DecideGoInput> = {}): DecideGoInput {
  return {
    checkId: 'k1',
    rows: [txRow('r1', { one_off: true }), txRow('r2')],
    series: [SERIES],
    endSeries: [{ id: 'e1', expected_version: 1, end_date: '2026-10-31' }],
    debt: null,
    decision: {
      verdict: 'fits',
      estimate_day_one: 1000,
      estimate_monthly: 200,
      estimate_monthly_payment: 150,
      estimate_running: 50,
      broke_line: false,
      cooling_off: true,
      row_roles: ['day_one', 'day_one'],
      series_roles: ['payment'],
    },
    undo: { id: 'u1', labelKey: 'decisionWritten', labelParams: { name: 'Laptop' } },
    ...overrides,
  };
}

const OK = { data: { status: 'applied', undo_step_id: 'u1' }, error: null, status: 200 };

describe('recordDecideGo', () => {
  it('sends the contract payload with snake_case keys', async () => {
    const client = createFakeSupabase();
    client.respondWith(OK);
    await expect(recordDecideGo(client, goInput())).resolves.toEqual({ status: 'applied', undoStepId: 'u1' });
    const [name, args] = client.calls.find((c) => c.method === 'rpc')?.args as [string, Record<string, unknown>];
    expect(name).toBe('record_decide_go');
    expect(Object.keys(args).sort()).toEqual(
      ['p_check_id', 'p_rows', 'p_series', 'p_end_series', 'p_debt', 'p_decision', 'p_undo_step'].sort()
    );
    // WR-A02: the rows travel in the same call (the server inserts them in the decision's transaction).
    expect(args.p_rows).toEqual([txRow('r1', { one_off: true }), txRow('r2')]);
    expect(args.p_undo_step).toEqual({ id: 'u1', label_key: 'decisionWritten', label_params: { name: 'Laptop' } });
    expect(args.p_decision).toMatchObject({
      verdict: 'fits',
      cooling_off: true,
      row_roles: ['day_one', 'day_one'],
      series_roles: ['payment'],
      estimate_running: 50,
    });
  });

  it('rejects out-of-bounds input before any request', async () => {
    const client = createFakeSupabase();
    const many = (n: number) => Array.from({ length: n }, (_, i) => txRow(`r${i}`));
    const dec = goInput().decision;
    await expect(
      recordDecideGo(client, goInput({ rows: many(61), decision: { ...dec, row_roles: Array(61).fill('day_one') } }))
    ).rejects.toBeInstanceOf(RangeError);
    await expect(
      recordDecideGo(client, goInput({ series: Array(25).fill(SERIES), decision: { ...dec, series_roles: Array(25).fill('payment') } }))
    ).rejects.toBeInstanceOf(RangeError);
    await expect(
      recordDecideGo(client, goInput({ endSeries: Array(25).fill({ id: 'e', expected_version: 1, end_date: '2026-10-31' }) }))
    ).rejects.toBeInstanceOf(RangeError);
    await expect(
      recordDecideGo(client, goInput({ rows: [], series: [], decision: { ...dec, row_roles: [], series_roles: [] } }))
    ).rejects.toBeInstanceOf(RangeError);
    expect(client.calls).toHaveLength(0);
  });

  it('refuses a row key the server would refuse, before any request', async () => {
    const client = createFakeSupabase();
    const sneaky = { ...txRow('r1'), goal_id: 'g1' };
    await expect(recordDecideGo(client, goInput({ rows: [sneaky, txRow('r2')] }))).rejects.toBeInstanceOf(TypeError);
    expect(client.calls).toHaveLength(0);
  });

  it('rejects roles that do not match the writes', async () => {
    const client = createFakeSupabase();
    const dec = goInput().decision;
    await expect(recordDecideGo(client, goInput({ decision: { ...dec, row_roles: ['day_one'] } }))).rejects.toBeInstanceOf(RangeError);
    await expect(recordDecideGo(client, goInput({ decision: { ...dec, series_roles: [] } }))).rejects.toBeInstanceOf(RangeError);
    expect(client.calls).toHaveLength(0);
  });

  it('rejects an unrecognised response', async () => {
    for (const data of [null, { status: 'nope', undo_step_id: 'u1' }, { status: 'applied' }, { status: 'applied', undo_step_id: '' }]) {
      const client = createFakeSupabase();
      client.respondWith({ data, error: null, status: 200 });
      const err = await recordDecideGo(client, goInput()).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(DbError);
      expect((err as DbError).code).toBe('bad-response');
    }
  });

  it('accepts already-applied', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { status: 'already-applied', undo_step_id: 'u1' }, error: null, status: 200 });
    await expect(recordDecideGo(client, goInput())).resolves.toEqual({ status: 'already-applied', undoStepId: 'u1' });
  });

  it('maps an RPC error', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'x', code: '22023' }, status: 400 });
    await expect(recordDecideGo(client, goInput())).rejects.toMatchObject({ code: '22023' });
  });
});

describe('recordDecideOutcome', () => {
  it('sends a wait outcome without the outcome key in p_decision', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { status: 'applied' }, error: null, status: 200 });
    const goal = { id: 'g1', name: 'Laptop', currency: 'GBP', target: 90000 };
    await expect(
      recordDecideOutcome(client, 'k1', {
        outcome: 'wait',
        verdict: 'adjust',
        wait_monthly: 15000,
        ready_by: '2027-03-01',
        cooling_off: false,
        goal,
      })
    ).resolves.toEqual({ status: 'applied' });
    const [name, args] = client.calls.find((c) => c.method === 'rpc')?.args as [string, Record<string, unknown>];
    expect(name).toBe('record_decide_outcome');
    expect(args).toEqual({
      p_check_id: 'k1',
      p_outcome: 'wait',
      p_decision: { verdict: 'adjust', wait_monthly: 15000, ready_by: '2027-03-01', cooling_off: false, goal },
    });
  });

  it('sends a pass outcome', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { status: 'already-applied' }, error: null, status: 200 });
    await expect(recordDecideOutcome(client, 'k1', { outcome: 'pass', verdict: 'no', cooling_off: true })).resolves.toEqual({
      status: 'already-applied',
    });
    const [, args] = client.calls.find((c) => c.method === 'rpc')?.args as [string, Record<string, unknown>];
    expect(args).toEqual({ p_check_id: 'k1', p_outcome: 'pass', p_decision: { verdict: 'no', cooling_off: true } });
  });

  it('rejects a goal target below 1 before any request', async () => {
    const client = createFakeSupabase();
    await expect(
      recordDecideOutcome(client, 'k1', {
        outcome: 'wait',
        verdict: 'adjust',
        wait_monthly: 0,
        ready_by: null,
        cooling_off: false,
        goal: { id: 'g1', name: 'x', currency: 'GBP', target: 0 },
      })
    ).rejects.toBeInstanceOf(RangeError);
    expect(client.calls).toHaveLength(0);
  });

  it('rejects an unrecognised status', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { status: 'weird' }, error: null, status: 200 });
    await expect(recordDecideOutcome(client, 'k1', { outcome: 'pass', verdict: 'no', cooling_off: false })).rejects.toBeInstanceOf(
      DbError
    );
  });
});
