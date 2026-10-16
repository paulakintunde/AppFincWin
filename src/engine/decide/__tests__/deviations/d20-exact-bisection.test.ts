import { minorUnits } from '../../../money/types';
import { affordablePrice } from '../../bisect';
import { prepareContext } from '../../assess';
import type { AssessContext } from '../../types';
import { buyCash, snapshotOf } from '../helpers/fixtures';

const mu = minorUnits;

function ctxFor(cashOnHand: number, reserve: number): AssessContext {
  const r = prepareContext(
    snapshotOf({
      cashOnHand: mu(cashOnHand),
      limits: {
        reserve: mu(reserve),
        dsrLine: null,
        unsecuredIncomeMultiple: null,
        investingFloor: null,
        savingFloor: null,
        spareFloor: null,
      },
    })
  );
  if (!r.ok) throw new Error('expected ok');
  return r.context;
}

describe('D-20 exact bisection', () => {
  it('D-20: bisection is exact to the minor unit (the prototype ran 22 float iterations)', () => {
    const ctx = ctxFor(60_000_000, 600_000);
    const price = 70_000_000;
    expect(affordablePrice(ctx, buyCash(price))).toEqual({ kind: 'found', price: 59_400_000 });

    // Prototype: `lo = 0, hi = price; for (let i = 0; i < 22; i++) { mid = (lo + hi) / 2; ok(mid) ? lo = mid : hi = mid }`
    // with the predicate evaluated at Math.floor(mid) minor units.
    const threshold = 59_400_000;
    let lo = 0;
    let hi = price;
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      if (Math.floor(mid) <= threshold) lo = mid;
      else hi = mid;
    }
    expect(Math.floor(lo)).toBeLessThan(threshold);
  });

  it('D-20/D-05: no $200 minimum and no rounding down to the hundred', () => {
    // Prototype: `best > 200 ? Math.floor(best / 100) * 100 : null`
    const ctx = ctxFor(615_050, 600_000);
    expect(affordablePrice(ctx, buyCash(100_000))).toEqual({ kind: 'found', price: 15_050 });
  });
});
