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
    const ev = evaluate(withGoals(inputs, goal(6_000, true, 'a1', 'g1'), goal(4_000, true, null, 'g2')), check);
    expect(factOf(ev.result.facts, 'locked_goals_kept')).toEqual({ code: 'locked_goals_kept', values: { amount: 10_000 } });
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
    expect(ev.funds.envelopesAssumedInside).toBe(0);
    expect(factOf(ev.result.facts, 'unlocked_goals_counted')).toEqual({ code: 'unlocked_goals_counted', values: { amount: 30_000 } });
  });

  it("in a dedicated or untouched account the money is spare savings, never money above the net's size (P2-WR-01)", () => {
    const { inputs, check } = fixtureOf('SN-13');
    const base = evaluate(inputs, check);
    expect(factOf(base.result.facts, 'extra_savings_used')).toEqual({ code: 'extra_savings_used', values: { used: 20_000, above: 50_000 } });
    const ev = evaluate(withGoals(withAccount(inputs, untouched('u1', 30_000)), goal(30_000, false, 'u1')), check);
    expect(ev.net?.aboveSize).toBe(50_000);
    expect(ev.net?.goalsOutside).toBe(30_000);
    // the net's money above its size goes first, so the net's facts are unchanged
    expect(factOf(ev.result.facts, 'extra_savings_used')).toEqual({ code: 'extra_savings_used', values: { used: 20_000, above: 50_000 } });
    expect(factOf(ev.result.facts, 'net_above_size')).toEqual({ code: 'net_above_size', values: { above: 50_000 } });
    expect(factOf(ev.result.facts, 'unlocked_goals_counted')).toEqual({ code: 'unlocked_goals_counted', values: { amount: 30_000 } });
  });

  it('a locked goal in an untouched account does not join the pool', () => {
    const { inputs, check } = fixtureOf('SN-13');
    const ev = evaluate(withGoals(withAccount(inputs, untouched('u1', 30_000)), goal(30_000, true, 'u1')), check);
    expect(ev.net?.aboveSize).toBe(50_000);
    expect(ev.net?.goalsOutside).toBe(0);
  });

  it('a goal linked to an account the engine does not know is treated as linked to none', () => {
    const { inputs, check } = fixtureOf('SN-13');
    const base = evaluate(inputs, check);
    const ev = evaluate(withGoals(inputs, goal(30_000, false, 'missing')), check);
    expect(ev.funds.spending).toBe(base.funds.spending);
    expect(ev.net?.aboveSize).toBe(50_000);
    expect(ev.net?.goalsOutside).toBe(0);
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

/**
 * 06 code review P2-CR-01, P2-CR-02, P2-WR-01..03: an unlocked goal's money enters the answer once, through the account it sits in
 * (or once on its own when that account never counts as spending money), never as money above the net's size, and the fact states
 * only what was counted.
 */
describe('unlocked goal money is counted once (D-22)', () => {
  type Check = ReturnType<typeof fixtureOf>['check'];
  const linked = (c: Check, envelopeId: string | null): Check => ({ ...c, envelopeId });
  const priced = (c: Check, price: number): Check => ({ ...c, price: mu(price) });
  const summary = (ev: ReturnType<typeof evaluate>) => ({ code: ev.result.code, variant: ev.result.variant, split: ev.result.split, afterBuy: ev.result.afterBuy });

  it('P2-CR-01: a purchase for an unlocked goal in the everyday account does not count the goal twice', () => {
    // GL-03's person with the goal moved into the everyday account: $700 there, $500 of it the unlocked goal. Before the fix a
    // purchase linked to the goal counted $700 + $500 = $1,200.
    const { inputs: i0, check } = fixtureOf('GL-03');
    const inputs = withGoals({ ...i0, accounts: (i0.accounts ?? []).filter((a) => a.id !== 'g1') }, goal(50_000, false, 'a1'));
    for (const price of [70_000, 90_000, 110_000, 150_000]) {
      const forGoal = evaluate(inputs, linked(priced(check, price), 'g1'));
      const plain = evaluate(inputs, linked(priced(check, price), null));
      expect(forGoal.funds.ownEnvelope).toBe(0);
      expect(summary(forGoal)).toEqual(summary(plain));
    }
    const ev = evaluate(inputs, linked(priced(check, 150_000), 'g1'));
    expect(ev.result.code).toBe('not_yet');
    expect(factOf(ev.result.facts, 'unlocked_goals_counted')).toEqual({ code: 'unlocked_goals_counted', values: { amount: 50_000 } });
  });

  it('P2-CR-01: the same for a goal in its own untouched or dedicated account', () => {
    const { inputs, check } = fixtureOf('GL-03'); // a $640 unlocked goal in its own untouched savings account
    const dedicated: V3Inputs = {
      ...inputs,
      accounts: (inputs.accounts ?? []).map((a) => (a.id === 'g1' ? { ...a, use: { kind: 'dedicated' as const, purpose: { kind: 'envelope' as const, envelopeId: 'g1' } } } : a)),
    };
    for (const base of [inputs, dedicated]) {
      for (const price of [90_000, 120_000, 160_000]) {
        const forGoal = evaluate(base, linked(priced(check, price), 'g1'));
        expect(forGoal.funds.ownEnvelope).toBe(0);
        expect(summary(forGoal)).toEqual(summary(evaluate(base, linked(priced(check, price), null))));
      }
      expect(evaluate(base, linked(priced(check, 160_000), 'g1')).result.code).toBe('not_yet');
    }
  });

  it('a locked goal linked to the purchase is still its own envelope (as before)', () => {
    const { inputs: i0, check } = fixtureOf('GL-03');
    const ev = evaluate(withGoals(i0, goal(64_000, true, 'g1')), linked(check, 'g1'));
    expect(ev.funds.ownEnvelope).toBe(64_000);
    expect(codes(ev.result.facts)).toContain('envelope_used');
  });

  it('P2-CR-02: an unlocked goal in an untouched savings account adds nothing to the low-month and runway money', () => {
    // QE-12 is Short each month and says how many payments savings carry. A $3,000 untouched savings account carries the same
    // payments whether or not $2,000 of it is an unlocked goal: the money is there once.
    const { inputs, check } = fixtureOf('QE-12');
    const kept: V3Account = { id: 'k1', balance: mu(300_000), use: { kind: 'untouched' }, kind: 'savings' };
    const without = evaluate(withAccount(inputs, kept), check);
    const withGoal = evaluate(withGoals(withAccount(inputs, kept), goal(200_000, false, 'k1')), check);
    expect(withGoal.net?.goalsOutside).toBe(200_000);
    expect(withGoal.net?.goalsOutsideKept).toBe(200_000);
    const runway = (ev: ReturnType<typeof evaluate>) => ev.result.facts.filter((f) => f.code === 'covered_from_savings' || f.code === 'further_shortfall_runway');
    expect(runway(without).length).toBeGreaterThan(0);
    expect(runway(withGoal)).toEqual(runway(without));
    expect(withGoal.result.code).toBe(without.result.code);
  });

  it('P2-WR-01: net_left counts only the net (SN-03 with a $100 goal pays $100, so the net lends $100 and keeps $900)', () => {
    // SN-03: a $1,000 net at its size, unlocked, $300 spare, a $500 purchase. Before the fix net_left said $800.
    const { inputs, check } = fixtureOf('SN-03');
    const ev = evaluate(withGoals(withAccount(inputs, untouched('u1', 10_000)), goal(10_000, false, 'u1')), check);
    expect(ev.result.code).toBe('fits_uses_net');
    expect(factOf(ev.result.facts, 'net_used')).toEqual({ code: 'net_used', values: { used: 10_000 } });
    expect(factOf(ev.result.facts, 'net_left')).toEqual({ code: 'net_left', values: { left: 90_000 } });
    expect(codes(ev.result.facts)).not.toContain('net_above_size');
    expect(codes(ev.result.facts)).not.toContain('extra_savings_used');
  });

  it("P2-WR-01: the reviewer's $5,000 net + $2,000 goal + $1,000 used leaves the net $4,000", () => {
    const { inputs, check } = fixtureOf('SN-03');
    const accounts = (inputs.accounts ?? []).map((a) => (a.id === 'n1' ? { ...a, balance: mu(500_000) } : a));
    const net = { protect: true, size: mu(500_000), saved: mu(500_000), locked: false };
    // $300 spare + the $2,000 goal + $1,000 of the net = $3,300
    const ev = evaluate(withGoals(withAccount({ ...inputs, accounts, safetyNet: net }, untouched('u1', 200_000)), goal(200_000, false, 'u1')), priced(check, 330_000));
    expect(ev.result.code).toBe('fits_uses_net');
    expect(factOf(ev.result.facts, 'net_used')).toEqual({ code: 'net_used', values: { used: 100_000 } });
    expect(factOf(ev.result.facts, 'net_left')).toEqual({ code: 'net_left', values: { left: 400_000 } });
  });

  it("P2-WR-02: with no net or a small net, goal money never says \"above your net's size\" or picks Fits from extra savings", () => {
    for (const id of ['SN-01', 'SN-08']) {
      const { inputs, check } = fixtureOf(id);
      const ev = evaluate(withGoals(withAccount(inputs, untouched('u1', 200_000)), goal(200_000, false, 'u1')), priced(check, 300_000));
      expect(ev.net?.aboveSize).toBe(0);
      expect(codes(ev.result.facts)).not.toContain('net_above_size');
      expect(codes(ev.result.facts)).not.toContain('extra_savings_used');
      expect(ev.result.variant).not.toBe('extra_savings');
      expect(factOf(ev.result.facts, 'unlocked_goals_counted')).toEqual({ code: 'unlocked_goals_counted', values: { amount: 200_000 } });
    }
  });

  it('P2-WR-03: the fact states only money that was counted', () => {
    const { inputs, check } = fixtureOf('SN-13');
    // in an account with no stated use: not counted, so no fact
    const unstated: V3Account = { id: 'x1', balance: mu(50_000), use: null };
    const ev = evaluate(withGoals(withAccount(inputs, unstated), goal(50_000, false, 'x1')), check);
    expect(codes(ev.result.facts)).not.toContain('unlocked_goals_counted');
    expect(ev.net?.goalsOutside).toBe(0);
    // more saved than the account holds after its locked goals: only what is there counts
    const short = evaluate(withGoals(withAccount(inputs, untouched('u1', 30_000)), goal(25_000, false, 'u1'), goal(10_000, true, 'u1', 'g2')), check);
    expect(short.net?.goalsOutside).toBe(20_000);
    expect(factOf(short.result.facts, 'unlocked_goals_counted')).toEqual({ code: 'unlocked_goals_counted', values: { amount: 20_000 } });
    // an overdrawn untouched account holds nothing to count
    const overdrawn = evaluate(withGoals(withAccount(inputs, untouched('u1', -5_000)), goal(25_000, false, 'u1')), check);
    expect(overdrawn.net?.goalsOutside).toBe(0);
  });

  it('P2-WR-03: goal money in a spending account counts only up to what the account holds', () => {
    const { inputs, check } = fixtureOf('SN-13');
    const balance = (inputs.accounts ?? []).find((a) => a.id === 'a1')?.balance ?? 0;
    const ev = evaluate(withGoals(inputs, goal(balance + 99_000, false, 'a1')), check);
    const counted = factOf(ev.result.facts, 'unlocked_goals_counted')?.values.amount as number;
    expect(counted).toBeLessThanOrEqual(balance);
    expect(counted).toBeLessThanOrEqual(ev.funds.spending);
    // a mixed account: only what it keeps after its put-aside money
    const mixed: V3Inputs = {
      ...inputs,
      accounts: (inputs.accounts ?? []).map((a) => (a.id === 'a1' ? { ...a, use: { kind: 'mixed' as const, extraSetAside: mu(balance - 10_000) } } : a)),
    };
    const m = evaluate(withGoals(mixed, goal(30_000, false, 'a1')), check);
    expect(factOf(m.result.facts, 'unlocked_goals_counted')).toEqual({ code: 'unlocked_goals_counted', values: { amount: 10_000 } });
  });
});
