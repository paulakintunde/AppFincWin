import { assert as fcAssert, integer, property, constantFrom } from 'fast-check';
import { currencyCode, minorUnits as mu } from '../../../../money/types';
import { percent } from '../../../../payoff/types';
import { ASOF, checkOnce, checkPlan, inputsOf } from '../../__tests__/helpers/fixtures';
import type { CheckV2, CustomOptions } from '../../types';
import { buildPurchase, purchaseCashFlows } from '../purchase';

const inputs = inputsOf();
const ctx = { asOf: ASOF, thresholds: inputs.thresholds, custom: inputs.custom };
const build = (c: CheckV2, custom: CustomOptions = inputs.custom) => buildPurchase(c, { ...ctx, custom });
const must = (c: CheckV2, custom?: CustomOptions) => {
  const b = build(c, custom);
  if (b.purchase === null) throw new Error(`no purchase: ${b.missing.join(',')} ${b.reasons.join(',')}`);
  return { ...b, purchase: b.purchase };
};
const today = { kind: 'today' } as const;
const even2 = { kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'even' } } as const;
const noFees = { setup: mu(0), perPeriod: mu(0), end: mu(0) };

describe('buildPurchase', () => {
  it('I32 band from whole value only', () => {
    fcAssert(
      property(integer({ min: 1000, max: 5_000_000 }), constantFrom(1, 6, 12, 24), (price, count) => {
        const once = must(checkOnce(price)).purchase.band;
        const plan = must(checkPlan(price, { count, apr: percent('0'), firstPayment: today })).purchase.band;
        const unquoted = must(checkPlan(price, { count, apr: percent('9.9'), firstPayment: { kind: 'one_period' } })).purchase.band;
        expect(plan).toBe(once);
        expect(unquoted).toBe(once);
      }),
      { numRuns: 60 }
    );
  });

  it('v3 §12 #21 Priya: 160000 household even 2', () => {
    const p = must(checkOnce(160000, { share: even2 })).purchase;
    expect(p.whole).toBe(80000);
    expect(p.dayOne).toBe(80000);
  });

  it('D-18 50/50', () => {
    expect(must(checkOnce(100000, { share: even2 })).purchase.whole).toBe(50000);
  });

  it('whole value adds tax and one-off fees', () => {
    const p = must(checkOnce(100000, { taxPercent: percent('10'), oneOffFees: mu(5000) })).purchase;
    expect(p.whole).toBe(115000);
  });

  it('D-09 foreign: at_todays_rate fact, band from the home price', () => {
    const b = must(checkOnce(100000, { foreign: { currency: currencyCode('EUR'), atTodaysRate: true } }));
    expect(b.facts.some((f) => f.code === 'at_todays_rate')).toBe(true);
    expect(b.purchase.band).toBe(must(checkOnce(100000)).purchase.band);
  });

  describe('I41 via purchase', () => {
    // apr 0, 24 x 8500 = 204000 financed
    const plan = (quotedPayment: number | null) =>
      must(checkPlan(204000, { count: 24, apr: percent('0'), firstPayment: { kind: 'one_period' }, quotedPayment: quotedPayment === null ? null : mu(quotedPayment) }));
    it('a lower quote never lowers M', () => {
      const b = plan(8300);
      expect(b.purchase.monthly).toBe(8500);
      expect(b.purchase.schedule?.payment).toBe(8500);
    });
    it('a higher quote is scored, with quoted_differs', () => {
      const b = plan(8700);
      expect(b.purchase.monthly).toBe(8700);
      expect(b.purchase.schedule?.source).toBe('quoted');
      expect(b.facts.some((f) => f.code === 'quoted_differs')).toBe(true);
      expect(b.quoted.kind).toBe('differs');
    });
    it('quote with no rate uses the quote and reports the implied rate', () => {
      const b = must(checkPlan(204000, { count: 24, apr: null, firstPayment: { kind: 'one_period' }, quotedPayment: mu(9000) }));
      expect(b.purchase.monthly).toBe(9000);
      expect(b.purchase.schedule?.source).toBe('from_quote');
      expect(b.reasons).toContain('quote_used_no_rate');
      expect(b.facts.some((f) => f.code === 'implied_rate')).toBe(true);
    });
  });

  describe('I36 / D-19 typed amounts only', () => {
    it('monthly, yearly and one-off library questions count by cadence; non-cash never', () => {
      const base = must(checkOnce(2_000_000, { itemType: { kind: 'preset', value: 'vehicle' } })).purchase;
      const c = checkOnce(2_000_000, {
        itemType: { kind: 'preset', value: 'vehicle' },
        extras: { insurance_monthly: mu(10000), maintenance_yearly: mu(24000), dealer_fees: mu(30000), loss_of_value: mu(99999) },
      });
      const p = must(c).purchase;
      expect(p.monthly - base.monthly).toBe(12000);
      expect(p.runningMonthly).toBe(12000);
      expect(p.dayOne - base.dayOne).toBe(30000);
      expect(p.whole).toBe(base.whole);
    });
    it('unknown ids are ignored; nothing is invented', () => {
      const base = must(checkOnce(50000)).purchase;
      const p = must(checkOnce(50000, { extras: { nonsense: mu(5000) } })).purchase;
      expect(p.monthly).toBe(base.monthly);
      expect(p.dayOne).toBe(base.dayOne);
      expect(base.monthly).toBe(0);
    });
    const custom: CustomOptions = {
      ...inputs.custom,
      itemTypes: [
        {
          id: 't1',
          base: 'general',
          questionIds: [],
          ownQuestions: [
            { id: 'own:parking', label: 'Parking', cadence: 'monthly', cash: true },
            { id: 'own:permit', label: 'Permit', cadence: 'yearly', cash: true },
            { id: 'own:setup', label: 'Setup', cadence: 'one_off', cash: true },
          ],
        },
        { id: 't2', base: 'general', questionIds: [], ownQuestions: [{ id: 'own:x', label: 'X', cadence: 'monthly', cash: false }] },
      ],
    };
    const ref = { kind: 'custom', id: 't1' } as const;
    it('own monthly question raises M by the typed amount', () => {
      const without = must(checkOnce(50000, { itemType: ref }), custom).purchase;
      const withIt = must(checkOnce(50000, { itemType: ref, extras: { 'own:parking': mu(4000) } }), custom).purchase;
      expect(withIt.monthly - without.monthly).toBe(4000);
    });
    it('own yearly adds a twelfth, own one-off adds to day one', () => {
      const without = must(checkOnce(50000, { itemType: ref }), custom).purchase;
      const y = must(checkOnce(50000, { itemType: ref, extras: { 'own:permit': mu(12000) } }), custom).purchase;
      expect(y.monthly - without.monthly).toBe(1000);
      const o = must(checkOnce(50000, { itemType: ref, extras: { 'own:setup': mu(700) } }), custom).purchase;
      expect(o.dayOne - without.dayOne).toBe(700);
      expect(o.monthly).toBe(without.monthly);
    });
    it('own question with cash false adds to neither', () => {
      const t2 = { kind: 'custom', id: 't2' } as const;
      const a = must(checkOnce(50000, { itemType: t2 }), custom).purchase;
      const b = must(checkOnce(50000, { itemType: t2, extras: { 'own:x': mu(5000) } }), custom).purchase;
      expect(b.monthly).toBe(a.monthly);
      expect(b.dayOne).toBe(a.dayOne);
    });
    it('a household share applies to the typed running cost', () => {
      const p = must(checkOnce(50000, { itemType: ref, share: even2, extras: { 'own:parking': mu(4000) } }), custom).purchase;
      expect(p.monthly).toBe(2000);
    });
  });

  describe('D-04 / D-24 missing facts', () => {
    const ok = { count: 12, apr: percent('0'), firstPayment: today };
    it('no first payment', () => {
      expect(build(checkPlan(120000, { ...ok, firstPayment: null })).missing).toEqual(['first_payment_not_chosen']);
    });
    it('pause interest not answered', () => {
      const b = build(checkPlan(120000, { ...ok, firstPayment: { kind: 'deferred', firstDate: '2026-12-03', interestDuringPause: null } }));
      expect(b.missing).toEqual(['pause_interest_not_answered']);
      expect(b.purchase).toBeNull();
    });
    it('no count and no term', () => {
      expect(build(checkPlan(120000, { ...ok, count: null, termMonths: null })).missing).toEqual(['plan_count_missing']);
    });
    it('term in months gives a count', () => {
      expect(build(checkPlan(120000, { ...ok, count: null, termMonths: 12 })).purchase?.schedule?.count).toBe(12);
    });
    it('no rate and no quote', () => {
      expect(build(checkPlan(120000, { ...ok, apr: null })).missing).toEqual(['plan_rate_missing']);
    });
    it('no price', () => {
      expect(build({ ...checkOnce(1), price: null }).missing).toEqual(['no_price']);
    });
    it('legacy invest check', () => {
      expect(build(checkOnce(1000, { legacyKind: 'invest' })).missing).toEqual(['legacy_invest_check']);
    });
    it('share that cannot resolve', () => {
      const bad = checkOnce(1000, { share: { kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'weight', weights: [0, 0] } } });
      expect(build(bad).missing).toEqual(['share_invalid']);
      expect(build(bad).purchase).toBeNull();
    });
    it('deferred interest term is a fact and changes no figure', () => {
      const a = must(checkPlan(120000, ok));
      const b = must(checkPlan(120000, { ...ok, deferredInterestTerm: true }));
      expect(b.facts.some((f) => f.code === 'deferred_interest_term')).toBe(true);
      expect(b.purchase).toEqual(a.purchase);
    });
  });

  it('overflow gives exceeds_range, not a throw', () => {
    const b = build(checkOnce(Number.MAX_SAFE_INTEGER, { oneOffFees: mu(Number.MAX_SAFE_INTEGER) }));
    expect(b.purchase).toBeNull();
    expect(b.reasons).toContain('exceeds_range');
  });

  describe('plan figures', () => {
    it('share convention 50/50: M is half the schedule monthly, never a quarter', () => {
      const b = must(checkPlan(240000, { count: 24, apr: percent('0'), firstPayment: { kind: 'one_period' } }, { share: even2 }));
      expect(b.purchase.schedule?.payment).toBe(10000);
      expect(b.purchase.monthly).toBe(5000);
    });
    it('day one = deposit + setup fee + first payment today', () => {
      const b = must(checkPlan(250000, { count: 10, apr: percent('0'), firstPayment: today, deposit: mu(10000), fees: { ...noFees, setup: mu(500) } }));
      // financed 240000 / 10 = 24000
      expect(b.purchase.schedule?.payment).toBe(24000);
      expect(b.purchase.dayOne).toBe(10000 + 500 + 24000);
      expect(b.planCard?.interest).toBe(0);
    });
    it('first payment one period on adds nothing to day one', () => {
      const b = must(checkPlan(250000, { count: 10, apr: percent('0'), firstPayment: { kind: 'one_period' }, deposit: mu(10000) }));
      expect(b.purchase.dayOne).toBe(10000);
    });
    it('trade-in reduces the financed amount', () => {
      const b = must(checkPlan(250000, { count: 10, apr: percent('0'), firstPayment: { kind: 'one_period' }, tradeIn: mu(50000) }));
      expect(b.purchase.schedule?.financed).toBe(200000);
    });
    it('secured and financed flags', () => {
      const b = must(checkPlan(250000, { count: 10, apr: percent('0'), firstPayment: today }, { itemType: { kind: 'preset', value: 'vehicle' } }));
      expect(b.purchase.secured).toBe(true);
      expect(b.purchase.financed).toBe(true);
      expect(must(checkOnce(100)).purchase.financed).toBe(false);
    });
  });

  describe('purchaseCashFlows: a first payment today is not counted twice', () => {
    it('total on asOf equals dayOne, later payments dated once each', () => {
      const b = must(checkPlan(250000, { count: 10, apr: percent('0'), firstPayment: today, deposit: mu(10000) }));
      const flows = purchaseCashFlows(b.purchase, ASOF, 400);
      const onToday = flows.filter((f) => f.date === ASOF).reduce((a, f) => a + f.amount, 0);
      expect(onToday).toBe(b.purchase.dayOne);
      expect(flows.reduce((a, f) => a + f.amount, 0)).toBe(10000 + 240000);
    });
    it('household share: flows still sum to my part of every payment', () => {
      const b = must(checkPlan(240000, { count: 12, apr: percent('0'), firstPayment: today }, { share: even2 }));
      const flows = purchaseCashFlows(b.purchase, ASOF, 400);
      expect(flows.reduce((a, f) => a + f.amount, 0)).toBe(120000);
    });
    it('a plan starting a period on has dayOne only from fees and deposit', () => {
      const b = must(checkPlan(120000, { count: 12, apr: percent('0'), firstPayment: { kind: 'one_period' } }));
      const flows = purchaseCashFlows(b.purchase, ASOF, 400);
      expect(flows.some((f) => f.date === ASOF)).toBe(false);
      expect(flows.reduce((a, f) => a + f.amount, 0)).toBe(120000);
    });
  });
});
