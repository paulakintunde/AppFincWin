/**
 * Named deviation tests, D-05 and D-06 (alternatives, plan 04-10).
 *
 * Prototype (FincWin United.dc.html step 4): `ret: S.dRet === null ? 6.5 : S.dRet` and `const FLOOR = 25`.
 * The engine projects at 0% unless the user entered a return, and the too-thin floor is a user-editable limit.
 */
import { minorUnits } from '../../../money/types';
import { percent } from '../../../payoff/types';
import { buildAlternatives } from '../../alternatives';
import { assessPlan, prepareContext } from '../../assess';
import { resolvePlanStrict } from '../../plan';
import type { Alternatives, BuyCheck, DecideSnapshot } from '../../types';
import { buyCash, monthsOf, snapshotOf } from '../helpers/fixtures';

const mu = minorUnits;
const LIMITS = {
  reserve: mu(600_000),
  dsrLine: null,
  unsecuredIncomeMultiple: null,
  investingFloor: null,
  savingFloor: null,
  spareFloor: null,
};
const LOAN: BuyCheck = buyCash(1_450_000, {
  payment: { method: 'loan', deposit: mu(300_000), termMonths: 48, apr: percent('9.4') },
});

function altsOf(s: DecideSnapshot, check: BuyCheck): Alternatives {
  const r = prepareContext(s);
  if (!r.ok) throw new Error('expected ok');
  return buildAlternatives(r.context, check, assessPlan(r.context, check, resolvePlanStrict(check)));
}

describe('D-05 / D-06 alternatives', () => {
  const base = { limits: LIMITS, cashOnHand: mu(3_000_000) };

  it('D-06: alternatives project at 0% unless the user entered a return (prototype default 6.5%)', () => {
    const none = altsOf(snapshotOf({ ...base, projectionReturn: null }), LOAN);
    const skip = none.rows[3];
    expect(skip.projected).toBe(skip.contributed);
    expect(skip.growth).toBe(0);

    const entered = altsOf(snapshotOf({ ...base, projectionReturn: percent('6.5') }), LOAN);
    const grown = entered.rows[3];
    expect(grown.contributed).toBe(skip.contributed);
    expect(grown.projected as number).toBeGreaterThan(grown.contributed as number);
  });

  it('D-05: the too-thin floor is the user-editable spareFloor, default 0 (prototype FLOOR = 25)', () => {
    // 1_000 left over after the cheaper one; a prototype floor of 25.00 (2_500) would suppress it, the default 0 does not.
    const months = monthsOf([[600_000, 599_000], [600_000, 599_000], [600_000, 599_000]]);
    const cashBuy = buyCash(1_000_000);
    const noFloor = altsOf(snapshotOf({ limits: LIMITS, cashOnHand: mu(600_000), months }), cashBuy);
    expect(noFloor.rows[1].suppression?.code).not.toBe('too_thin');
    const floored = altsOf(
      snapshotOf({ limits: { ...LIMITS, spareFloor: mu(2_500) }, cashOnHand: mu(600_000), months }),
      cashBuy
    );
    expect(floored.rows[1].suppression).toEqual({ code: 'too_thin', amount: 1_000 });
  });
});
