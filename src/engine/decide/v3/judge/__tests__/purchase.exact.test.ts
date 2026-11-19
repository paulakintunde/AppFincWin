import { MAX_CHECK_PRICE } from '../../constants';
import { currencyCode, minorUnits as mu } from '../../../../money/types';
import { percent } from '../../../../payoff/types';
import { ASOF, checkOnce, checkPlan, inputsOf } from '../../__tests__/helpers/fixtures';
import type { CheckV2 } from '../../types';
import { buildPurchase } from '../purchase';

// 05.4-59: operand-by-operand cases for buildPurchase.
const inputs = inputsOf();
const ctx = { asOf: ASOF, thresholds: inputs.thresholds, custom: inputs.custom, maxPrice: mu(MAX_CHECK_PRICE) };
const build = (c: CheckV2) => buildPurchase(c, ctx);
const must = (c: CheckV2) => {
  const b = build(c);
  if (b.purchase === null) throw new Error(`no purchase: ${b.missing.join(',')} ${b.reasons.join(',')}`);
  return { ...b, purchase: b.purchase };
};
const vehicle = { kind: 'preset', value: 'vehicle' } as const;

describe('05.4-59 purchase extras are read only when they are cash, positive and recurring or one-off', () => {
  const base = must(checkOnce(2_000_000, { itemType: vehicle })).purchase;
  it('a negative, fractional or zero typed amount adds nothing', () => {
    for (const bad of [-10_000, 1.5, 0]) {
      const p = must(checkOnce(2_000_000, { itemType: vehicle, extras: { insurance_monthly: bad as never } })).purchase;
      expect(p.monthly).toBe(base.monthly);
      expect(p.runningMonthly).toBe(base.runningMonthly);
      expect(p.dayOne).toBe(base.dayOne);
    }
  });
  it('a question with no cadence adds nothing even when it carries a number', () => {
    const plain = must(checkOnce(100_000, { itemType: { kind: 'preset', value: 'emergency_repair' } })).purchase;
    const p = must(checkOnce(100_000, { itemType: { kind: 'preset', value: 'emergency_repair' }, extras: { what_broke: mu(5_000) } })).purchase;
    expect(p.dayOne).toBe(plain.dayOne);
    expect(p.monthly).toBe(plain.monthly);
  });
  it('a non-cash question adds nothing to either figure', () => {
    const p = must(checkOnce(2_000_000, { itemType: vehicle, extras: { loss_of_value: mu(120_000) } })).purchase;
    expect(p.monthly).toBe(base.monthly);
    expect(p.dayOne).toBe(base.dayOne);
  });
  it('a modelled-elsewhere question adds nothing', () => {
    const p = must(checkOnce(2_000_000, { itemType: vehicle, extras: { sales_tax: mu(120_000) } })).purchase;
    expect(p.dayOne).toBe(base.dayOne);
  });
});

describe('05.4-59 purchase facts, layers and flags', () => {
  it('the foreign fact names the currency', () => {
    const b = must(checkOnce(100_000, { foreign: { currency: currencyCode('EUR'), atTodaysRate: true } }));
    expect(b.facts.find((f) => f.code === 'at_todays_rate')?.values).toEqual({ currency: 'EUR' });
  });
  it('a type with no questions and no own questions has no extras layer at a low band', () => {
    const b = must(checkOnce(1_000, { itemType: { kind: 'preset', value: 'rent_bill' } }));
    expect(b.purchase.band).toBe(1);
    expect(b.purchase.layers).toEqual(['L0']);
    expect(b.preview).toEqual({ band: 1, layers: ['L0'] });
    expect(must(checkOnce(1_000, { itemType: { kind: 'preset', value: 'general' } })).purchase.layers).toEqual(['L0', 'L4']);
  });
  it('only vehicle and property are secured', () => {
    const plan = (value: 'vehicle' | 'property' | 'general' | 'electronics' | 'rent_bill') =>
      must(checkPlan(250_000, { count: 10, apr: percent('0'), firstPayment: { kind: 'today' } }, { itemType: { kind: 'preset', value } })).purchase.secured;
    expect(plan('vehicle')).toBe(true);
    expect(plan('property')).toBe(true);
    expect(plan('general')).toBe(false);
    expect(plan('electronics')).toBe(false);
    expect(plan('rent_bill')).toBe(false);
  });
  it('a plan with a count of 0 asks for the count', () => {
    expect(build(checkPlan(120_000, { count: 0, apr: percent('0'), firstPayment: { kind: 'today' } })).missing).toEqual(['plan_count_missing']);
  });
  it('a deferred plan without the pause answer asks for it, and one with the answer does not', () => {
    const deferred = (interestDuringPause: boolean | null) =>
      build(checkPlan(120_000, { count: 12, apr: percent('0'), firstPayment: { kind: 'deferred', firstDate: '2026-12-03', interestDuringPause } }));
    expect(deferred(null).missing).toEqual(['pause_interest_not_answered']);
    expect(deferred(false).missing).toEqual([]);
    expect(deferred(true).missing).toEqual([]);
  });
  it('a deferred first date before today is passed; on today it is not', () => {
    const at = (firstDate: string) => build(checkPlan(120_000, { count: 12, apr: percent('0'), firstPayment: { kind: 'deferred', firstDate, interestDuringPause: false } }));
    expect(at('2026-10-02').missing).toEqual(['first_payment_passed']);
    expect(at(ASOF).missing).toEqual([]);
  });
  it('a plan with a deposit above the price finances nothing and does not go negative', () => {
    const b = must(checkPlan(100_000, { count: 10, apr: percent('0'), deposit: mu(150_000), firstPayment: { kind: 'one_period' } }));
    expect(b.purchase.schedule?.financed).toBe(0);
  });
});
