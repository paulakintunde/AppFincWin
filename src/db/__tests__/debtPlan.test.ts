import { DbError, VersionConflictError } from '../errors';
import { recordDebtOneOff, recordDebtSale, removeDebt, saveDebtPlan, type DebtPlanSeries, type DebtSaleLeg } from '../debtPlan';
import { createFakeSupabase } from './fakeSupabase';

const ok = (data: unknown) => ({ data, error: null, status: 200 });
const SERIES: DebtPlanSeries = { id: 's1', account_id: 'a1', anchor_date: '2026-11-15', time_zone: 'UTC', name: 'Extra on Auto loan', category_id: null };
const LEG = (id: string, amount: number): DebtSaleLeg => ({
  id,
  account_id: 'a1',
  amount,
  currency: 'USD',
  local_date: '2026-11-05',
  time_zone: 'UTC',
  name: 'Car sold',
});

describe('saveDebtPlan', () => {
  const base = { debtId: 'd1', expectedVersion: 2, order: 'balance', undoStep: { id: 'u1', name: 'Auto loan' } } as const;

  it('sends the contract keys; the undo step carries no ops', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok({ status: 'applied', series_id: 's1', undo_step_id: 'u1' }));
    const out = await saveDebtPlan(client, { ...base, extra: 5000, series: SERIES });
    expect(out).toEqual({ status: 'applied', seriesId: 's1', undoStepId: 'u1', version: null });
    const [name, args] = client.calls.find((c) => c.method === 'rpc')?.args as [string, Record<string, unknown>];
    expect(name).toBe('save_debt_plan');
    expect(Object.keys(args).sort()).toEqual(['p_debt_id', 'p_expected_version', 'p_extra', 'p_order', 'p_series', 'p_undo_step']);
    expect(args.p_undo_step).toEqual({ id: 'u1', label_key: 'debtPlanSaved', label_params: { name: 'Auto loan' } });
  });

  it('extra 0 sends no series', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok({ status: 'applied', series_id: null, undo_step_id: 'u1' }));
    await saveDebtPlan(client, { ...base, extra: 0, series: SERIES });
    const [, args] = client.calls.find((c) => c.method === 'rpc')?.args as [string, Record<string, unknown>];
    expect(args.p_series).toBeNull();
    expect(args.p_extra).toBe(0);
  });

  it('refuses a bad extra or an extra without its record', async () => {
    const client = createFakeSupabase();
    await expect(saveDebtPlan(client, { ...base, extra: 12.5, series: SERIES })).rejects.toBeInstanceOf(RangeError);
    await expect(saveDebtPlan(client, { ...base, extra: -1, series: null })).rejects.toBeInstanceOf(RangeError);
    await expect(saveDebtPlan(client, { ...base, extra: 100, series: null })).rejects.toBeInstanceOf(RangeError);
    expect(client.calls.filter((c) => c.method === 'rpc')).toHaveLength(0);
  });

  it('conflict throws, already-applied is success, unknown status is a bad response', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok({ status: 'conflict' }));
    await expect(saveDebtPlan(client, { ...base, extra: 0, series: null })).rejects.toBeInstanceOf(VersionConflictError);
    client.respondWith(ok({ status: 'already-applied', series_id: null, undo_step_id: 'u1' }));
    await expect(saveDebtPlan(client, { ...base, extra: 0, series: null })).resolves.toMatchObject({ status: 'already-applied' });
    client.respondWith(ok({ status: 'weird' }));
    await expect(saveDebtPlan(client, { ...base, extra: 0, series: null })).rejects.toBeInstanceOf(DbError);
  });

  it('a transport error becomes a DbError', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'boom', code: '42501' }, status: 403 });
    await expect(saveDebtPlan(client, { ...base, extra: 0, series: null })).rejects.toBeInstanceOf(DbError);
  });
});

describe('recordDebtSale', () => {
  const base = { debtId: 'd1', expectedVersion: 2, undoStep: { id: 'u1', name: 'Auto loan' } } as const;

  it('one rpc call carries both legs and returns the payoff result', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok({ status: 'applied', paid_off: true, still_owed: 0, undo_step_id: 'u1' }));
    const out = await recordDebtSale(client, { ...base, sale: LEG('t1', 1000000), payment: LEG('t2', 842000) });
    expect(out).toEqual({ status: 'applied', paidOff: true, stillOwed: 0, undoStepId: 'u1', version: null });
    const calls = client.calls.filter((c) => c.method === 'rpc');
    expect(calls).toHaveLength(1);
    const [name, args] = calls[0]?.args as [string, Record<string, any>];
    expect(name).toBe('record_debt_sale');
    expect(args.p_sale.id).toBe('t1');
    expect(args.p_payment.id).toBe('t2');
    expect(args.p_undo_step).toEqual({ id: 'u1', label_key: 'debtSaleRecorded', label_params: { name: 'Auto loan' } });
  });

  it('already-applied has no result figures; conflict throws; bad amounts are refused', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok({ status: 'already-applied', undo_step_id: 'u1' }));
    await expect(recordDebtSale(client, { ...base, sale: LEG('t1', 5), payment: null })).resolves.toMatchObject({
      status: 'already-applied',
      paidOff: null,
      stillOwed: null,
    });
    client.respondWith(ok({ status: 'conflict' }));
    await expect(recordDebtSale(client, { ...base, sale: LEG('t1', 5), payment: null })).rejects.toBeInstanceOf(VersionConflictError);
    await expect(recordDebtSale(client, { ...base, sale: LEG('t1', 0), payment: null })).rejects.toBeInstanceOf(RangeError);
    await expect(recordDebtSale(client, { ...base, sale: LEG('t1', 5), payment: LEG('t2', 1.5) })).rejects.toBeInstanceOf(RangeError);
  });
});

