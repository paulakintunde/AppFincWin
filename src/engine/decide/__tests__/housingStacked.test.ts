/**
 * E8 follow-up (D-103; UI-SPEC R18.4): housing is tested on the combined position, so another open property check that
 * adds housing cost counts toward housingMonthly there, by the same rule assess() applies to the check being judged.
 * The standalone verdict (no other checks) never carries it.
 */
import { minorUnits } from '../../money/types';
import { assess } from '../assess';
import { decide } from '../decision';
import { stackCheck, positionContext } from '../position';
import { prepareContext } from '../assess';
import type { Assessment, BuyCheck, DecideSnapshot, InvestCheck, StackedCheckInput } from '../types';
import { USD, buyCash, snapshotOf } from './helpers/fixtures';

const mu = minorUnits;

const snap = (over: Partial<DecideSnapshot> = {}): DecideSnapshot => snapshotOf({ housingMonthly: mu(100_000), ...over });
const property = (running: number, over: Partial<BuyCheck> = {}): BuyCheck =>
  buyCash(1_000, { itemType: 'property', runningCostsNet: mu(running), ...over });
const stackedOf = (check: BuyCheck | InvestCheck): StackedCheckInput => ({ check, purchaseRule: null });
function resolved(v: ReturnType<typeof assess>): Assessment {
  if (v.state === 'missing') throw new Error('expected a resolved verdict');
  return v;
}
function context(s: DecideSnapshot) {
  const r = prepareContext(s);
  if (!r.ok) throw new Error('context refused');
  return r.context;
}

describe('D-103 stacked property checks and the housing line', () => {
  it('D-103 a stacked open property check counts toward housing', () => {
    const combined = resolved(assess(snap(), property(10_000), [stackedOf(property(50_000))]));
    expect(combined.housingBefore).toBe(150_000);
    expect(combined.housingAfter).toBe(160_000);
    const alone = resolved(assess(snap(), property(10_000)));
    expect(alone.housingBefore).toBe(100_000);
    expect(alone.housingAfter).toBe(110_000);
  });

  it('D-103 the standalone verdict does not carry a stacked property check', () => {
    const decision = decide(snap(), property(10_000), [stackedOf(property(50_000))]);
    const standalone = decision.standalone;
    if (standalone === null || standalone.state === 'missing') throw new Error('expected a standalone verdict');
    expect(standalone.housingBefore).toBe(100_000);
    expect(decision.verdict.state === 'missing' ? null : decision.verdict.housingBefore).toBe(150_000);
  });

  it('D-103 a stacked property check can push the combined position over the line', () => {
    // 28% of the 600_000 money-in basis is 168_000: 100_000 + 50_000 + 10_000 fits, a further 8_001 does not
    const fits = resolved(assess(snap(), property(10_000), [stackedOf(property(50_000))]));
    expect(fits.warnings.some((w) => w.code === 'housing')).toBe(false);
    const over = resolved(assess(snap(), property(18_001), [stackedOf(property(50_000))]));
    expect(over.warnings.some((w) => w.code === 'housing')).toBe(true);
  });

  it('D-103 stacked checks that add no housing cost leave housingMonthly alone', () => {
    const base = context(snap());
    const housingOf = (input: StackedCheckInput): number => stackCheck(base, input, 0).context.snapshot.housingMonthly;
    expect(housingOf(stackedOf(buyCash(1_000, { runningCostsNet: mu(50_000) })))).toBe(100_000); // not a property check
    expect(housingOf(stackedOf(property(-5_000)))).toBe(100_000); // replaced expenses net the effect below zero
    expect(housingOf(stackedOf(property(0)))).toBe(100_000); // no monthly effect
    const invest: InvestCheck = { kind: 'invest', currency: USD, amount: mu(10_000), payment: { method: 'monthly', termMonths: 12 } };
    expect(housingOf(stackedOf(invest))).toBe(100_000); // an investment is never housing
    expect(housingOf(stackedOf(property(50_000)))).toBe(150_000);
  });

  it('D-103 two stacked property checks add up in order', () => {
    const pos = positionContext(context(snap()), property(1_000), [stackedOf(property(20_000)), stackedOf(property(30_000))]);
    expect(pos.combined.snapshot.housingMonthly).toBe(150_000);
    expect(pos.standalone.snapshot.housingMonthly).toBe(100_000);
  });
});
