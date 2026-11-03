/**
 * 05.4 D-54 / D-60 / D-63 unit tests: the depletion lines and "No: your month is already short". Pinned on gen:126 (frozen from the
 * corpus, golden/gen126-depletion.json) and the Riley and Leo plans, locked and unlocked, plus every branch of depletion.ts.
 */
import { minorUnits } from '../../../money/types';
import { depletionFacts, monthAlreadyShort, type DepletionInput } from '../depletion';
import { evaluate } from '../evaluate';
import { NO_NET, type ResolvedNet } from '../safetyNet';
import type { CheckV2, Fact, Result, Schedule, V3Inputs } from '../types';
import frozen from './golden/gen126-depletion.json';
import { corpus } from './reviewed/corpus';

const mu = minorUnits;
const revive = (_k: string, v: unknown): unknown => (v !== null && typeof v === 'object' && '$bigint' in v ? BigInt((v as { $bigint: string }).$bigint) : v);
const gen126 = JSON.parse(JSON.stringify(frozen), revive) as { inputs: V3Inputs; check: CheckV2 };

const CORPUS = corpus();
const caseOf = (key: string): { inputs: V3Inputs; check: CheckV2 } => {
  const c = CORPUS.find((x) => x.key === key);
  if (c === undefined) throw new RangeError(key);
  return c;
};
const unlock = (i: V3Inputs, saved: number): V3Inputs => ({ ...i, safetyNet: { protect: true, size: null, saved: mu(saved), locked: false } });
const DEPLETION = ['usual_month_short', 'depletion_payment', 'plan_makes_short', 'price_over_net', 'net_lasts', 'net_lasts_without', 'interest_is_a_cost', 'balanced_month_room', 'month_balance_gap'];
const lines = (r: Result): Fact[] => r.facts.filter((f) => DEPLETION.includes(f.code));

describe('the depletion lines through evaluate (D-54, D-60, D-63)', () => {
  it('gen:126, net locked by default: Short each month, already short, the lines in order, no net_lasts', () => {
    const r = evaluate(gen126.inputs, gen126.check).result;
    expect(r.code).toBe('monthly_short');
    expect(r.variant).toBe('month_already_short');
    expect(r.readyBy).toBeNull();
    expect(lines(r)).toEqual([
      { code: 'depletion_payment', values: { monthly: 74_244, shortBefore: 113_465, shortAfter: 187_709 } },
      { code: 'price_over_net', values: { price: 2_418_208, net: 1_767_693 } },
      { code: 'interest_is_a_cost', values: { interest: 1_145_486, total: 3_563_694 } },
      { code: 'balanced_month_room', values: { pay: 421_787, costs: 535_252 } },
      { code: 'month_balance_gap', values: { gap: 113_465 } },
    ]);
    // the lines lead the answer
    expect(r.facts.slice(0, 5)).toEqual(lines(r));
  });

  it('gen:126 unlocked: also how long the safety net would last, with and without the plan', () => {
    const r = evaluate(unlock(gen126.inputs, 1_767_693), gen126.check).result;
    expect(r.facts).toContainEqual({ code: 'net_lasts', values: { shortfall: 187_709, months: 9 } });
    expect(r.facts).toContainEqual({ code: 'net_lasts_without', values: { months: 15 } });
  });

  it('Riley’s plan: 300.00 short, 519.30 with it; 9,000 over a 2,000 net; 1,526.06 interest; unlocked lasts 3 months, 6 without', () => {
    const { inputs, check } = caseOf('persona:riley:900000:plan');
    const locked = evaluate(inputs, check).result;
    expect(locked.variant).toBe('month_already_short');
    expect(locked.readyBy).toBeNull();
    expect(lines(locked)).toEqual([
      { code: 'depletion_payment', values: { monthly: 21_930, shortBefore: 30_000, shortAfter: 51_930 } },
      { code: 'price_over_net', values: { price: 900_000, net: 200_000 } },
      { code: 'interest_is_a_cost', values: { interest: 152_606, total: 1_052_606 } },
      { code: 'balanced_month_room', values: { pay: 280_000, costs: 310_000 } },
      { code: 'month_balance_gap', values: { gap: 30_000 } },
    ]);
    const open = evaluate(unlock(inputs, 200_000), check).result;
    expect(open.facts).toContainEqual({ code: 'net_lasts', values: { shortfall: 51_930, months: 3 } });
    expect(open.facts).toContainEqual({ code: 'net_lasts_without', values: { months: 6 } });
  });

  it('Leo’s plan (usual month +120): the plan makes it short; no D-63 variant', () => {
    const { inputs, check } = caseOf('persona:leo:900000:plan');
    const r = evaluate(inputs, check).result;
    expect(r.code).toBe('monthly_short');
    expect(r.variant).toBeNull();
    expect(lines(r).map((f) => f.code)).toEqual(['plan_makes_short', 'price_over_net', 'interest_is_a_cost', 'balanced_month_room']);
    expect(lines(r)[0]).toEqual({ code: 'plan_makes_short', values: { short: 9_930 } });
  });

  it('Riley $60 cash, unlocked (Dips, already short): the usual shortfall and how long the net lasts; no payment or interest line', () => {
    const { inputs, check } = caseOf('persona:riley:6000:cash');
    const r = evaluate(unlock(inputs, 200_000), check).result;
    expect(r.code).toBe('fits_uses_net');
    expect(r.variant).toBe('month_already_short');
    expect(lines(r)).toEqual([
      { code: 'usual_month_short', values: { short: 30_000 } },
      { code: 'net_lasts', values: { shortfall: 30_000, months: 6 } },
      { code: 'net_lasts_without', values: { months: 6 } },
      { code: 'balanced_month_room', values: { pay: 280_000, costs: 310_000 } },
      { code: 'month_balance_gap', values: { gap: 30_000 } },
    ]);
  });

  it('no depletion line on a plain fit with a usual month that balances (Maya $60)', () => {
    const { inputs, check } = caseOf('persona:maya:6000:cash');
    const r = evaluate(inputs, check).result;
    expect(r.code).toBe('fits_month');
    expect(lines(r)).toEqual([]);
    expect(r.variant).toBeNull();
  });
});

