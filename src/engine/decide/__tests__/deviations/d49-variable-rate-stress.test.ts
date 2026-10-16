/**
 * Named deviation from the prototype (D-22). Reviewers and the Phase 5 team read this file to see why an answer differs from the design mock.
 * Added 2026-10-15 (04-CONTEXT D-49); no prototype counterpart. The prototype had no rate-rise check.
 */
import { minorUnits } from '../../../money/types';
import { percent, type Percent } from '../../../payoff';
import { assess, prepareContext } from '../../assess';
import { resolvePlanStrict } from '../../plan';
import { stressTest } from '../../stress';
import type { BuyCheck, PromoTerms } from '../../types';
import { buyCash, snapshotOf } from '../helpers/fixtures';

const m = minorUnits;

const snapshot = snapshotOf();
const r = prepareContext(snapshot);
if (!r.ok) throw new Error('expected a resolved context');
const context = r.context;

function loan(over: { variable?: boolean; apr?: Percent; promo?: PromoTerms }): BuyCheck {
  const { variable, ...rest } = over;
  return buyCash(1_450_000, {
    payment: {
      method: 'loan',
      deposit: m(300_000),
      termMonths: 48,
      apr: percent('9.4'),
      ...(variable === undefined ? {} : { variable }),
      ...rest,
    },
  });
}

describe('D-49 variable-rate stress', () => {
  it('D-49: stress adds 2 and 4 percentage points, not 0.02 and 0.04', () => {
    // Prototype: no stress at all. A naive port could add 0.02 to a percent figure; offsets are percent('2') and percent('4').
    const out = stressTest(context, loan({ variable: true }));
    expect(out.map((o) => o.apr)).toEqual([percent('11.4'), percent('13.4')]);
    expect(out.map((o) => o.apr)).not.toEqual([percent('9.42'), percent('9.44')]);
  });

  it('D-49: the verdict stays on the entered rate', () => {
    expect(assess(snapshot, loan({ variable: true }))).toEqual(assess(snapshot, loan({})));
  });

  it('D-49: a promotional rate is not stressed; only the rate after it', () => {
    const promo = { apr: percent('0'), months: 12, deferredInterest: false };
    const check = loan({ variable: true, apr: percent('9.9'), promo });
    const out = stressTest(context, check);
    expect(out.map((o) => o.apr)).toEqual([percent('11.9'), percent('13.9')]);
    const base = resolvePlanStrict(check);
    const stressed = resolvePlanStrict(loan({ variable: true, apr: percent('11.9'), promo }));
    expect(stressed.paymentSteps[0]!.amount).toBe(base.paymentSteps[0]!.amount);
  });
});
