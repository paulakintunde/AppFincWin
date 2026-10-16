import { minorUnits } from '../../money/types';
import { amortise, percent, type Percent } from '../../payoff';
import { assess, assessPlan, prepareContext } from '../assess';
import { resolvePlanStrict } from '../plan';
import { myPart, resolveShare } from '../share';
import { stressTest } from '../stress';
import type { AssessContext, BuyCheck, BuyPayment, DecideSnapshot } from '../types';
import { buyCash, monthsOf, snapshotOf, USD } from './helpers/fixtures';

const m = minorUnits;

function ctx(over: Partial<DecideSnapshot> | DecideSnapshot = {}): AssessContext {
  const r = prepareContext(snapshotOf(over));
  if (!r.ok) throw new Error('expected a resolved context');
  return r.context;
}

function loanCheck(price: number, payment: Partial<Extract<BuyPayment, { method: 'loan' }>> = {}): BuyCheck {
  return buyCash(price, {
    payment: { method: 'loan', deposit: m(300_000), termMonths: 48, apr: percent('9.4'), variable: true, ...payment },
  });
}

const card = (apr: Percent | null) => ({
  id: 'c1',
  apr,
  minimumTerms: { floor: m(2_500), minimumPercent: percent('1'), interestAdded: true },
  currency: USD,
});

function cardCheck(apr: Percent | null, payoff: Extract<BuyPayment, { method: 'card' }>['payoff']): BuyCheck {
  return buyCash(500_000, {
    payment: { method: 'card', card: card(apr), payoff, dealerCap: null, variable: true },
  });
}

describe('stressTest', () => {
  const BL = ctx();
  const LOAN = loanCheck(1_450_000);

  it('re-runs a variable loan at +2 and +4 percentage points in offset order', () => {
    const out = stressTest(BL, LOAN);
    expect(out).toHaveLength(2);
    expect(out[0]!.offset).toBe(percent('2'));
    expect(out[0]!.apr).toBe(percent('11.4'));
    expect(out[1]!.offset).toBe(percent('4'));
    expect(out[1]!.apr).toBe(percent('13.4'));
    expect(out[0]!.monthly).toBe(amortise(m(1_150_000), percent('11.4'), 48).payment);
    expect(out[1]!.monthly).toBe(amortise(m(1_150_000), percent('13.4'), 48).payment);
  });

  it('each outcome equals the assessment of the stressed check', () => {
    const out = stressTest(BL, LOAN);
    [percent('11.4'), percent('13.4')].forEach((apr, i) => {
      const stressed = loanCheck(1_450_000, { apr });
      const a = assessPlan(BL, stressed, resolvePlanStrict(stressed));
      expect(out[i]).toEqual({
        offset: i === 0 ? percent('2') : percent('4'),
        apr,
        monthly: a.plan.monthly,
        mineMonthly: myPart(a.plan.monthly, BL.purchaseShare),
        left: a.left,
        state: a.state,
        monthCloses: a.checks.month,
        dsrWithinLine: a.checks.dsr,
      });
    });
  });

  it('can turn a fitting plan into a tighter one at +4 while the verdict stays on the entered rate', () => {
    const snap = snapshotOf({ months: monthsOf([[600_000, 520_000], [600_000, 520_000], [600_000, 520_000]]) });
    const tight = ctx(snap);
    const check = loanCheck(1_450_000, { deposit: m(0), termMonths: 19, apr: percent('5') });
    expect(assess(snap, check).state).toBe('fits');
    const out = stressTest(tight, check);
    expect(out[1]!.state).toBe('no');
    expect(out[0]!.state).toBe('no');
  });

  it('is empty when not flagged variable, when not a loan or card, or when the terms are missing', () => {
    expect(stressTest(BL, loanCheck(1_450_000, { variable: false }))).toEqual([]);
    expect(stressTest(BL, buyCash(100_000))).toEqual([]);
    expect(
      stressTest(
        BL,
        buyCash(100_000, { payment: { method: 'instalment', instalmentAmount: m(25_000), instalmentCount: 4 } })
      )
    ).toEqual([]);
    expect(
      stressTest(BL, { kind: 'invest', currency: USD, amount: m(100_000), payment: { method: 'lump' } })
    ).toEqual([]);
    expect(stressTest(BL, loanCheck(1_450_000, { apr: null }))).toEqual([]);
  });

  it('stresses the card rate for months and minimum plans, not for a full payoff', () => {
    const out = stressTest(BL, cardCheck(percent('22.9'), { kind: 'months', months: 12 }));
    expect(out.map((o) => o.apr)).toEqual([percent('24.9'), percent('26.9')]);
    expect(out[0]!.monthly).toBe(amortise(m(500_000), percent('24.9'), 12).payment);
    expect(stressTest(BL, cardCheck(percent('22.9'), { kind: 'minimum' }))).toHaveLength(2);
    expect(stressTest(BL, cardCheck(percent('22.9'), { kind: 'full' }))).toEqual([]);
    expect(stressTest(BL, cardCheck(null, { kind: 'months', months: 12 }))).toEqual([]);
  });

  it('keeps a promotional segment and stresses the rate after it', () => {
    const promo = { apr: percent('0'), months: 12, deferredInterest: false };
    const base = resolvePlanStrict(loanCheck(1_450_000, { apr: percent('9.9'), promo }));
    const out = stressTest(BL, loanCheck(1_450_000, { apr: percent('9.9'), promo }));
    expect(out.map((o) => o.apr)).toEqual([percent('11.9'), percent('13.9')]);
    const stressed = resolvePlanStrict(loanCheck(1_450_000, { apr: percent('11.9'), promo }));
    expect(stressed.paymentSteps[0]!.amount).toBe(base.paymentSteps[0]!.amount);
    expect(out[0]!.monthly).toBe(stressed.monthly);
  });

  it('applies the household purchase share to mineMonthly', () => {
    const r = resolveShare({ kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'even' } });
    if (!r.ok) throw new Error('share');
    const hh = { ...BL, purchaseShare: r.share };
    const out = stressTest(hh, LOAN);
    expect(out[0]!.mineMonthly).toBe(myPart(out[0]!.monthly, r.share));
    expect(out[0]!.mineMonthly).toBeLessThan(out[0]!.monthly);
  });
});
