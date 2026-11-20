import type { UserSetup } from '@/db/userSetup';
import {
  applyOnboardingRecords,
  idOfVariables,
  queuedAddHasId,
  setupRecordId,
  type ApplyRecordsDeps,
  type SetupRecordKind,
} from '../applyOnboardingRecords';

jest.mock('expo-crypto', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeCrypto = require('crypto');
  return {
    randomUUID: () => nodeCrypto.randomUUID(),
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digestStringAsync: async (_algorithm: string, data: string) => nodeCrypto.createHash('sha256').update(data).digest('hex'),
  };
});

const USER = '11111111-2222-3333-4444-555555555555';
const HH = 'hh-1';

function setup(over: Partial<UserSetup> = {}): UserSetup {
  return {
    userId: USER,
    level: 2,
    levelSource: 'answers',
    answers: {
      cur: 'GBP',
      acct: { name: ' Main account ', balanceMinor: 125000 },
      save: { name: 'Holiday', targetMinor: 200000, perMonthMinor: 10000 },
    },
    resumeStep: null,
    completedAt: '2026-11-19T10:00:00Z',
    partnerVersion: false,
    existingCard: null,
    recordsAppliedAt: null,
    version: 3,
    ...over,
  };
}

/** A fake world: rows the server has and adds queued in the mutation cache both count as existing. */
function world(existing: Partial<Record<SetupRecordKind, boolean>> = {}) {
  const made = new Set<string>();
  const calls = { addAccount: jest.fn(), addGoal: jest.fn(), saveUserSetup: jest.fn() };
  let current: UserSetup | null = setup();
  const ids: Record<SetupRecordKind, string> = { account: '', goal: '' };
  const deps = (): ApplyRecordsDeps => ({
    plan: { writable: true, loading: false, householdId: HH },
    setup: current,
    userId: USER,
    homeCurrency: 'USD',
    recordExists: async (kind, id) => {
      ids[kind] = id;
      return existing[kind] === true || made.has(id);
    },
    addAccount: (vars) => {
      calls.addAccount(vars);
      made.add(vars.row.id);
    },
    addGoal: (input) => {
      calls.addGoal(input);
      if (input.existing === undefined && input.id !== undefined) made.add(input.id);
    },
    saveUserSetup: (patch) => {
      calls.saveUserSetup(patch);
      current = { ...(current as UserSetup), ...patch };
    },
  });
  return { deps, calls, ids, setSetup: (s: UserSetup | null) => (current = s) };
}

