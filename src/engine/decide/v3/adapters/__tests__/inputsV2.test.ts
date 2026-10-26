import * as fc from 'fast-check';
import { minorUnits, type CurrencyCode, type MinorUnits } from '../../../../money/types';
import { percentFromScaled, type Percent } from '../../../../payoff/types';
import type { CheckV2, PayV2 } from '../../types';
import type { ShareScope } from '../../../share';
import { parseCheckV2, readStoredCheck, toStoredV2 } from '../inputsV2';

const money = fc.integer({ min: 0, max: 1_000_000_000_000 }).map((n) => minorUnits(n));
const pct = fc.bigInt({ min: 0n, max: 99_999_999_999_999n }).map((n) => percentFromScaled(n) as Percent);
const cadence = fc.record({ unit: fc.constantFrom('week' as const, 'month' as const), every: fc.integer({ min: 1, max: 12 }) });
const first = fc.oneof(
  fc.constant(null),
  fc.constant({ kind: 'today' as const }),
  fc.constant({ kind: 'one_period' as const }),
  fc.record({ kind: fc.constant('deferred' as const), firstDate: fc.constant('2026-12-01'), interestDuringPause: fc.constantFrom(true, false, null) }),
);
const pay: fc.Arbitrary<PayV2> = fc.oneof(
  fc.constant<PayV2>({ mode: 'once' }),
  fc.record({
    mode: fc.constant('plan' as const), cadence, count: fc.option(fc.integer({ min: 0, max: 600 }), { nil: null }),
    termMonths: fc.option(fc.integer({ min: 0, max: 600 }), { nil: null }), apr: fc.option(pct, { nil: null }),
    fees: fc.record({ setup: money, perPeriod: money, end: money }), deposit: money, tradeIn: money,
    quotedPayment: fc.option(money, { nil: null }), firstPayment: first, deferredInterestTerm: fc.boolean(),
  }),
);
const share: fc.Arbitrary<ShareScope> = fc.oneof(
  fc.constant<ShareScope>({ kind: 'personal' }),
  fc.constant<ShareScope>({ kind: 'household', memberCount: 3, myIndex: 1, rule: { kind: 'even' } }),
  fc.constant<ShareScope>({ kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'weight', weights: [1, 2] } }),
  fc.constant<ShareScope>({ kind: 'household', memberCount: 2, myIndex: 1, rule: { kind: 'amount', amounts: [minorUnits(5), minorUnits(7)] } }),
  fc.constant<ShareScope>({ kind: 'household', memberCount: 2, myIndex: 1, rule: { kind: 'mine' } }),
);
const checkArb: fc.Arbitrary<CheckV2> = fc.record({
  v: fc.constant(2 as const),
  legacyKind: fc.constantFrom('buy' as const, 'invest' as const),
  price: fc.option(money, { nil: null }),
  taxPercent: fc.option(pct, { nil: null }),
  oneOffFees: money,
  itemType: fc.oneof(
    fc.constant({ kind: 'preset' as const, value: 'electronics' as const }),
    fc.constant({ kind: 'preset' as const, value: 'general' as const }),
    fc.constant({ kind: 'custom' as const, id: 'ct1' }),
  ),
  categoryId: fc.option(fc.constant('cat1'), { nil: null }),
  purpose: fc.oneof(fc.constant(null), fc.constant({ kind: 'preset' as const, value: 'treat' as const }), fc.constant({ kind: 'custom' as const, id: 'p1' })),
  emergency: fc.boolean(),
  envelopeId: fc.option(fc.constant('env1'), { nil: null }),
  pay,
  extras: fc.dictionary(fc.constantFrom('q1', 'legacy:fuel', 'q2'), money) as fc.Arbitrary<Record<string, MinorUnits>>,
  value: fc.record({ earnsMonthly: fc.option(money, { nil: null }), savesMonthly: fc.option(money, { nil: null }), useYears: fc.option(fc.integer({ min: 0, max: 50 }), { nil: null }), cheaperPrice: fc.option(money, { nil: null }) }),
  share,
  foreign: fc.option(fc.constant({ currency: 'EUR' as CurrencyCode, atTodaysRate: true as const }), { nil: null }),
  layerAnswers: fc.constant({ L2: 'yes', n: 3 } as Record<string, unknown>),
});

describe('parseCheckV2', () => {
  it('I42 total over any JSON', () => {
    fc.assert(fc.property(fc.jsonValue(), (j) => { parseCheckV2(j); readStoredCheck(j); }), { numRuns: 300 });
  });

  it('I42 total over hostile v2 lookalikes', () => {
    const odd = fc.oneof(fc.jsonValue(), fc.integer(), fc.constant(NaN));
    fc.assert(
      fc.property(fc.record({ price: odd, taxPercent: odd, itemType: odd, purpose: odd, pay: odd, extras: odd, value: odd, share: odd, foreign: odd, layerAnswers: odd, categoryId: odd }), (j) => {
        const c = parseCheckV2({ v: 2, ...j });
        expect(c?.v).toBe(2);
        expect(JSON.stringify(toStoredV2(c!))).toBeDefined();
      }),
      { numRuns: 300 },
    );
  });

  it('returns null unless v is 2', () => {
    expect(parseCheckV2({ v: 1 })).toBeNull();
    expect(parseCheckV2(null)).toBeNull();
    expect(parseCheckV2({})).toBeNull();
  });

  it('round trips through toStoredV2 and JSON', () => {
    fc.assert(
      fc.property(checkArb, (c) => {
        const stored = JSON.parse(JSON.stringify(toStoredV2(c)));
        expect(parseCheckV2(stored)).toEqual(c);
      }),
      { numRuns: 300 },
    );
  });

  it('clamps and resets bad fields', () => {
    const c = parseCheckV2({
      v: 2, price: 1e30, taxPercent: 'abc', itemType: { kind: 'preset', value: 'bogus' }, purpose: { kind: 'preset', value: 'x' },
      pay: { mode: 'plan', cadence: { unit: 'day', every: 99 }, count: 9999, firstPayment: { kind: 'deferred', firstDate: 'soon' } },
      share: { kind: 'household', memberCount: 1 }, foreign: { currency: 'euro' }, extras: { a: -5, b: 'x' },
    })!;
    expect(c.price).toBe(1_000_000_000_000);
    expect(c.taxPercent).toBeNull();
    expect(c.itemType).toEqual({ kind: 'preset', value: 'general' });
    expect(c.purpose).toBeNull();
    expect(c.pay).toMatchObject({ mode: 'plan', cadence: { unit: 'month', every: 1 }, count: null, firstPayment: null });
    expect(c.share).toEqual({ kind: 'personal' });
    expect(c.foreign).toBeNull();
    expect(c.extras).toEqual({ a: 0 });
  });

  it('an unknown split rule resets the share to personal', () => {
    const c = parseCheckV2({ v: 2, share: { kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'bogus' } } })!;
    expect(c.share).toEqual({ kind: 'personal' });
  });

  it('readStoredCheck uses v2 as stored and upgrades the rest', () => {
    expect(readStoredCheck({ v: 2, price: 5 })).toMatchObject({ check: { price: 5 }, reasons: [] });
    expect(readStoredCheck({ method: 'cash', advertised: 5 }).reasons).toContain('legacy_upgraded');
  });
});
