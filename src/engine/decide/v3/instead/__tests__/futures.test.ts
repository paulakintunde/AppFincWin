import fc from 'fast-check';
import { minorUnits } from '../../../../money/types';
import { futureValueExact } from '../../../../payoff/futureValue';
import { percent, ZERO_PERCENT } from '../../../../payoff/types';
import { SOLE_SHARE } from '../../../share';
import type { Funds, MonthModel, Purchase, Result, Schedule } from '../../types';
import { buyLater, depositOfStream, FUTURE_ORDER, insteadFutures } from '../futures';

const mu = minorUnits;

function schedule(over: Partial<Schedule> = {}): Schedule {
  return {
    cadence: { unit: 'month', every: 1 },
    count: 24,
    payment: mu(8500),
    finalPayment: mu(8500),
    lastPaying: 24,
    firstDate: '2026-11-01',
    financed: mu(190000),
    pauseInterest: mu(0),
    totalPaid: mu(204000),
    totalInterest: mu(14000),
    fees: { setup: mu(0), perPeriod: mu(0), end: mu(0) },
    monthlyEquivalent: mu(8500),
    source: 'computed',
    ...over,
  };
}

const month = { month: '2026-10', typicalLeft: mu(42500) } as unknown as MonthModel;
const funds = { unspent: { value: mu(240000) } } as unknown as Funds;
const result = { code: 'fits_month', facts: [] } as unknown as Result;

function purchase(over: Partial<Purchase> = {}): Purchase {
  return {
    whole: mu(300000),
    dayOne: mu(300000),
    monthly: mu(0),
    schedule: null,
    share: SOLE_SHARE,
    ...over,
  } as unknown as Purchase;
}

describe('insteadFutures', () => {
  test('I26 fixed order, no rank or score', () => {
    const f = insteadFutures({ result, month, funds, purchase: purchase(), userRate: null, years: 5 });
    expect(FUTURE_ORDER).toEqual(['buy_now', 'keep', 'deposit', 'buy_later']);
    expect(f.order).toEqual(FUTURE_ORDER);
    expect(JSON.stringify(f, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))).not.toMatch(/rank|score/i);
  });

  test('C11 rate is the user own: null shows only 0%', () => {
    const f = insteadFutures({ result, month, funds, purchase: purchase(), userRate: null, years: 5 });
    expect(f.deposit.views.map((v) => v.rate)).toEqual([ZERO_PERCENT]);
  });

  test('C11 rate is the user own: 4.5% shows 0% and 4.5% only', () => {
    const rate = percent('4.5');
    const f = insteadFutures({ result, month, funds, purchase: purchase(), userRate: rate, years: 5 });
    expect(f.deposit.views.map((v) => v.rate)).toEqual([ZERO_PERCENT, rate]);
    expect(f.deposit.months).toBe(60);
    expect(f.deposit.views[1]!.value).toBe(Number(futureValueExact(mu(0), rate, 60, mu(300000))));
  });

  test('C11 payment stream: 24 x 8500 monthly', () => {
    const rate = percent('4.5');
    const s = schedule();
    const v = depositOfStream({ schedule: s, lump: mu(0), rate, months: 24 });
    const fv = futureValueExact(mu(8500), rate, 24, mu(0));
    expect(v.value).toBe(Number(fv));
    expect(v.interestGivenUp).toBe(Number(fv) - 24 * 8500 + 14000);
    const zero = depositOfStream({ schedule: s, lump: mu(0), rate: ZERO_PERCENT, months: 24 });
    expect(zero.value).toBe(204000);
    expect(zero.interestGivenUp).toBe(s.totalInterest);
  });

  test('financed purchase uses the schedule span and my part', () => {
    const f = insteadFutures({
      result,
      month,
      funds,
      purchase: purchase({ dayOne: mu(0), schedule: schedule() }),
      userRate: null,
      years: 5,
    });
    expect(f.deposit.months).toBe(24);
    expect(f.deposit.views[0]!.value).toBe(204000);
    expect(f.buyNow.planTotal).toBe(204000);
  });

  test('weekly stream converts to months', () => {
    const f = insteadFutures({
      result,
      month,
      funds,
      purchase: purchase({
        dayOne: mu(0),
        schedule: schedule({ cadence: { unit: 'week', every: 1 }, count: 52, monthlyEquivalent: mu(2000) }),
      }),
      userRate: null,
      years: 5,
    });
    expect(f.deposit.months).toBe(12);
    expect(f.deposit.views[0]!.value).toBe(24000);
  });

  test('buy now shows unspent after and emergency fund state', () => {
    const f = insteadFutures({ result, month, funds, purchase: purchase({ dayOne: mu(100000) }), userRate: null, years: 1 });
    expect(f.buyNow.unspentAfter).toBe(140000);
    expect(f.buyNow.emergencyUntouched).toBe(true);
    expect(f.keep.unspentKept).toBe(240000);
    const e = insteadFutures({
      result: { code: 'emergency_use', facts: [{ code: 'emergency_used', values: { used: 1, months: 1 } }] } as unknown as Result,
      month,
      funds,
      purchase: purchase(),
      userRate: null,
      years: 1,
    });
    expect(e.buyNow.emergencyUntouched).toBe(false);
  });
});

