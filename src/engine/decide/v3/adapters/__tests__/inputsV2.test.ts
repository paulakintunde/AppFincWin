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
  layerAnswers: fc.constant({ L2: 'yes', 'L3.n': 3 } as Record<string, unknown>),
  volatileCover: fc.constantFrom(true, false, null),
  taxIncluded: fc.constantFrom(true, false, null), // 05.4 FIN-27
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

  it('L-01 an impossible stored date drops the first payment', () => {
    const c = parseCheckV2({ v: 2, pay: { mode: 'plan', firstPayment: { kind: 'deferred', firstDate: '2026-02-31', interestDuringPause: true } } })!;
    expect(c.pay).toMatchObject({ mode: 'plan', firstPayment: null });
  });

  it('L-02 layerAnswers keys without a layer prefix are dropped, never thrown', () => {
    const c = parseCheckV2({ v: 2, layerAnswers: { 'L2.x': 1, stray: 2 } })!;
    expect(c.layerAnswers).toEqual({ 'L2.x': 1 });
    expect(parseCheckV2({ v: 2, layerAnswers: 5 })!.layerAnswers).toEqual({});
  });

  it('D-48 volatileCover is true, false or null and round trips', () => {
    expect(parseCheckV2({ v: 2, volatileCover: true })!.volatileCover).toBe(true);
    expect(parseCheckV2({ v: 2, volatileCover: false })!.volatileCover).toBe(false);
    expect(parseCheckV2({ v: 2 })!.volatileCover).toBeNull();
    expect(parseCheckV2({ v: 2, volatileCover: 'yes' })!.volatileCover).toBeNull();
    const c = parseCheckV2({ v: 2, volatileCover: false })!;
    expect(parseCheckV2(JSON.parse(JSON.stringify(toStoredV2(c))))!.volatileCover).toBe(false);
  });

  it('05.4 FIN-27 taxIncluded (the "Price already includes tax" switch) is true, false or null and round trips', () => {
    expect(parseCheckV2({ v: 2, taxIncluded: true })!.taxIncluded).toBe(true);
    expect(parseCheckV2({ v: 2, taxIncluded: false })!.taxIncluded).toBe(false);
    expect(parseCheckV2({ v: 2 })!.taxIncluded).toBeNull();
    expect(parseCheckV2({ v: 2, taxIncluded: 'on' })!.taxIncluded).toBeNull();
    const c = parseCheckV2({ v: 2, taxIncluded: true })!;
    expect(parseCheckV2(JSON.parse(JSON.stringify(toStoredV2(c))))!.taxIncluded).toBe(true);
  });

  it('05.4 D-39c / D-143: a plan keeps its home-loan mark; only true counts, and it round trips', () => {
    const plan = (housing: unknown) => parseCheckV2({ v: 2, pay: { mode: 'plan', housing } })!.pay;
    expect(plan(true)).toMatchObject({ mode: 'plan', housing: true });
    for (const other of [false, null, undefined, 'yes', 1]) expect(plan(other)).not.toHaveProperty('housing');
    // a pay-once check never carries it
    expect(parseCheckV2({ v: 2, pay: { mode: 'once', housing: true } })!.pay).toEqual({ mode: 'once' });
    const c = parseCheckV2({ v: 2, pay: { mode: 'plan', housing: true } })!;
    expect(parseCheckV2(JSON.parse(JSON.stringify(toStoredV2(c))))!.pay).toMatchObject({ housing: true });
    expect(readStoredCheck({ v: 2, pay: { mode: 'plan', housing: true } }).check.pay).toMatchObject({ housing: true });
  });

  it('08.1-11 FIN-12: the end date and the rate after it are kept only when asked for (null = asked, not given), and round trip', () => {
    const plan = (extra: Record<string, unknown>) => parseCheckV2({ v: 2, pay: { mode: 'plan', deferredInterestTerm: true, ...extra } })!.pay;
    const none = plan({});
    expect(none).not.toHaveProperty('promoEnd');
    expect(none).not.toHaveProperty('rateAfter');
    expect(plan({ promoEnd: '2027-11-15', rateAfter: '24.99' })).toMatchObject({ promoEnd: '2027-11-15', rateAfter: percentFromScaled(249_900_000_000n) });
    expect(plan({ promoEnd: 'soon', rateAfter: 'lots' })).toMatchObject({ promoEnd: null, rateAfter: null });
    expect(plan({ promoEnd: 5, rateAfter: null })).toMatchObject({ promoEnd: null, rateAfter: null });
    const c = parseCheckV2({ v: 2, pay: { mode: 'plan', deferredInterestTerm: true, promoEnd: '2027-11-15', rateAfter: '24.99' } })!;
    expect(parseCheckV2(JSON.parse(JSON.stringify(toStoredV2(c))))!.pay).toEqual(c.pay);
    const asked = parseCheckV2({ v: 2, pay: { mode: 'plan', deferredInterestTerm: true, promoEnd: null, rateAfter: null } })!;
    expect(parseCheckV2(JSON.parse(JSON.stringify(toStoredV2(asked))))!.pay).toEqual(asked.pay);
  });

  it('an unknown split rule resets the share to personal', () => {
    const c = parseCheckV2({ v: 2, share: { kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'bogus' } } })!;
    expect(c.share).toEqual({ kind: 'personal' });
  });

  it('bad ids, cadences and split lists reset to their defaults', () => {
    expect(parseCheckV2({ v: 2, itemType: { kind: 'custom', id: '' } })!.itemType).toEqual({ kind: 'preset', value: 'general' });
    expect(parseCheckV2({ v: 2, purpose: { kind: 'custom', id: '' } })!.purpose).toBeNull();
    expect(parseCheckV2({ v: 2, pay: { mode: 'plan', cadence: 5 } })!.pay).toMatchObject({ cadence: { unit: 'month', every: 1 } });
    const hh = (rule: unknown) => parseCheckV2({ v: 2, share: { kind: 'household', memberCount: 2, myIndex: 0, rule } })!.share;
    expect(hh({ kind: 'weight', weights: [1, 'x'] })).toEqual({ kind: 'personal' });
    expect(hh({ kind: 'amount', amounts: [1, 'x'] })).toEqual({ kind: 'personal' });
  });

  it('readStoredCheck uses v2 as stored and upgrades the rest', () => {
    expect(readStoredCheck({ v: 2, price: 5 })).toMatchObject({ check: { price: 5 }, reasons: [] });
    expect(readStoredCheck({ method: 'cash', advertised: 5 }).reasons).toContain('legacy_upgraded');
  });
});

