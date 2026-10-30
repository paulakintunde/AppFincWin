import { parseCheckV2, toStoredV2 } from '@/engine/decide/v3';
import type { CheckV2 } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';
import { percent } from '@/engine/payoff';
import {
  emptyCheck, withDeposit, withEmergency, withExtra, withItemType, withLayerAnswer, withPayMode, withPlan,
  withPrice, withPurpose, withTaxPercent, withValue,
} from '../checkEdits';

jest.setTimeout(60000);

const m = minorUnits;
const deepFreeze = <T,>(o: T): T => {
  if (typeof o === 'object' && o !== null) {
    Object.values(o as object).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
};
const planCheck = (): CheckV2 => withPayMode(emptyCheck(), 'plan');
const treat = { kind: 'preset', value: 'treat' } as const;
const necessity = { kind: 'preset', value: 'necessity' } as const;

describe('emptyCheck', () => {
  it('matches the parseCheckV2 defaults', () => {
    const c = emptyCheck();
    expect(c).toEqual(parseCheckV2({ v: 2 }));
    expect(c.itemType).toEqual({ kind: 'preset', value: 'general' });
    expect(c.pay).toEqual({ mode: 'once' });
    expect(c.purpose).toBeNull();
  });
});

describe('withPrice', () => {
  it('sets, clears and rejects bad prices', () => {
    expect(withPrice(emptyCheck(), m(120000)).price).toBe(120000);
    expect(withPrice(withPrice(emptyCheck(), m(5)), null).price).toBeNull();
    expect(() => withPrice(emptyCheck(), -1 as never)).toThrow(RangeError);
    expect(() => withPrice(emptyCheck(), Number.MAX_SAFE_INTEGER + 2 as never)).toThrow(RangeError);
  });
  it('does not change a frozen input', () => {
    const c = deepFreeze(emptyCheck());
    expect(withPrice(c, m(1))).not.toBe(c);
    expect(c.price).toBeNull();
  });
});

describe('withItemType', () => {
  it('sets the item type', () => {
    expect(withItemType(emptyCheck(), { kind: 'preset', value: 'vehicle' }).itemType).toEqual({ kind: 'preset', value: 'vehicle' });
  });
});

describe('I43 pay mode and plan', () => {
  it('gives the default plan', () => {
    expect(planCheck().pay).toEqual({
      mode: 'plan', cadence: { unit: 'month', every: 1 }, count: null, termMonths: null, apr: null,
      fees: { setup: 0, perPeriod: 0, end: 0 }, deposit: 0, tradeIn: 0, quotedPayment: null, firstPayment: null,
      deferredInterestTerm: false,
    });
  });
  it('I43: restores the plan after once and back', () => {
    const apr = percent('6.9');
    const edited = withPlan(planCheck(), { termMonths: 36, apr });
    const once = withPayMode(edited, 'once');
    expect(once.pay).toEqual({ mode: 'once' });
    expect(once.layerAnswers['L3.plan']).toBeDefined();
    const back = withPayMode(once, 'plan');
    expect(back.pay.mode === 'plan' && back.pay.termMonths).toBe(36);
    expect(back.pay.mode === 'plan' && back.pay.apr).toBe(apr);
    expect(parseCheckV2(toStoredV2(once))).toEqual(once);
  });
  it('keeps the deposit through once and back', () => {
    const c = withPayMode(withDeposit(planCheck(), m(500000)), 'once');
    const back = withPayMode(c, 'plan');
    expect(back.pay.mode === 'plan' && back.pay.deposit).toBe(500000);
  });
  it('falls back to the default plan when the saved plan is unreadable', () => {
    const c = withLayerAnswer(emptyCheck(), 'L3.plan', { mode: 'once' });
    expect(withPayMode(c, 'plan').pay).toEqual(planCheck().pay);
    expect(withPayMode(withLayerAnswer(emptyCheck(), 'L3.plan', 'junk'), 'plan').pay.mode).toBe('plan');
  });
  it('returns the same check when the mode is unchanged', () => {
    const c = emptyCheck();
    expect(withPayMode(c, 'once')).toBe(c);
  });
  it('patches the plan and validates it', () => {
    const c = withPlan(planCheck(), {
      count: 12, quotedPayment: m(9000), fees: { setup: m(1), perPeriod: m(2), end: m(3) }, deferredInterestTerm: true,
      cadence: { unit: 'week', every: 2 }, firstPayment: { kind: 'today' },
    });
    expect(c.pay.mode === 'plan' && c.pay.count).toBe(12);
    expect(c.pay.mode === 'plan' && c.pay.fees.end).toBe(3);
    const cleared = withPlan(c, { count: null, termMonths: null, apr: null, quotedPayment: null });
    expect(cleared.pay.mode === 'plan' && cleared.pay.quotedPayment).toBeNull();
    expect(() => withPlan(planCheck(), { termMonths: -1 })).toThrow(RangeError);
    expect(() => withPlan(planCheck(), { count: 601 })).toThrow(RangeError);
    expect(() => withPlan(planCheck(), { count: 1.5 })).toThrow(RangeError);
    expect(() => withPlan(planCheck(), { apr: percent('10000') })).toThrow(RangeError);
    expect(() => withPlan(planCheck(), { quotedPayment: -5 as never })).toThrow(RangeError);
    expect(() => withPlan(planCheck(), { fees: { setup: m(0), perPeriod: -1 as never, end: m(0) } })).toThrow(RangeError);
    expect(() => withPlan(emptyCheck(), { termMonths: 3 })).toThrow(RangeError);
  });
});

describe('M-08 tax and deposit', () => {
  it('M-08: tax goes to taxPercent, never extras', () => {
    const c = withTaxPercent(emptyCheck(), percent('8.25'));
    expect(c.taxPercent).toBe(percent('8.25'));
    expect(c.extras).not.toHaveProperty('sales_tax');
    expect(withTaxPercent(c, null).taxPercent).toBeNull();
    expect(() => withTaxPercent(c, -1n as never)).toThrow(RangeError);
  });
  it('M-08: deposit goes to pay.deposit, only in a plan', () => {
    const c = withDeposit(planCheck(), m(500000));
    expect(c.pay.mode === 'plan' && c.pay.deposit).toBe(500000);
    expect(c.extras).not.toHaveProperty('deposit');
    expect(() => withDeposit(emptyCheck(), m(1))).toThrow(RangeError);
    expect(() => withDeposit(planCheck(), -1 as never)).toThrow(RangeError);
  });
  it('M-08: withExtra refuses sales_tax and deposit', () => {
    expect(() => withExtra(emptyCheck(), 'sales_tax', m(100))).toThrow(RangeError);
    expect(() => withExtra(emptyCheck(), 'deposit', m(100))).toThrow(RangeError);
  });
});

describe('withExtra', () => {
  it('sets, removes, and refuses yes_no / date ids', () => {
    const c = withExtra(emptyCheck(), 'dealer_fees', m(49900));
    expect(c.extras.dealer_fees).toBe(49900);
    expect(withExtra(c, 'dealer_fees', null).extras).not.toHaveProperty('dealer_fees');
    expect(() => withExtra(emptyCheck(), 'rent_stops', m(1))).toThrow(RangeError);
    expect(() => withExtra(emptyCheck(), 'due_date', m(1))).toThrow(RangeError);
    expect(() => withExtra(emptyCheck(), 'dealer_fees', -1 as never)).toThrow(RangeError);
  });
  it('allows an own-question id the library does not know', () => {
    expect(withExtra(emptyCheck(), 'own-1', m(5)).extras['own-1']).toBe(5);
  });
});

describe('D-18 value and layer answers', () => {
  it('D-18: value fields change one at a time and never touch extras', () => {
    const c = withValue(emptyCheck(), { useYears: 5 });
    expect(c.value).toEqual({ earnsMonthly: null, savesMonthly: null, useYears: 5, cheaperPrice: null });
    const d = withValue(c, { earnsMonthly: m(1), savesMonthly: m(2), cheaperPrice: m(3) });
    expect(d.value).toEqual({ earnsMonthly: 1, savesMonthly: 2, useYears: 5, cheaperPrice: 3 });
    expect(withValue(d, { useYears: null }).value.useYears).toBeNull();
    expect(d.extras).toEqual({});
    expect(() => withValue(c, { useYears: -1 })).toThrow(RangeError);
    expect(() => withValue(c, { useYears: 201 })).toThrow(RangeError);
    expect(() => withValue(c, { useYears: Number.NaN })).toThrow(RangeError);
    expect(() => withValue(c, { earnsMonthly: -1 as never })).toThrow(RangeError);
  });
  it('D-18: L2, L6 and L7 answers are stored only, never in extras', () => {
    let c = withLayerAnswer(emptyCheck(), 'L2.alternative', 'cheaper');
    c = withLayerAnswer(c, 'L6.closing', 250000);
    c = withLayerAnswer(c, 'L6.moving', 90000);
    c = withLayerAnswer(c, 'L7.sources', [{ source: 'savings', amount: 1000 }]);
    expect(c.layerAnswers['L6.closing']).toBe(250000);
    expect(c.extras).toEqual({});
    expect(parseCheckV2(toStoredV2(c))).toEqual(c);
  });
  it('removes an answer on undefined and rejects a key without a layer', () => {
    const c = withLayerAnswer(emptyCheck(), 'L4.rent_stops', true);
    expect(withLayerAnswer(c, 'L4.rent_stops', undefined).layerAnswers).toEqual({});
    expect(() => withLayerAnswer(c, 'closing', 1)).toThrow(RangeError);
  });
  it('I43: answers to a hidden layer are kept when the item type changes', () => {
    const c = withLayerAnswer(emptyCheck(), 'L6.keepYears', 7);
    expect(withItemType(c, { kind: 'preset', value: 'vehicle' }).layerAnswers['L6.keepYears']).toBe(7);
  });
});

describe('purpose and emergency', () => {
  it('a treat purpose clears emergency; necessity keeps it', () => {
    const e = withEmergency(withPurpose(emptyCheck(), necessity), true);
    expect(e.emergency).toBe(true);
    expect(withPurpose(e, necessity).emergency).toBe(true);
    expect(withPurpose(e, treat).emergency).toBe(false);
    expect(withPurpose(e, null).purpose).toBeNull();
  });
  it('emergency true needs an emergency purpose; false is always allowed', () => {
    expect(() => withEmergency(withPurpose(emptyCheck(), treat), true)).toThrow(RangeError);
    expect(withEmergency(withPurpose(emptyCheck(), treat), false).emergency).toBe(false);
  });
});
