// 06.1-12 (D-20, CO-D-114): the builder maps Decide's own unlock onto the engine's safety-net lock; unrated accounts reach the engine.
import { prepare, type V3Inputs } from '@/engine/decide/v3';
import { demoSource } from '../../../__tests__/helpers/demoScenario';
import type { SnapshotSource } from '../../buildSnapshot';
import { buildV3Inputs } from '../buildV3Inputs';
import { SETTINGS, TODAY, USES } from './growScenarios';

type Goal = SnapshotSource['goals'][number];
const net = (over: Partial<Goal> = {}): Goal => ({
  id: 'net', name: 'Safety net', kind: 'pot', check_id: null, currency: 'USD', target: 230000, monthly_amount: null, ready_by: null,
  opening_saved: 130000, done_at: null, deleted_at: null, account_id: 'demo-acct-savings', is_safety_net: true, locked: true, protect: true, ...over,
});
const build = (source: SnapshotSource): V3Inputs => buildV3Inputs(source, SETTINGS, undefined, USES);
const withGoals = (goals: Goal[]): SnapshotSource => ({ ...demoSource(TODAY), goals });

describe('06.1-12 D-20 decide_may_use drives SafetyNet.locked', () => {
  it('false and absent give locked, true gives unlocked', () => {
    expect(build(withGoals([net({ decide_may_use: false })])).safetyNet?.locked).toBe(true);
    expect(build(withGoals([net()])).safetyNet?.locked).toBe(true);
    expect(build(withGoals([net({ decide_may_use: true })])).safetyNet?.locked).toBe(false);
  });

  it("Grow's own locked flag has no effect", () => {
    expect(build(withGoals([net({ locked: false, decide_may_use: false })])).safetyNet?.locked).toBe(true);
    expect(build(withGoals([net({ locked: true, decide_may_use: true })])).safetyNet?.locked).toBe(false);
  });

  it('no flagged goal: no net', () => {
    expect(build(withGoals([])).safetyNet).toBeNull();
  });
});

describe('06.1-12 CO-D-114 unrated accounts', () => {
  it('an account with no rate to home reaches the engine and Prepared.unrated names it', () => {
    const base = demoSource(TODAY);
    const foreign = { id: 'acct-yen', name: 'Yen', kind: 'checking', currency: 'JPY', archived_at: null, deleted_at: null } as SnapshotSource['accounts'][number];
    const source: SnapshotSource = { ...base, accounts: [...base.accounts, foreign], balances: { ...base.balances, 'acct-yen': 500000 } };
    const inputs = build(source);
    expect(inputs.accounts?.find((a) => a.id === 'acct-yen')?.noRate).toBe(true);
    expect(prepare(inputs).unrated).toContain('acct-yen');
  });
});
