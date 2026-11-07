import { buildStep, inverseOfInserts } from '@/engine/undo';
import { DbError, VersionConflictError } from '../errors';
import { confirmGoalContribution, saveGoalPlan, setSafetyNet, type GoalPlanSeries } from '../goalPlan';
import { createFakeSupabase } from './fakeSupabase';

const STEP = buildStep('u1', 'goalMade', { name: 'Lisbon' }, inverseOfInserts('savings_goals', [{ id: 'g1', version: 1 }]));
const SERIES: GoalPlanSeries = {
  id: 's1',
  account_id: 'a1',
  amount: 5000,
  anchor_date: '2026-11-16',
  time_zone: 'UTC',
  name: 'Lisbon',
  category_id: null,
};
const ok = (data: unknown) => ({ data, error: null, status: 200 });

describe('saveGoalPlan', () => {
  it('sends the contract keys and returns the parsed result', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok({ status: 'applied', goal_id: 'g1', goal_version: 1, series_id: 's1', series_version: 2, undo_step_id: 'u1' }));
    const out = await saveGoalPlan(client, { goal: { id: 'g1', name: 'Lisbon', locked: true }, expectedVersion: null, series: SERIES, undoStep: STEP });
    expect(out).toEqual({ status: 'applied', goalId: 'g1', goalVersion: 1, seriesId: 's1', seriesVersion: 2, undoStepId: 'u1' });
    const [name, args] = client.calls.find((c) => c.method === 'rpc')?.args as [string, Record<string, unknown>];
    expect(name).toBe('save_goal_plan');
    expect(Object.keys(args).sort()).toEqual(['p_expected_version', 'p_goal', 'p_series', 'p_undo_step']);
    expect(args.p_expected_version).toBeNull();
    expect(args.p_undo_step).toMatchObject({ id: 'u1', label_key: 'goalMade', label_params: { name: 'Lisbon' } });
  });

  it('already-applied is success', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok({ status: 'already-applied', undo_step_id: 'u1' }));
    await expect(saveGoalPlan(client, { goal: { id: 'g1' }, expectedVersion: 3, series: null, undoStep: STEP })).resolves.toMatchObject({
      status: 'already-applied',
      goalId: null,
    });
  });

  it('conflict throws VersionConflictError', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok({ status: 'conflict' }));
    await expect(saveGoalPlan(client, { goal: { id: 'g1' }, expectedVersion: 3, series: null, undoStep: STEP })).rejects.toBeInstanceOf(
      VersionConflictError
    );
  });

  it('a transport error becomes a DbError', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'boom', code: '42501' }, status: 403 });
    await expect(saveGoalPlan(client, { goal: { id: 'g1' }, expectedVersion: null, series: null, undoStep: STEP })).rejects.toBeInstanceOf(DbError);
  });

  it('refuses an unknown goal field and a non-positive monthly amount before any call', async () => {
    const client = createFakeSupabase();
    await expect(
      saveGoalPlan(client, { goal: { id: 'g1', version: 9 } as never, expectedVersion: null, series: null, undoStep: STEP })
    ).rejects.toThrow(TypeError);
    await expect(
      saveGoalPlan(client, { goal: { id: 'g1' }, expectedVersion: null, series: { ...SERIES, amount: 0 }, undoStep: STEP })
    ).rejects.toThrow(RangeError);
    expect(client.calls).toHaveLength(0);
  });

  it('an unrecognised status is a bad response', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok({ status: 'wat' }));
    await expect(saveGoalPlan(client, { goal: { id: 'g1' }, expectedVersion: null, series: null, undoStep: STEP })).rejects.toBeInstanceOf(DbError);
    client.respondWith(ok(null));
    await expect(saveGoalPlan(client, { goal: { id: 'g1' }, expectedVersion: null, series: null, undoStep: STEP })).rejects.toBeInstanceOf(DbError);
    client.respondWith(ok({ status: 'applied' }));
    await expect(saveGoalPlan(client, { goal: { id: 'g1' }, expectedVersion: null, series: null, undoStep: STEP })).rejects.toBeInstanceOf(DbError);
  });
});

