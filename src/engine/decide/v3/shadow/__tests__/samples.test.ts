// 05.4-36 BO-08 (D-12, D-147): the fixed sample set.
import { evaluate } from '../../evaluate';
import { percent } from '../../../../payoff/types';
import { loadPersons, toV3Inputs } from '../../__tests__/golden/adapter';
import { SHADOW_SAMPLE_IDS, shadowSamples } from '../samples';

describe('shadow samples', () => {
  it('are the 6 fixed ids in order', () => {
    expect(SHADOW_SAMPLE_IDS).toEqual(['s60', 'p500', 'l2000', 'c9000_cash', 'c9000_plan', 'f1200_plan']);
    expect(shadowSamples('USD').map((s) => s.id)).toEqual([...SHADOW_SAMPLE_IDS]);
  });

  it('price whole units of the home currency (D-147): USD, GBP and JPY', () => {
    expect(shadowSamples('USD').map((s) => s.check.price)).toEqual([6000, 50000, 200000, 900000, 900000, 120000]);
    expect(shadowSamples('GBP').map((s) => s.check.price)).toEqual([6000, 50000, 200000, 900000, 900000, 120000]);
    expect(shadowSamples('JPY').map((s) => s.check.price)).toEqual([60, 500, 2000, 9000, 9000, 1200]);
  });

  it('include tax, carry no fees, are personal and have no purpose', () => {
    for (const s of shadowSamples('USD')) {
      expect(s.check.taxIncluded).toBe(true);
      expect(s.check.taxPercent).toBeNull();
      expect(s.check.oneOffFees).toBe(0);
      expect(s.check.share).toEqual({ kind: 'personal' });
      expect(s.check.purpose).toBeNull();
      expect(s.check.foreign).toBeNull();
    }
  });

  it('two fixed plan terms: the car over 48 months at 9.9%, the furniture over 12 at 0%', () => {
    const [, , , cash, car, furniture] = shadowSamples('USD');
    expect(cash?.check.pay).toEqual({ mode: 'once' });
    expect(car?.check.pay).toMatchObject({ mode: 'plan', cadence: { unit: 'month', every: 1 }, count: 48, apr: percent('9.9'), deposit: 0, firstPayment: { kind: 'one_period' } });
    expect(furniture?.check.pay).toMatchObject({ mode: 'plan', count: 12, apr: percent('0'), fees: { setup: 0, perPeriod: 0, end: 0 } });
  });

  it('never ask for a plan figure or a price on the invented people', () => {
    const asks = ['no_price', 'plan_count_missing', 'first_payment_not_chosen', 'pause_interest_not_answered', 'plan_rate_missing', 'first_payment_passed'];
    for (const person of loadPersons()) {
      const inputs = toV3Inputs(person);
      for (const s of shadowSamples(inputs.currency)) {
        expect(evaluate(inputs, s.check).result.missing.filter((m) => asks.includes(m))).toEqual([]);
      }
    }
  });
});