describe('recordDebtOneOff (06-30, D-33)', () => {
  const base = { debtId: 'd1', undoStep: { id: 'u1', name: 'Auto loan' } } as const;

  it('one rpc call with the contract keys; applied maps to the transaction and undo step ids', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok({ status: 'applied', transaction_id: 't1', undo_step_id: 'u1' }));
    const out = await recordDebtOneOff(client, { ...base, payment: LEG('t1', 100000) });
    expect(out).toEqual({ status: 'applied', transactionId: 't1', undoStepId: 'u1' });
    const calls = client.calls.filter((c) => c.method === 'rpc');
    expect(calls).toHaveLength(1);
    const [name, args] = calls[0]?.args as [string, Record<string, any>];
    expect(name).toBe('record_debt_one_off');
    expect(Object.keys(args).sort()).toEqual(['p_debt_id', 'p_payment', 'p_undo_step']);
    expect(args.p_debt_id).toBe('d1');
    expect(args.p_payment).toMatchObject({ id: 't1', account_id: 'a1', amount: 100000, currency: 'USD', local_date: '2026-11-05' });
    expect(args.p_undo_step).toEqual({ id: 'u1', label_key: 'debtOneOffRecorded', label_params: { name: 'Auto loan' } });
  });

  it('already-applied has no transaction id; an unknown status or a missing step id is a bad response', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok({ status: 'already-applied', undo_step_id: 'u1' }));
    await expect(recordDebtOneOff(client, { ...base, payment: LEG('t1', 5) })).resolves.toEqual({
      status: 'already-applied',
      transactionId: null,
      undoStepId: 'u1',
    });
    client.respondWith(ok({ status: 'conflict' }));
    await expect(recordDebtOneOff(client, { ...base, payment: LEG('t1', 5) })).rejects.toBeInstanceOf(DbError);
    client.respondWith(ok({ status: 'applied', transaction_id: 't1' }));
    await expect(recordDebtOneOff(client, { ...base, payment: LEG('t1', 5) })).rejects.toBeInstanceOf(DbError);
  });

  it('refuses a zero, fractional or oversized amount before any call', async () => {
    const client = createFakeSupabase();
    await expect(recordDebtOneOff(client, { ...base, payment: LEG('t1', 0) })).rejects.toBeInstanceOf(RangeError);
    await expect(recordDebtOneOff(client, { ...base, payment: LEG('t1', 1.5) })).rejects.toBeInstanceOf(RangeError);
    await expect(recordDebtOneOff(client, { ...base, payment: LEG('t1', 10_000_000_000_001) })).rejects.toBeInstanceOf(RangeError);
    expect(client.calls.filter((c) => c.method === 'rpc')).toHaveLength(0);
  });

  it('a transport error becomes a DbError', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'boom', code: '22023' }, status: 400 });
    await expect(recordDebtOneOff(client, { ...base, payment: LEG('t1', 5) })).rejects.toBeInstanceOf(DbError);
  });
});

describe('06 review: versions and remove_debt', () => {
  it('save_debt_plan and record_debt_sale hand back the debt version (P3-WR-01)', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok({ status: 'applied', series_id: 's1', undo_step_id: 'u1', version: 5 }));
    const plan = await saveDebtPlan(client, { debtId: 'd1', expectedVersion: 4, extra: 5000, order: null, series: SERIES, undoStep: { id: 'u1', name: 'x' } });
    expect(plan.version).toBe(5);
    const c2 = createFakeSupabase();
    c2.respondWith(ok({ status: 'applied', paid_off: false, still_owed: 10, undo_step_id: 'u2', version: 4 }));
    const sale = await recordDebtSale(c2, { debtId: 'd1', expectedVersion: 4, sale: LEG('a', 5), payment: null, undoStep: { id: 'u2', name: 'x' } });
    expect(sale.version).toBe(4);
  });

  it('removeDebt sends the contract keys and parses the result; a conflict throws', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok({ status: 'applied', debt_id: 'd1', version: 3, undo_step_id: 'u1' }));
    const out = await removeDebt(client, { debtId: 'd1', expectedVersion: 2, undoStep: { id: 'u1', name: 'Auto loan' } });
    expect(out).toEqual({ status: 'applied', version: 3, undoStepId: 'u1' });
    const [name, args] = client.calls.find((c) => c.method === 'rpc')?.args as [string, Record<string, unknown>];
    expect(name).toBe('remove_debt');
    expect(args).toEqual({ p_debt_id: 'd1', p_expected_version: 2, p_undo_step: { id: 'u1', label_key: 'debtRemoved', label_params: { name: 'Auto loan' } } });
    const c2 = createFakeSupabase();
    c2.respondWith(ok({ status: 'conflict' }));
    await expect(removeDebt(c2, { debtId: 'd1', expectedVersion: 2, undoStep: { id: 'u1', name: 'x' } })).rejects.toBeInstanceOf(VersionConflictError);
  });
});
