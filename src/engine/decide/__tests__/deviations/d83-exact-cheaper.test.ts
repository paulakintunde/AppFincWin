/**
 * D-83 (05-CONTEXT, UI-SPEC R15.6 / R15.7 E2): the alternatives' cheaper row takes an exact cheaper price in minor units,
 * not a whole-percent fraction. Typed figures scale by cheaper over price: a loan deposit half up (M4), a worked-out
 * instalment payment is recomputed by E1, a typed instalment amount keeps withPrice's ceil scaling (HI-03). The ratio is
 * for display only.
 */
import { minorUnits, type MinorUnits } from '../../../money/types';
import { percent } from '../../../payoff';
import { buildAlternatives } from '../../alternatives';
import { assessPlan, prepareContext } from '../../assess';
import { resolvePlanStrict, withPrice } from '../../plan';
import type { AssessContext, BuyCheck, DecideSnapshot, PurchaseCheck } from '../../types';
import { USD, buyCash, snapshotOf } from '../helpers/fixtures';

const m = minorUnits;

function ctxOf(s: DecideSnapshot): AssessContext {
  const r = prepareContext(s);
  if (!r.ok) throw new Error('expected ok');
  return r.context;
}

function altsOf(check: PurchaseCheck, cheaper?: number, snapshot: DecideSnapshot = snapshotOf()) {
  const context = ctxOf(snapshot);
  const assessment = assessPlan(context, check, resolvePlanStrict(check));
  return buildAlternatives(context, check, assessment, cheaper === undefined ? undefined : { price: cheaper as MinorUnits });
}

function instalments(price: number, payment: { amount: number | null; count: number; apr?: number }): BuyCheck {
  return {
    kind: 'buy',
    currency: USD,
    price: m(price),
    dayFees: m(0),
    itemType: 'general',
    runningCostsNet: m(0),
    payment: {
      method: 'instalment',
      instalmentAmount: payment.amount === null ? null : m(payment.amount),
      instalmentCount: payment.count,
      ...(payment.apr === undefined ? {} : { apr: percent(String(payment.apr)) }),
    },
  };
}

describe('D-83 exact cheaper price', () => {
  it('D-83 the cheaper row uses the exact cheaper price', () => {
    const check = buyCash(200_000);
    const a = altsOf(check, 123_456);
    const cheap = resolvePlanStrict(withPrice(check, m(123_456)));
    expect(a.cheaperPrice).toBe(123_456);
    expect(a.cheaper.notSpent).toBe(200_000 - 123_456);
    expect(a.cheaper.ratioPercent).toBe(62);
    expect(a.cheaper.monthlyPayment).toBe(cheap.monthly);
    expect(a.rows.find((r) => r.code === 'cheaper')!.dayOne).toBe(cheap.dayOne);
  });

  it('D-83 a loan deposit scales half up by cheaper over price', () => {
    const check: BuyCheck = {
      ...buyCash(1_000_001),
      payment: { method: 'loan', deposit: m(100_001), termMonths: 24, apr: percent('9') },
    };
    // 100,001 x 333,333 / 1,000,001 = 33,333.2... -> 33,333
    const a = altsOf(check, 333_333);
    const expected = resolvePlanStrict({
      ...(withPrice(check, m(333_333)) as BuyCheck),
      payment: { method: 'loan', deposit: m(33_333), termMonths: 24, apr: percent('9') },
    });
    expect(a.cheaper.monthlyPayment).toBe(expected.monthly);
    // a half rounds up: 5 x 3 / 2 -> deposit 7.5 -> 8
    const half: BuyCheck = { ...buyCash(1_000), payment: { method: 'loan', deposit: m(5), termMonths: 12, apr: percent('9') } };
    const halfAlts = altsOf(half, 500);
    const rounded = resolvePlanStrict({
      ...(withPrice(half, m(500)) as BuyCheck),
      payment: { method: 'loan', deposit: m(3), termMonths: 12, apr: percent('9') },
    });
    expect(halfAlts.cheaper.monthlyPayment).toBe(rounded.monthly);
    expect(rounded.dayOne).toBe(3);
  });

  it('D-83 a worked-out instalment payment is recomputed on the cheaper price', () => {
    const check = instalments(120_000, { amount: null, count: 12, apr: 12 });
    const a = altsOf(check, 90_000);
    const expected = resolvePlanStrict(withPrice(check, m(90_000)));
    expect(expected.computedPayment).not.toBeNull();
    expect(a.cheaper.monthlyPayment).toBe(expected.monthly);
    expect(a.cheaper.monthlyPayment).toBeLessThan(resolvePlanStrict(check).monthly);
  });

  it('D-83 a typed instalment amount keeps the ceil scaling so the instalments cover the price', () => {
    const check = instalments(180_000, { amount: 15_000, count: 12 });
    const a = altsOf(check, 100_001);
    expect(a.cheaper.monthlyPayment).toBe(8_334);
    expect(a.cheaper.monthlyPayment * 12).toBeGreaterThanOrEqual(100_001);
  });

  it('D-83 ratioPercent is display only', () => {
    const check = buyCash(300_000);
    // 100,000 / 300,000 = 33.33% -> 33, 200,000 / 300,000 = 66.67% -> 67; the figures follow the exact price
    expect(altsOf(check, 100_000).cheaper.ratioPercent).toBe(33);
    const a = altsOf(check, 200_000);
    expect(a.cheaper.ratioPercent).toBe(67);
    expect(a.cheaperPrice).toBe(200_000);
    expect(a.cheaper.notSpent).toBe(100_000);
  });

  it('D-83 without a cheaper price the 65% default applies', () => {
    const a = altsOf(buyCash(200_001));
    // 200,001 x 65 / 100 = 130,000.65 -> 130,001
    expect(a.cheaperPrice).toBe(130_001);
    expect(a.cheaper.ratioPercent).toBe(65);
  });

  it('D-83 a price of nothing has only itself as the cheaper version', () => {
    const a = altsOf(buyCash(0));
    expect(a.cheaperPrice).toBe(0);
    expect(a.cheaper.ratioPercent).toBe(100);
    expect(altsOf(buyCash(0), 0).cheaperPrice).toBe(0);
    const loan: BuyCheck = { ...buyCash(0), payment: { method: 'loan', deposit: m(0), termMonths: 12, apr: percent('9') } };
    expect(altsOf(loan).cheaperPrice).toBe(0);
  });

  it('D-83 a cheaper price outside 1..price is refused', () => {
    const check = buyCash(10_000);
    for (const bad of [0, -1, 10_001, 5.5, Number.NaN]) {
      expect(() => altsOf(check, bad)).toThrow(/^buildAlternatives: cheaper price/);
    }
    expect(altsOf(check, 1).cheaperPrice).toBe(1);
    expect(altsOf(check, 10_000).cheaperPrice).toBe(10_000);
  });
});