describe('parseCheckV2 boundaries (05.4-62 mutation kills)', () => {
  const parse = (over: Record<string, unknown>) => parseCheckV2({ v: 2, ...over })!;

  it('foreign currency is 2 to 4 capitals or digits', () => {
    const f = (currency: unknown) => parse({ foreign: { currency } }).foreign;
    expect(f('EUR')).toEqual({ currency: 'EUR', atTodaysRate: true });
    expect(f('EU')).toEqual({ currency: 'EU', atTodaysRate: true });
    expect(f('AB12')).toEqual({ currency: 'AB12', atTodaysRate: true });
    for (const bad of ['E', 'EURO1', 'eur', 'EU-', '', 5]) expect(f(bad)).toBeNull();
  });

  it('ids are 1 to 80 characters', () => {
    expect(parse({ categoryId: 'a'.repeat(80) }).categoryId).toBe('a'.repeat(80));
    expect(parse({ categoryId: 'a'.repeat(81) }).categoryId).toBeNull();
    expect(parse({ categoryId: '' }).categoryId).toBeNull();
    expect(parse({ categoryId: 'a' }).categoryId).toBe('a');
  });

  it('item type and purpose need the right kind as well as the value', () => {
    expect(parse({ itemType: { kind: 'bogus', value: 'electronics' } }).itemType).toEqual({ kind: 'preset', value: 'general' });
    expect(parse({ itemType: { kind: 'preset', value: 'electronics' } }).itemType).toEqual({ kind: 'preset', value: 'electronics' });
    expect(parse({ purpose: { kind: 'bogus', value: 'treat' } }).purpose).toBeNull();
    expect(parse({ purpose: { kind: 'preset', value: 'treat' } }).purpose).toEqual({ kind: 'preset', value: 'treat' });
  });

  it('a deferred first payment needs kind, a string date and reads the pause flag', () => {
    const fp = (firstPayment: unknown) => (parse({ pay: { mode: 'plan', firstPayment } }).pay as { firstPayment: unknown }).firstPayment;
    expect(fp({ kind: 'bogus', firstDate: '2026-12-01' })).toBeNull();
    expect(fp({ kind: 'deferred' })).toBeNull();
    expect(fp({ kind: 'deferred', firstDate: 20261201 })).toBeNull();
    expect(fp({ kind: 'deferred', firstDate: '2026-12-01', interestDuringPause: 'yes' })).toEqual({ kind: 'deferred', firstDate: '2026-12-01', interestDuringPause: null });
    expect(fp({ kind: 'deferred', firstDate: '2026-12-01', interestDuringPause: false })).toEqual({ kind: 'deferred', firstDate: '2026-12-01', interestDuringPause: false });
    expect(fp(5)).toBeNull();
  });

  it('a split rule needs its kind and its list', () => {
    const hh = (rule: unknown) => parse({ share: { kind: 'household', memberCount: 2, myIndex: 0, rule } }).share;
    expect(hh({ kind: 'weight' })).toEqual({ kind: 'personal' });
    expect(hh({ kind: 'bogus', weights: [1, 2] })).toEqual({ kind: 'personal' });
    expect(hh({ kind: 'amount' })).toEqual({ kind: 'personal' });
    expect(hh({ kind: 'bogus', amounts: [1, 2] })).toEqual({ kind: 'personal' });
    expect(hh({ kind: 'weight', weights: [1, 2] })).toEqual({ kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'weight', weights: [1, 2] } });
    expect(hh({ kind: 'amount', amounts: [1, 2] })).toMatchObject({ rule: { kind: 'amount', amounts: [1, 2] } });
  });

  it('my index runs from 0 to the member count minus one', () => {
    const at = (memberCount: number, myIndex: number) => parse({ share: { kind: 'household', memberCount, myIndex, rule: { kind: 'even' } } }).share;
    expect(at(2, 1)).toEqual({ kind: 'household', memberCount: 2, myIndex: 1, rule: { kind: 'even' } });
    expect(at(2, 2)).toEqual({ kind: 'personal' });
    expect(at(3, 3)).toEqual({ kind: 'personal' });
    expect(at(20, 19)).toMatchObject({ kind: 'household', myIndex: 19 });
  });

  it('extras keys are 1 to 80 characters and need a number', () => {
    const k80 = 'k'.repeat(80);
    expect(parse({ extras: { [k80]: 5, ['k'.repeat(81)]: 6, '': 7, x: 'no', y: 8 } }).extras).toEqual({ [k80]: 5, y: 8 });
  });

  it('a note name is trimmed, cut to 80 and trimmed again', () => {
    const name = (n: unknown) => (parse({ quickLines: [{ id: 'q', kind: 'savings', amount: 1, name: n }] }).quickLines as unknown as { name: string }[])[0]!.name;
    expect(name('   ' + 'a'.repeat(100))).toBe('a'.repeat(80));
    expect(name('a'.repeat(79) + ' ' + 'b'.repeat(10))).toBe('a'.repeat(79));
    expect(name('  hi  ')).toBe('hi');
    expect(name(5)).toBe('');
  });

  it('a stopped cost source needs the bill kind for a series id', () => {
    const stop = (source: unknown) => (parse({ replaces: { stops: [{ id: 's', amount: 1, everyMonths: 1, stopDate: '2026-12-01', source }] } }).replaces as unknown as { stops: unknown[] }).stops;
    expect(stop({ kind: 'bogus', seriesId: 'b1' })).toEqual([]);
    expect(stop({ kind: 'bill', seriesId: 'b1' })).toEqual([{ id: 's', amount: 1, everyMonths: 1, stopDate: '2026-12-01', source: { kind: 'bill', seriesId: 'b1' } }]);
    expect(stop({ kind: 'bill' })).toEqual([]);
    expect(stop({ kind: 'everyday', categoryId: 'c' })).toHaveLength(1);
  });
});
