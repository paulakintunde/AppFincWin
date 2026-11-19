// 09-25 (A2-W): the central plan guard's pure decisions.
import { mutationKeys } from '@/data/keys';
import {
  decidePlanSend,
  decidePlanWrite,
  guardPlanSend,
  guardPlanWrite,
  isPlanOpenWrite,
  PLAN_OPEN_MUTATION_KEYS,
  PlanWriteBlockedError,
  planLockVariant,
  setPlanWriteBlockedListener,
  setPlanWriteState,
  type PlanWriteState,
} from '../planWriteGuard';
import { classifySettledWriteError, classifyWriteError, shouldRetryWrite } from '../writeErrors';

const SAMPLE: PlanWriteState = { status: 'sample', writable: false, loading: false };
const LOCKED: PlanWriteState = { status: 'locked', writable: false, loading: false };
const TRIAL: PlanWriteState = { status: 'trial', writable: true, loading: false };
const LOADING: PlanWriteState = { status: 'sample', writable: false, loading: true };

const sameKey = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((p, i) => p === b[i]);
const ALL_KEYS = Object.values(mutationKeys) as readonly (readonly string[])[];

afterEach(() => {
  setPlanWriteState(null);
  setPlanWriteBlockedListener(null);
});

describe('planLockVariant', () => {
  it('is null while writable, while loading and when nothing is known', () => {
    expect(planLockVariant(null)).toBeNull();
    expect(planLockVariant(LOADING)).toBeNull();
    expect(planLockVariant(TRIAL)).toBeNull();
    expect(planLockVariant({ status: 'tester', writable: true, loading: false })).toBeNull();
  });

  it('names sample before a plan and locked for every other not-writable status', () => {
    expect(planLockVariant(SAMPLE)).toBe('sample');
    expect(planLockVariant(LOCKED)).toBe('locked');
    expect(planLockVariant({ status: 'grace', writable: false, loading: false })).toBe('locked');
  });
});

describe('decidePlanWrite', () => {
  it('blocks every queued write to a locked table in sample and in locked', () => {
    for (const key of ALL_KEYS) {
      if (PLAN_OPEN_MUTATION_KEYS.some((open) => sameKey(open, key))) continue;
      expect(decidePlanWrite(SAMPLE, { mutationKey: key })).toBe('sample');
      expect(decidePlanWrite(LOCKED, { mutationKey: key })).toBe('locked');
    }
  });

  it('allows every write while writable, while loading and with no plan view', () => {
    for (const key of ALL_KEYS) {
      expect(decidePlanWrite(TRIAL, { mutationKey: key })).toBe('allow');
      expect(decidePlanWrite(LOADING, { mutationKey: key })).toBe('allow');
      expect(decidePlanWrite(null, { mutationKey: key })).toBe('allow');
    }
  });

  it('the open list names only real keys, and each stays open in sample and locked', () => {
    for (const open of PLAN_OPEN_MUTATION_KEYS) {
      expect(ALL_KEYS.some((k) => sameKey(k, open))).toBe(true);
      expect(decidePlanWrite(SAMPLE, { mutationKey: open })).toBe('allow');
      expect(decidePlanWrite(LOCKED, { mutationKey: open })).toBe('allow');
    }
  });

  it('keeps the profile, setup and sample-data writes open', () => {
    for (const key of [
      mutationKeys.updateMoneyPrefs,
      mutationKeys.updateRegionSubdivision,
      mutationKeys.updateRecordPrefs,
      mutationKeys.saveUserSetup,
      mutationKeys.setFeatureSwitch,
      mutationKeys.replaceFeatureSwitches,
      mutationKeys.seedSamples,
      mutationKeys.clearSamples,
    ]) {
      expect(isPlanOpenWrite({ mutationKey: key })).toBe(true);
    }
  });

  it('blocks the screenshot writes: Decide settings, check edit and delete, pay details, setup, Grow and pay', () => {
    for (const key of [
      mutationKeys.updateDecideSettings,
      mutationKeys.editCheck,
      mutationKeys.updateDecideSetup,
      mutationKeys.confirmRegularCandidate,
      mutationKeys.patchSeriesAttributes,
      mutationKeys.setSafetyNet,
      mutationKeys.editTransaction,
      mutationKeys.editDebt,
      mutationKeys.saveDebtPlan,
      mutationKeys.editGoal,
      mutationKeys.editHolding,
      mutationKeys.addMonth,
    ]) {
      expect(decidePlanWrite(SAMPLE, { mutationKey: key })).toBe('sample');
    }
  });

  it('unkeyed online calls pass unless marked plan-locked', () => {
    expect(decidePlanWrite(SAMPLE, {})).toBe('allow');
    expect(decidePlanWrite(SAMPLE, { meta: { planLocked: true } })).toBe('sample');
    expect(decidePlanWrite(LOCKED, { meta: { planLocked: true } })).toBe('locked');
  });
});

describe('decidePlanSend (a write restored from disk)', () => {
  it('drops a locked-table write in sample, still sends it in locked (D-40 keeps it)', () => {
    expect(decidePlanSend(SAMPLE, { mutationKey: mutationKeys.editCheck })).toBe('sample');
    expect(decidePlanSend(LOCKED, { mutationKey: mutationKeys.editCheck })).toBe('allow');
    expect(decidePlanSend(SAMPLE, { mutationKey: mutationKeys.saveUserSetup })).toBe('allow');
    expect(decidePlanSend(LOADING, { mutationKey: mutationKeys.editCheck })).toBe('allow');
  });
});

describe('PlanWriteBlockedError', () => {
  it('classifies as discarded: never retried, never recorded as failed or locked', () => {
    const err = new PlanWriteBlockedError('sample');
    expect(classifyWriteError(err)).toBe('discarded');
    expect(classifySettledWriteError(err)).toBe('discarded');
    expect(shouldRetryWrite(0, err)).toBe(false);
  });
});

describe('guardPlanWrite / guardPlanSend wiring', () => {
  it('throws and tells the listener when blocked, and does nothing when allowed', () => {
    const listener = jest.fn();
    setPlanWriteBlockedListener(listener);
    setPlanWriteState(SAMPLE);
    expect(() => guardPlanWrite({ mutationKey: mutationKeys.editCheck })).toThrow(PlanWriteBlockedError);
    expect(listener).toHaveBeenCalledWith('sample');
    listener.mockClear();
    expect(() => guardPlanWrite({ mutationKey: mutationKeys.saveUserSetup })).not.toThrow();
    setPlanWriteState(TRIAL);
    expect(() => guardPlanWrite({ mutationKey: mutationKeys.editCheck })).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });

  it('a plan-silent write is blocked without the sheet', () => {
    const listener = jest.fn();
    setPlanWriteBlockedListener(listener);
    setPlanWriteState(LOCKED);
    expect(() => guardPlanWrite({ mutationKey: mutationKeys.editCheck, meta: { planSilent: true } })).toThrow(PlanWriteBlockedError);
    expect(listener).not.toHaveBeenCalled();
  });

  it('guardPlanSend refuses before calling the mutationFn in sample', async () => {
    const fn = jest.fn(async () => 'sent');
    const wrapped = guardPlanSend(mutationKeys.updateDecideSettings, fn);
    setPlanWriteState(SAMPLE);
    await expect(wrapped()).rejects.toBeInstanceOf(PlanWriteBlockedError);
    expect(fn).not.toHaveBeenCalled();
    setPlanWriteState(TRIAL);
    await expect(wrapped()).resolves.toBe('sent');
  });
});
