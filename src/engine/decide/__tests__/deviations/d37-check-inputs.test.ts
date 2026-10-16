/**
 * Named deviation from the prototype (D-22). Reviewers and the Phase 5 team read this file to see why an answer differs from the design mock.
 */
import { minorUnits } from '../../../money/types';
import { percent } from '../../../payoff';
import { resolvePriceInputs, salesTaxAmount } from '../../checkInputs';

const m = minorUnits;

describe('D-37 check inputs', () => {
  it('D-37: the engine owns the final price and day-one fees (the prototype computed them in its view layer)', () => {
    // Prototype dprice / dayFees, recomputed in dollars: advertised 14,500.00 with four step-2 lines.
    const lines = [
      { id: 'doc', v: 450, takes: false, on: true, day: true },
      { id: 'trade', v: 2000, takes: true, on: true, day: true },
      { id: 'warranty', v: 900, takes: false, on: true, day: false },
      { id: 'mats', v: 100, takes: false, on: false, day: true },
    ];
    const protoPrice = 14_500 + lines.filter((x) => x.on).reduce((a, x) => a + (x.takes ? -x.v : x.v), 0);
    const protoDay = lines.filter((x) => x.on && x.day && !x.takes && x.v > 0).reduce((a, x) => a + x.v, 0);

    const r = resolvePriceInputs({
      advertised: m(1_450_000),
      adjustments: lines.map((x) => ({
        id: x.id,
        amount: m(x.v * 100),
        effect: x.takes ? ('takes_off' as const) : ('adds' as const),
        onDay: x.day,
        counted: x.on,
      })),
    });
    expect(r.price).toBe(protoPrice * 100);
    expect(r.dayFees).toBe(protoDay * 100);
  });

  it('D-37: sales tax has no default rate', () => {
    // No tax line: nothing is added. The only way to get tax is salesTaxAmount with an explicit Percent.
    const r = resolvePriceInputs({ advertised: m(1_450_000), adjustments: [] });
    expect(r.price).toBe(1_450_000);
    expect(r.dayFees).toBe(0);
    expect(salesTaxAmount(m(1_450_000), percent('6'))).toBe(87_000);
  });
});
