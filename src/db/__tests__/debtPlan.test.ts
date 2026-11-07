import { DbError, VersionConflictError } from '../errors';
import { recordDebtSale, saveDebtPlan, type DebtPlanSeries, type DebtSaleLeg } from '../debtPlan';
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
    expect(out).toEqual({ status: 'applied', seriesId: 's1', undoStepId: 'u1' });
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
    expect(out).toEqual({ status: 'applied', paidOff: true, stillOwed: 0, undoStepId: 'u1' });
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
