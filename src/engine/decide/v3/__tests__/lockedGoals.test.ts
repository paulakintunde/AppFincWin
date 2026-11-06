/**
 * 06 D-05, D-06, D-22 unit tests: the money saved in a locked goal is kept out of every answer (the protected amount is the saved
 * amount), the money in an unlocked goal counts as spare and the answer says so, and an answer that keeps out both the safety net
 * and locked goals names both. `locked` absent keeps today's behaviour with no new fact.
 */
import { minorUnits } from '../../../money/types';
import { evaluate } from '../evaluate';
import type { Envelope, Fact, V3Account, V3Inputs } from '../types';
import { toEngineInputs } from './rightAnswers/fixture';
import { loadCases } from './rightAnswers/loader';

const mu = minorUnits;
const CASES = loadCases();
const fixtureOf = (id: string) => {
  const c = CASES.find((x) => x.id === id);
  if (c === undefined) throw new RangeError(id);
  return toEngineInputs(c.fixture);
};
const NEW_FACTS = ['locked_goals_kept', 'net_and_goals_kept', 'unlocked_goals_counted'];
const goal = (saved: number, locked: boolean | undefined, accountId: string | null, id = 'g1'): Envelope => ({
  id,
  kind: 'pot',
  target: mu(50_000),
  monthlyAmount: null,
  readyBy: null,
  saved: mu(saved),
  purposeId: null,
  accountId,
  ...(locked === undefined ? {} : { locked }),
});
const withGoals = (i: V3Inputs, ...envelopes: Envelope[]): V3Inputs => ({ ...i, envelopes });
const factOf = (facts: readonly Fact[], code: string): Fact | undefined => facts.find((f) => f.code === code);
const codes = (facts: readonly Fact[]): string[] => facts.map((f) => f.code);
const withAccount = (i: V3Inputs, a: V3Account): V3Inputs => ({ ...i, accounts: [...(i.accounts ?? []), a] });
const untouched = (id: string, balance: number): V3Account => ({ id, balance: mu(balance), use: { kind: 'untouched' } });

describe('locked goals (D-05)', () => {
  it('a locked goal with 30,000 saved of 50,000 takes exactly 30,000 off the spending balance', () => {
    const { inputs, check } = fixtureOf('SN-13');
    const base = evaluate(inputs, check);
    const locked = evaluate(withGoals(inputs, goal(30_000, true, 'a1')), check);
    expect(locked.funds.spending).toBe(base.funds.spending - 30_000);
    expect(factOf(locked.result.facts, 'locked_goals_kept')).toEqual({ code: 'locked_goals_kept', values: { amount: 30_000 } });
    expect(codes(locked.result.facts)).not.toContain('unlocked_goals_counted');
  });

  it('locked absent behaves as today: deducted, and no new fact', () => {
    const { inputs, check } = fixtureOf('SN-13');
    const absent = evaluate(withGoals(inputs, goal(30_000, undefined, 'a1')), check);
    const locked = evaluate(withGoals(inputs, goal(30_000, true, 'a1')), check);
    expect(absent.funds.spending).toBe(locked.funds.spending);
    expect(absent.result.code).toBe(locked.result.code);
    expect(absent.result.split).toEqual(locked.result.split);
    for (const c of NEW_FACTS) expect(codes(absent.result.facts)).not.toContain(c);
  });

  it('two locked goals name their combined saved money', () => {
    const { inputs, check } = fixtureOf('SN-13');
    const ev = evaluate(withGoals(inputs, goal(40_000, true, 'a1', 'g1'), goal(24_000, true, null, 'g2')), check);
    expect(factOf(ev.result.facts, 'locked_goals_kept')).toEqual({ code: 'locked_goals_kept', values: { amount: 64_000 } });
  });

  it('a locked goal with nothing saved produces no fact', () => {
    const { inputs, check } = fixtureOf('SN-13');
    const ev = evaluate(withGoals(inputs, goal(0, true, 'a1')), check);
    for (const c of NEW_FACTS) expect(codes(ev.result.facts)).not.toContain(c);
  });

  it('a locked net and locked goals together say both: net 130,000 and goals 64,000', () => {
    const { inputs, check } = fixtureOf('SN-15');
    const accounts = (inputs.accounts ?? []).map((a) => (a.id === 'n1' ? { ...a, balance: mu(130_000) } : a));
    const base: V3Inputs = { ...inputs, accounts, safetyNet: { protect: true, size: mu(130_000), saved: mu(130_000) } };
    const ev = evaluate(withGoals(base, goal(64_000, true, 'a1')), check);
    expect(ev.result.code).toBe('not_yet');
    expect(factOf(ev.result.facts, 'net_and_goals_kept')).toEqual({ code: 'net_and_goals_kept', values: { net: 130_000, goals: 64_000 } });
    expect(codes(ev.result.facts)).not.toContain('net_locked');
    expect(codes(ev.result.facts)).not.toContain('locked_goals_kept');
  });

  it('a locked net alone still says net_locked', () => {
    const { inputs, check } = fixtureOf('SN-15');
    const ev = evaluate({ ...inputs, safetyNet: { protect: true, size: mu(100_000), saved: mu(100_000) } }, check);
    expect(codes(ev.result.facts)).toContain('net_locked');
    for (const c of NEW_FACTS) expect(codes(ev.result.facts)).not.toContain(c);
  });
});

