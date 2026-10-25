import { percent } from '@/engine/decide';
import type { PurchaseCheck } from '@/engine/decide';
import { minorUnits } from '@/engine/money';
import { futureValue } from '@/engine/payoff';
import { emptyCheckInputs, toEngineCheck } from '../checkInputs';
import { LUMP_HORIZON_DEFAULT, expectedReturnProjection } from '../expectedReturn';
import type { CheckInputs } from '../types';
import { TODAY, USD } from './helpers/snapshotFixtures';

const CTX = { currency: USD, cards: [], dealerCap: null };

function invest(over: Partial<CheckInputs> = {}): { inputs: CheckInputs; check: PurchaseCheck } {
  const inputs: CheckInputs = { ...emptyCheckInputs('invest', TODAY), advertised: 100_000, investReturnText: '7.5', ...over };
  const r = toEngineCheck(inputs, CTX);
  if (!r.ok) throw new Error('invest check');
  return { inputs, check: r.check };
}

describe('expectedReturnProjection', () => {
  it('D-82 the projection uses the contribution term or the 60-month lump horizon', () => {
    expect(LUMP_HORIZON_DEFAULT).toBe(60);
    const lump = invest();
    expect(expectedReturnProjection(lump.inputs, lump.check)).toEqual({
      fv: futureValue(minorUnits(0), percent('7.5'), 60, minorUnits(100_000)),
      months: 60,
      rateText: '7.5',
    });
    const longer = invest({ lumpHorizonMonths: 120 });
    expect(expectedReturnProjection(longer.inputs, longer.check)!.months).toBe(120);
    const monthly = invest({ method: 'monthly', investTermMonths: 24, lumpHorizonMonths: 120 });
    expect(expectedReturnProjection(monthly.inputs, monthly.check)).toEqual({
      fv: futureValue(minorUnits(100_000), percent('7.5'), 24, minorUnits(0)),
      months: 24,
      rateText: '7.5',
    });
    const zero = invest({ investReturnText: '0' });
    expect(expectedReturnProjection(zero.inputs, zero.check)!.fv).toBe(100_000);
  });
  it('D-82 an out-of-range projection is null', () => {
    const big = invest({ advertised: 1_000_000_000_000, investReturnText: '100', lumpHorizonMonths: 600 });
    expect(expectedReturnProjection(big.inputs, big.check)).toEqual({ fv: null, months: 600, rateText: '100' });
  });
  it('D-82 is absent without a valid return, a monthly term or an investment check', () => {
    const none = invest({ investReturnText: null });
    expect(expectedReturnProjection(none.inputs, none.check)).toBeNull();
    const bad = invest({ investReturnText: '250' });
    expect(expectedReturnProjection(bad.inputs, bad.check)).toBeNull();
    const noTerm = invest({ method: 'monthly', investTermMonths: null });
    expect(expectedReturnProjection(noTerm.inputs, noTerm.check)).toBeNull();
    const buyInputs: CheckInputs = { ...emptyCheckInputs('buy', TODAY), advertised: 100_000, method: 'cash', investReturnText: '7.5' };
    const r = toEngineCheck(buyInputs, CTX);
    if (!r.ok) throw new Error('buy check');
    expect(expectedReturnProjection(buyInputs, r.check)).toBeNull();
    expect(expectedReturnProjection(none.inputs, null)).toBeNull();
  });
});