describe('confirmGoalContribution', () => {
  const CONFIRM_STEP = buildStep('u2', 'goalContributionConfirmed', { name: 'Lisbon' }, inverseOfInserts('transactions', [{ id: 'l1', version: 1 }]));
  it('sends the in-leg and parses the result', async () => {
    const client = createFakeSupabase();
    client.respondWith(
      ok({ status: 'applied', transaction_version: 2, in_leg_id: 'l2', in_leg_version: 1, transfer_id: 't1', undo_step_id: 'u2' })
    );
    const out = await confirmGoalContribution(client, {
      transactionId: 'l1',
      expectedVersion: 1,
      inLeg: { id: 'l2', transfer_id: 't1' },
      undoStep: CONFIRM_STEP,
    });
    expect(out).toEqual({ status: 'applied', transactionVersion: 2, inLegId: 'l2', inLegVersion: 1, undoStepId: 'u2' });
    const [name, args] = client.calls.find((c) => c.method === 'rpc')?.args as [string, Record<string, unknown>];
    expect(name).toBe('confirm_goal_contribution');
    expect(args).toMatchObject({ p_transaction_id: 'l1', p_expected_version: 1, p_in_leg: { id: 'l2', transfer_id: 't1' } });
  });

  it('already-applied is success; conflict throws', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok({ status: 'already-applied', undo_step_id: 'u2' }));
    await expect(
      confirmGoalContribution(client, { transactionId: 'l1', expectedVersion: 1, inLeg: null, undoStep: CONFIRM_STEP })
    ).resolves.toMatchObject({ status: 'already-applied', inLegId: null });
    client.respondWith(ok({ status: 'conflict' }));
    await expect(
      confirmGoalContribution(client, { transactionId: 'l1', expectedVersion: 1, inLeg: null, undoStep: CONFIRM_STEP })
    ).rejects.toBeInstanceOf(VersionConflictError);
  });

  it('a transport error and a bad response are DbErrors', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'x', code: '22023' }, status: 400 });
    await expect(
      confirmGoalContribution(client, { transactionId: 'l1', expectedVersion: 1, inLeg: null, undoStep: CONFIRM_STEP })
    ).rejects.toBeInstanceOf(DbError);
    client.respondWith(ok({ status: 'wat' }));
    await expect(
      confirmGoalContribution(client, { transactionId: 'l1', expectedVersion: 1, inLeg: null, undoStep: CONFIRM_STEP })
    ).rejects.toBeInstanceOf(DbError);
  });
});

describe('setSafetyNet', () => {
  const input = { goalId: 'g2', expectedVersions: { g2: 3, g1: 5 }, undoStep: { id: 'u3', name: 'Lisbon' } };
  it('calls set_safety_net with the server-built step label', async () => {
    const client = createFakeSupabase();
    client.respondWith(
      ok({ status: 'applied', goal_id: 'g2', previous_goal_id: 'g1', goal_version: 4, previous_version: 6, undo_step_id: 'u3' })
    );
    const out = await setSafetyNet(client, input);
    expect(out).toEqual({ status: 'applied', goalId: 'g2', previousGoalId: 'g1', goalVersion: 4, previousVersion: 6, undoStepId: 'u3' });
    const [name, args] = client.calls.find((c) => c.method === 'rpc')?.args as [string, Record<string, unknown>];
    expect(name).toBe('set_safety_net');
    expect(args).toEqual({
      p_goal_id: 'g2',
      p_expected_versions: { g2: 3, g1: 5 },
      p_undo_step: { id: 'u3', label_key: 'safetyNetChanged', label_params: { name: 'Lisbon' } },
    });
  });

  it('unchanged and already-applied are success; conflict throws', async () => {
    const client = createFakeSupabase();
    client.respondWith(ok({ status: 'unchanged', goal_id: 'g2' }));
    await expect(setSafetyNet(client, input)).resolves.toMatchObject({ status: 'unchanged', undoStepId: null });
    client.respondWith(ok({ status: 'already-applied', undo_step_id: 'u3' }));
    await expect(setSafetyNet(client, input)).resolves.toMatchObject({ status: 'already-applied' });
    client.respondWith(ok({ status: 'conflict' }));
    await expect(setSafetyNet(client, input)).rejects.toBeInstanceOf(VersionConflictError);
  });

  it('a transport error and a bad response are DbErrors', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'x', code: '42501' }, status: 403 });
    await expect(setSafetyNet(client, input)).rejects.toBeInstanceOf(DbError);
    client.respondWith(ok({ status: 'wat' }));
    await expect(setSafetyNet(client, input)).rejects.toBeInstanceOf(DbError);
  });
});