describe('unlocked goals (D-06, D-22)', () => {
  it('in an everyday account the money is not deducted, and the answer says it counts', () => {
    const { inputs, check } = fixtureOf('SN-13');
    const base = evaluate(inputs, check);
    const ev = evaluate(withGoals(inputs, goal(30_000, false, 'a1')), check);
    expect(ev.funds.spending).toBe(base.funds.spending);
    expect(factOf(ev.result.facts, 'unlocked_goals_counted')).toEqual({ code: 'unlocked_goals_counted', values: { amount: 30_000 } });
    expect(codes(ev.result.facts)).not.toContain('locked_goals_kept');
  });

  it('in a mixed account the money is not fenced off', () => {
    const { inputs, check } = fixtureOf('SN-13');
    const mixed: V3Inputs = {
      ...inputs,
      accounts: (inputs.accounts ?? []).map((a) => (a.id === 'a1' ? { ...a, use: { kind: 'mixed' as const, extraSetAside: null } } : a)),
    };
    const base = evaluate(mixed, check);
    const ev = evaluate(withGoals(mixed, goal(30_000, false, 'a1')), check);
    expect(ev.funds.spending).toBe(base.funds.spending);
    expect(codes(ev.result.facts)).toContain('unlocked_goals_counted');
    const locked = evaluate(withGoals(mixed, goal(30_000, true, 'a1')), check);
    expect(locked.funds.spending).toBeLessThan(base.funds.spending);
  });

  it('linked to no stated account the money is not deducted', () => {
    const { inputs, check } = fixtureOf('SN-13');
    const base = evaluate(inputs, check);
    const ev = evaluate(withGoals(inputs, goal(30_000, false, null)), check);
    expect(ev.funds.spending).toBe(base.funds.spending);
    expect(ev.funds.envelopesAssumedInside).toBeUndefined();
    expect(factOf(ev.result.facts, 'unlocked_goals_counted')).toEqual({ code: 'unlocked_goals_counted', values: { amount: 30_000 } });
  });

  it('in a dedicated or untouched account the money joins the extra-savings pool', () => {
    const { inputs, check } = fixtureOf('SN-13');
    const base = evaluate(inputs, check);
    expect(factOf(base.result.facts, 'extra_savings_used')).toEqual({ code: 'extra_savings_used', values: { used: 20_000, above: 50_000 } });
    const ev = evaluate(withGoals(withAccount(inputs, untouched('u1', 30_000)), goal(30_000, false, 'u1')), check);
    expect(ev.net?.aboveSize).toBe(80_000);
    expect(factOf(ev.result.facts, 'extra_savings_used')).toEqual({ code: 'extra_savings_used', values: { used: 20_000, above: 80_000 } });
    expect(factOf(ev.result.facts, 'unlocked_goals_counted')).toEqual({ code: 'unlocked_goals_counted', values: { amount: 30_000 } });
  });

  it('a locked goal in an untouched account does not join the pool', () => {
    const { inputs, check } = fixtureOf('SN-13');
    const ev = evaluate(withGoals(withAccount(inputs, untouched('u1', 30_000)), goal(30_000, true, 'u1')), check);
    expect(ev.net?.aboveSize).toBe(50_000);
  });

  it('a goal linked to an account the engine does not know is treated as linked to none', () => {
    const { inputs, check } = fixtureOf('SN-13');
    const base = evaluate(inputs, check);
    const ev = evaluate(withGoals(inputs, goal(30_000, false, 'missing')), check);
    expect(ev.funds.spending).toBe(base.funds.spending);
    expect(ev.net?.aboveSize).toBe(50_000);
  });

  it('with no accounts at all (hand-built inputs) an unlocked goal is not deducted either', () => {
    const { inputs, check } = fixtureOf('SN-13');
    const bare: V3Inputs = { ...inputs, accounts: undefined };
    const base = evaluate(bare, check);
    const ev = evaluate(withGoals(bare, goal(30_000, false, 'a1')), check);
    expect(ev.funds.spending).toBe(base.funds.spending);
    expect(codes(ev.result.facts)).toContain('unlocked_goals_counted');
  });

  it('an unlocked goal with nothing saved produces no fact', () => {
    const { inputs, check } = fixtureOf('SN-13');
    const ev = evaluate(withGoals(inputs, goal(0, false, 'a1')), check);
    for (const c of NEW_FACTS) expect(codes(ev.result.facts)).not.toContain(c);
  });
});