describe('insteadFutures edge cases', () => {
  const noUnspent = { unspent: null } as unknown as Funds;

  test('no confirmed unspent figure leaves unspent-based futures null', () => {
    const f = insteadFutures({ result, month, funds: noUnspent, purchase: purchase(), userRate: null, years: 1 });
    expect(f.buyNow.unspentAfter).toBeNull();
    expect(f.keep.unspentKept).toBeNull();
    expect(f.buyLater).toEqual({ months: null, readyBy: null, monthlyAmount: null });
  });

  test('a deposit figure past the safe range is left out, never shown wrong', () => {
    const f = insteadFutures({
      result, month, funds,
      purchase: purchase({ dayOne: mu(9_000_000_000_000) }),
      userRate: percent('9000'),
      years: 30,
    });
    expect(f.deposit.views.map((v) => v.rate)).toEqual([ZERO_PERCENT]);
  });

  test('an error that is not a range error is rethrown', () => {
    expect(() =>
      insteadFutures({
        result, month, funds,
        purchase: purchase({ dayOne: undefined as unknown as ReturnType<typeof mu> }),
        userRate: null,
        years: 1,
      })
    ).toThrow(TypeError);
  });
});

describe('buyLater', () => {
  test('no unspent figure gives nothing', () => {
    expect(buyLater({ price: mu(1000), unspent: null, typicalLeft: mu(500), month: '2026-10' })).toEqual({ months: null, readyBy: null, monthlyAmount: null });
  });

  test('v3 section 12 #16 buy later', () => {
    expect(buyLater({ price: mu(300000), unspent: mu(240000), typicalLeft: mu(42500), month: '2026-10' })).toEqual({
      months: 2,
      readyBy: '2026-12',
      monthlyAmount: 42500,
    });
  });

  test('typicalLeft <= 0 or unknown never fabricates a date', () => {
    for (const t of [mu(0), mu(-5), null]) {
      const r = buyLater({ price: mu(300000), unspent: mu(240000), typicalLeft: t, month: '2026-10' });
      expect(r.months).toBeNull();
      expect(r.readyBy).toBeNull();
    }
  });

  test('already covered is ready this month', () => {
    expect(buyLater({ price: mu(100), unspent: mu(240000), typicalLeft: mu(0), month: '2026-10' }).months).toBe(0);
  });

  test('I13 higher price never makes ready-by earlier', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5_000_000 }),
        fc.integer({ min: 0, max: 5_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 1, max: 100_000 }),
        (a, b, unspent, left) => {
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          const r1 = buyLater({ price: mu(lo), unspent: mu(unspent), typicalLeft: mu(left), month: '2026-10' });
          const r2 = buyLater({ price: mu(hi), unspent: mu(unspent), typicalLeft: mu(left), month: '2026-10' });
          if (r2.months === null) return true;
          return r1.months !== null && r1.months <= r2.months;
        }
      )
    );
  });
});

describe('H-03 one figure per screen', () => {
  test('H-03 monthly_short with an emergency segment: the fund is not untouched', () => {
    const r = { code: 'monthly_short', facts: [{ code: 'emergency_used', values: { used: 5000, months: 1 } }] } as unknown as Result;
    const f = insteadFutures({ result: r, month, funds, purchase: purchase(), userRate: null, years: 1 });
    expect(f.buyNow.emergencyUntouched).toBe(false);
  });

  test('H-03 unspent after is the judge fact when emitted', () => {
    const r = { code: 'fits_unspent', facts: [{ code: 'unspent_before_after', values: { before: 240000, after: 123456 } }] } as unknown as Result;
    const f = insteadFutures({ result: r, month, funds, purchase: purchase({ dayOne: mu(100000) }), userRate: null, years: 1 });
    expect(f.buyNow.unspentAfter).toBe(123456);
  });

  test('H-03 a non-numeric fact value falls back to unspent minus day one', () => {
    const r = { code: 'not_yet', facts: [{ code: 'unspent_before_after', values: { before: 1 } }] } as unknown as Result;
    const f = insteadFutures({ result: r, month, funds, purchase: purchase({ dayOne: mu(100000) }), userRate: null, years: 1 });
    expect(f.buyNow.unspentAfter).toBe(140000);
  });

  test('D-38 available unspent is read when present', () => {
    const fa = { unspent: { value: mu(240000), available: mu(200000) } } as unknown as Funds;
    const f = insteadFutures({ result, month, funds: fa, purchase: purchase({ dayOne: mu(100000) }), userRate: null, years: 1 });
    expect(f.buyNow.unspentAfter).toBe(100000);
    expect(f.keep.unspentKept).toBe(200000);
  });

  test('L-07 deposit horizon is integer months with no years field', () => {
    const f = insteadFutures({ result, month, funds, purchase: purchase(), userRate: null, years: 3 });
    expect(Number.isInteger(f.deposit.months)).toBe(true);
    expect('years' in f.deposit).toBe(false);
  });
});