describe('setupRecordId', () => {
  it('same inputs give the same UUID-shaped id; account and goal differ', async () => {
    const a1 = await setupRecordId(USER, 'account');
    const a2 = await setupRecordId(USER, 'account');
    const g = await setupRecordId(USER, 'goal');
    expect(a1).toBe(a2);
    expect(a1).not.toBe(g);
    for (const id of [a1, g]) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('different users get different ids', async () => {
    expect(await setupRecordId(USER, 'account')).not.toBe(await setupRecordId('someone-else', 'account'));
  });
});

describe('applyOnboardingRecords', () => {
  it('does nothing while the plan is not writable', async () => {
    const w = world();
    const d = { ...w.deps(), plan: { writable: false, householdId: HH } };
    expect(await applyOnboardingRecords(d)).toBe('not-ready');
    expect(w.calls.addAccount).not.toHaveBeenCalled();
    expect(w.calls.saveUserSetup).not.toHaveBeenCalled();
  });

  it('writable with an account answer: adds one account with name and opening balance in the chosen currency, then marks done', async () => {
    const w = world();
    w.setSetup(setup({ answers: { cur: 'GBP', acct: { name: ' Main account ', balanceMinor: 125000 } } }));
    expect(await applyOnboardingRecords(w.deps())).toBe('applied');
    expect(w.calls.addAccount).toHaveBeenCalledTimes(1);
    const row = w.calls.addAccount.mock.calls[0][0].row;
    expect(row).toEqual({
      id: await setupRecordId(USER, 'account'),
      household_id: HH,
      name: 'Main account',
      kind: 'checking',
      currency: 'GBP',
      opening_balance: 125000,
    });
    expect(w.calls.addGoal).not.toHaveBeenCalled();
    expect(w.calls.saveUserSetup).toHaveBeenCalledWith({ recordsAppliedAt: expect.any(String) });
  });

  it('a skipped currency answer uses the home currency', async () => {
    const w = world();
    w.setSetup(setup({ answers: { acct: { name: 'Cash', balanceMinor: 0 } } }));
    await applyOnboardingRecords(w.deps());
    expect(w.calls.addAccount.mock.calls[0][0].row.currency).toBe('USD');
  });

  it('writable with a goal answer: adds one goal with the stable id', async () => {
    const w = world();
    w.setSetup(setup({ answers: { cur: 'GBP', save: { name: 'Holiday', targetMinor: 200000, perMonthMinor: 10000 } } }));
    await applyOnboardingRecords(w.deps());
    expect(w.calls.addGoal).toHaveBeenCalledTimes(1);
    const input = w.calls.addGoal.mock.calls[0][0];
    expect(input.id).toBe(await setupRecordId(USER, 'goal'));
    expect(input.householdId).toBe(HH);
    expect(input.fields).toMatchObject({ name: 'Holiday', currency: 'GBP', target: 200000, monthly_amount: 10000, opening_saved: 0 });
    expect(input.series).toBeNull();
    expect(w.calls.saveUserSetup).toHaveBeenCalledTimes(1);
  });

  it('running twice adds nothing the second time', async () => {
    const w = world();
    await applyOnboardingRecords(w.deps());
    expect(await applyOnboardingRecords(w.deps())).toBe('nothing-to-do');
    expect(w.calls.addAccount).toHaveBeenCalledTimes(1);
    expect(w.calls.addGoal).toHaveBeenCalledTimes(1);
    expect(w.calls.saveUserSetup).toHaveBeenCalledTimes(1);
  });

  it('does not duplicate the account after a kill (account made, goal and marker not)', async () => {
    const w = world({ account: true });
    await applyOnboardingRecords(w.deps());
    expect(w.calls.addAccount).not.toHaveBeenCalled();
    expect(w.calls.addGoal).toHaveBeenCalledTimes(1);
    expect(w.calls.saveUserSetup).toHaveBeenCalledWith({ recordsAppliedAt: expect.any(String) });
  });

  it('a kill after the goal: neither is added again, the marker is saved', async () => {
    const w = world({ account: true, goal: true });
    await applyOnboardingRecords(w.deps());
    expect(w.calls.addAccount).not.toHaveBeenCalled();
    expect(w.calls.addGoal).not.toHaveBeenCalled();
    expect(w.calls.saveUserSetup).toHaveBeenCalledTimes(1);
  });

  it('an account add still queued offline from the last session counts as existing', async () => {
    // recordExists answers true for a pending mutation carrying the id (built in LockHost); modelled here by the id check.
    const queued = await setupRecordId(USER, 'account');
    const w = world();
    const d = w.deps();
    await applyOnboardingRecords({ ...d, recordExists: async (kind, id) => kind === 'account' && id === queued });
    expect(w.calls.addAccount).not.toHaveBeenCalled();
    expect(w.calls.addGoal).toHaveBeenCalledTimes(1);
  });

  it('nothing to do when setup is not finished, already applied, or has no account or goal answer', async () => {
    for (const s of [
      null,
      setup({ completedAt: null }),
      setup({ recordsAppliedAt: '2026-11-19T11:00:00Z' }),
      setup({ answers: { goal: 'track' } }),
    ]) {
      const w = world();
      w.setSetup(s);
      expect(await applyOnboardingRecords(w.deps())).toBe('nothing-to-do');
      expect(w.calls.saveUserSetup).not.toHaveBeenCalled();
    }
  });

  it('an add that throws does not stop the marker', async () => {
    const w = world();
    const d = w.deps();
    await applyOnboardingRecords({
      ...d,
      addGoal: () => {
        throw new RangeError('bad');
      },
    });
    expect(w.calls.addAccount).toHaveBeenCalledTimes(1);
    expect(w.calls.saveUserSetup).toHaveBeenCalledTimes(1);
  });
});

describe('queued add scan (the real recordExists, first half)', () => {
  it('reads the id from an account add or a goal save', () => {
    expect(idOfVariables({ row: { id: 'a' } })).toBe('a');
    expect(idOfVariables({ goal: { id: 'g' } })).toBe('g');
    expect(idOfVariables(undefined)).toBeNull();
    expect(idOfVariables({ userId: 'u' })).toBeNull();
  });

  it('a paused or pending add carrying the id counts; a finished one does not', () => {
    const m = (status: string, id: string) => ({ state: { status, variables: { row: { id } } } });
    expect(queuedAddHasId([m('pending', 'x')], 'x')).toBe(true);
    expect(queuedAddHasId([m('idle', 'x')], 'x')).toBe(true);
    expect(queuedAddHasId([m('success', 'x')], 'x')).toBe(false);
    expect(queuedAddHasId([m('pending', 'y')], 'x')).toBe(false);
  });
});