describe('depletionFacts (every branch)', () => {
  const net = (over: Partial<ResolvedNet>): ResolvedNet => ({ ...NO_NET, protect: true, off: false, saved: mu(100_000), size: mu(100_000), floor: mu(100_000), usable: mu(100_000), state: 'full', ...over });
  const sched = (interest: number): Schedule => ({ totalInterest: mu(interest), totalPaid: mu(60_000 + interest) }) as unknown as Schedule;
  const base: DepletionInput = {
    code: 'monthly_short',
    monthly: mu(10_000),
    whole: mu(60_000),
    dayOne: mu(0),
    schedule: null,
    share: { weights: [1], myIndex: 0 },
    typicalLeft: mu(-5_000),
    typicalIncome: mu(300_000),
    net: net({}),
    netTaken: mu(0),
  };
  const codes = (d: DepletionInput): string[] => depletionFacts(d).map((f) => f.code);

  it('monthAlreadyShort: below 0 only', () => {
    expect(monthAlreadyShort(mu(-1))).toBe(true);
    expect(monthAlreadyShort(mu(0))).toBe(false);
    expect(monthAlreadyShort(null)).toBe(false);
  });

  it('nothing for an ask, an unknown usual month, or a month that stays balanced', () => {
    expect(depletionFacts({ ...base, code: 'needs_input' })).toEqual([]);
    expect(depletionFacts({ ...base, typicalLeft: null })).toEqual([]);
    expect(depletionFacts({ ...base, typicalLeft: mu(20_000) })).toEqual([]);
    expect(depletionFacts({ ...base, typicalLeft: mu(5_000), monthly: mu(0) })).toEqual([]);
    // the plan makes it short only on Short each month or Not yet
    expect(depletionFacts({ ...base, typicalLeft: mu(5_000), code: 'fits_month' })).toEqual([]);
    expect(codes({ ...base, typicalLeft: mu(5_000), code: 'not_yet' })[0]).toBe('plan_makes_short');
  });

  it('the net lines: unlocked only, never while off or empty; price_over_net only when the price is more', () => {
    expect(codes(base)).toEqual(['depletion_payment', 'net_lasts', 'net_lasts_without', 'balanced_month_room', 'month_balance_gap']);
    expect(codes({ ...base, net: net({ locked: true }) })).not.toContain('net_lasts');
    expect(codes({ ...base, net: net({ off: true }) })).not.toContain('net_lasts');
    expect(codes({ ...base, net: net({ saved: mu(0) }) })).not.toContain('net_lasts');
    expect(codes({ ...base, net: net({ saved: mu(0) }) })).not.toContain('price_over_net');
    expect(codes({ ...base, whole: mu(200_000) })).toContain('price_over_net');
    // the net taken is more than saved: it lasts 0 months
    expect(depletionFacts({ ...base, netTaken: mu(500_000) }).find((f) => f.code === 'net_lasts')?.values).toEqual({ shortfall: 15_000, months: 0 });
    // a cash purchase taking nothing from the net has no "without" line
    expect(codes({ ...base, monthly: mu(0) })).toEqual(['usual_month_short', 'net_lasts', 'balanced_month_room', 'month_balance_gap']);
    expect(codes({ ...base, monthly: mu(0), netTaken: mu(1_000) })).toContain('net_lasts_without');
    // a plan made short (not already short) has no "without" line
    expect(codes({ ...base, typicalLeft: mu(5_000) })).toEqual(['plan_makes_short', 'net_lasts', 'balanced_month_room']);
  });

  it('interest_is_a_cost on a plan with interest only', () => {
    expect(depletionFacts({ ...base, schedule: sched(7_000), dayOne: mu(1_000) }).find((f) => f.code === 'interest_is_a_cost')?.values).toEqual({ interest: 7_000, total: 68_000 });
    expect(codes({ ...base, schedule: sched(0) })).not.toContain('interest_is_a_cost');
  });
});
