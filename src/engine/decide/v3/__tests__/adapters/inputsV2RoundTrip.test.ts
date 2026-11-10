/**
 * 06.1-02 (Pitfall 1, ENG-29, FIN-29, D-12, D-21): a stored check reopens with exactly the values it was saved with, for every
 * Variant C field (running costs, closing percent, purchase date, what it replaces) and the D-21 quick-estimate lines.
 * Bad or oversized stored values fall back to safe defaults; parseCheckV2 stays total. T-06.1-02-01, T-06.1-02-02.
 */
import * as fc from 'fast-check';
import { minorUnits, type MinorUnits } from '../../../../money/types';
import { percentFromScaled, PERCENT_SCALE, type Percent } from '../../../../payoff/types';
import type { CheckV2, LocalDate, QuickLine, Replaces, RunningCostLine, StoppedCost } from '../../types';
import { parseCheckV2, readStoredCheck, toStoredV2 } from '../../adapters/inputsV2';

const money = fc.integer({ min: 0, max: 1_000_000_000_000 }).map((n) => minorUnits(n));
const positive = fc.integer({ min: 1, max: 1_000_000_000_000 }).map((n) => minorUnits(n));
const id = fc.string({ minLength: 1, maxLength: 80 });
const date: fc.Arbitrary<LocalDate> = fc
  .date({ min: new Date('2000-01-01T00:00:00Z'), max: new Date('2099-12-31T00:00:00Z'), noInvalidDate: true })
  .map((d) => d.toISOString().slice(0, 10));
// 0..10% as a scaled Percent (closing costs)
const closing = fc.bigInt({ min: 0n, max: 10n * PERCENT_SCALE }).map((n) => percentFromScaled(n) as Percent);
const name = fc.string({ maxLength: 80 }).map((s) => s.trim());
const every = fc.constantFrom(1 as const, 3 as const, 12 as const);

const runningCost: fc.Arbitrary<RunningCostLine> = fc
  .record({ id, amount: money, everyMonths: every, start: date, end: fc.option(date, { nil: null }), on: fc.boolean() })
  .map((l) => ({ ...l, end: l.end !== null && l.end < l.start ? null : l.end }));

const stop: fc.Arbitrary<StoppedCost> = fc.record({
  id, amount: money, everyMonths: every, stopDate: date,
  source: fc.oneof(
    fc.record({ kind: fc.constant('bill' as const), seriesId: id }),
    fc.record({ kind: fc.constant('everyday' as const), categoryId: fc.option(id, { nil: null }) }),
  ),
});

const replaces: fc.Arbitrary<Replaces | null> = fc.option(
  fc.record({
    stops: fc.array(stop, { maxLength: 8 }),
    sale: fc.option(fc.record({ amount: money, arrives: date, paysDebtId: fc.option(id, { nil: null }) }), { nil: null }),
  }),
  { nil: null },
);

const quickLine: fc.Arbitrary<QuickLine> = fc.oneof(
  fc.oneof(
    fc.record({ id, kind: fc.constant('expense' as const), name, amount: money, everyMonths: fc.constant(0 as const), date }),
    fc.record({ id, kind: fc.constant('expense' as const), name, amount: money, everyMonths: every, date: fc.option(date, { nil: null }) }),
  ),
  fc.record({ id, kind: fc.constant('loan' as const), name, monthly: positive, payments: fc.integer({ min: 1, max: 600 }), firstDate: fc.option(date, { nil: null }) }),
  fc.record({ id, kind: fc.constant('savings' as const), name, amount: money, usable: fc.boolean() }),
  fc.record({ id, kind: fc.constant('income' as const), name, amount: money, everyMonths: fc.constantFrom(0 as const, 1 as const), date }),
);

const BASE: CheckV2 = {
  v: 2, legacyKind: 'buy', price: minorUnits(120_000), taxPercent: null, oneOffFees: minorUnits(0),
  itemType: { kind: 'preset', value: 'general' }, categoryId: null, purpose: null, emergency: false, envelopeId: null,
  pay: { mode: 'once' }, extras: {}, value: { earnsMonthly: null, savesMonthly: null, useYears: null, cheaperPrice: null },
  share: { kind: 'personal' }, foreign: null, layerAnswers: {}, volatileCover: null, taxIncluded: null,
};

// D-12: "Need or want?" feeds check.purpose (need = necessity, want = nice_to_have); it never changes the answer
const purpose = fc.constantFrom<CheckV2['purpose']>(null, { kind: 'preset', value: 'necessity' }, { kind: 'preset', value: 'nice_to_have' });

/** Optional tail fields are present or absent independently, so checks without them must also round trip without undefined keys. */
const checkArb: fc.Arbitrary<CheckV2> = fc
  .record(
    {
      purpose,
      runningCosts: fc.array(runningCost, { maxLength: 12 }),
      closingPercent: fc.option(closing, { nil: null }),
      purchaseDate: fc.option(date, { nil: null }),
      replaces,
      quickLines: fc.array(quickLine, { maxLength: 8 }),
    },
    { requiredKeys: ['purpose'] },
  )
  .map((tail) => ({ ...BASE, ...tail }));

const roundTrip = (c: CheckV2): CheckV2 | null => parseCheckV2(JSON.parse(JSON.stringify(toStoredV2(c))));
const parse = (tail: Record<string, unknown>): CheckV2 => parseCheckV2({ v: 2, ...tail })!;

const RC = { id: 'r1', amount: 500, everyMonths: 1, start: '2026-12-01', end: null, on: true };
const STOP = { id: 's1', amount: 900, everyMonths: 1, stopDate: '2026-12-01', source: { kind: 'bill', seriesId: 'b1' } };
const SALE = { amount: 40_000, arrives: '2026-12-15', paysDebtId: null };

describe('06.1-02 stored check round trip (Pitfall 1)', () => {
  it('parseCheckV2(toStoredV2(c)) deep-equals c for every Variant C field and quick lines', () => {
    fc.assert(fc.property(checkArb, (c) => { expect(roundTrip(c)).toEqual(c); }), { numRuns: 400 });
  });

  it('a check without the optional tail gains no new keys', () => {
    const back = roundTrip(BASE)!;
    for (const k of ['runningCosts', 'closingPercent', 'purchaseDate', 'replaces', 'quickLines']) expect(back).not.toHaveProperty(k);
  });

  it('closingPercent is stored as exact decimal text, like taxPercent', () => {
    const stored = toStoredV2({ ...BASE, closingPercent: percentFromScaled(25n * PERCENT_SCALE / 10n) as Percent }) as Record<string, unknown>;
    expect(stored.closingPercent).toBe('2.5');
    expect((toStoredV2({ ...BASE, closingPercent: null }) as Record<string, unknown>).closingPercent).toBeNull();
  });

  it('stays total over hostile lookalikes of the new fields', () => {
    const odd = fc.oneof(fc.jsonValue(), fc.integer(), fc.constant(NaN));
    const oddList = fc.array(fc.oneof(odd, fc.dictionary(fc.constantFrom('id', 'kind', 'amount', 'everyMonths', 'start', 'end', 'date', 'name', 'monthly', 'payments', 'source', 'usable'), odd)), { maxLength: 20 });
    fc.assert(
      fc.property(fc.record({ runningCosts: fc.oneof(odd, oddList), closingPercent: odd, purchaseDate: odd, replaces: fc.oneof(odd, fc.record({ stops: fc.oneof(odd, oddList), sale: odd })), quickLines: fc.oneof(odd, oddList) }), (j) => {
        const c = parseCheckV2({ v: 2, ...j });
        expect(c?.v).toBe(2);
        expect(JSON.stringify(toStoredV2(c!))).toBeDefined();
      }),
      { numRuns: 300 },
    );
  });

  it('a v1 or unknown-v payload still returns null', () => {
    expect(parseCheckV2({ v: 1, runningCosts: [RC] })).toBeNull();
    expect(parseCheckV2({ v: 3, quickLines: [] })).toBeNull();
    expect(readStoredCheck({ v: 2, purchaseDate: '2027-01-01' }).check.purchaseDate).toBe('2027-01-01');
  });
});

describe('06.1-02 runningCosts', () => {
  it('drops lines with a bad cadence, amount, id or start date', () => {
    const bad = [
      { ...RC, everyMonths: 2 }, { ...RC, amount: -1 }, { ...RC, amount: 1.5 }, { ...RC, amount: '5' }, { ...RC, amount: 2e12 },
      { ...RC, start: '2026-02-31' }, { ...RC, start: 5 }, { ...RC, id: '' }, 'line', null,
    ];
    expect(parse({ runningCosts: bad }).runningCosts).toEqual([]);
  });

  it('an end before the start, or an invalid end, becomes no end', () => {
    expect(parse({ runningCosts: [{ ...RC, end: '2026-11-30' }] }).runningCosts![0]!.end).toBeNull();
    expect(parse({ runningCosts: [{ ...RC, end: 'soon' }] }).runningCosts![0]!.end).toBeNull();
    expect(parse({ runningCosts: [{ ...RC, end: '2026-12-01' }] }).runningCosts![0]!.end).toBe('2026-12-01');
  });

  it('on defaults to true; only false switches a line off', () => {
    expect(parse({ runningCosts: [{ ...RC, on: 'no' }] }).runningCosts![0]!.on).toBe(true);
    expect(parse({ runningCosts: [{ ...RC, on: false }] }).runningCosts![0]!.on).toBe(false);
  });

  it('keeps the first 12 lines; a non-list is treated as absent', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ ...RC, id: `r${i}` }));
    const kept = parse({ runningCosts: many }).runningCosts!;
    expect(kept).toHaveLength(12);
    expect(kept[11]!.id).toBe('r11');
    expect(parse({ runningCosts: 'x' })).not.toHaveProperty('runningCosts');
  });
});

describe('06.1-02 replaces', () => {
  it('caps stops at 8 and drops a stop with a bad source or fields', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ ...STOP, id: `s${i}` }));
    expect(parse({ replaces: { stops: many, sale: null } }).replaces!.stops).toHaveLength(8);
    const bad = [
      { ...STOP, source: { kind: 'bill', seriesId: '' } }, { ...STOP, source: { kind: 'other' } }, { ...STOP, source: null },
      { ...STOP, everyMonths: 6 }, { ...STOP, amount: -3 }, { ...STOP, stopDate: '2026-13-01' }, { ...STOP, id: 7 }, 3,
    ];
    expect(parse({ replaces: { stops: bad, sale: null } }).replaces!.stops).toEqual([]);
  });

  it('an everyday stop keeps a valid category id, else null', () => {
    const s = (categoryId: unknown) => parse({ replaces: { stops: [{ ...STOP, source: { kind: 'everyday', categoryId } }] } }).replaces!.stops[0]!.source;
    expect(s('c1')).toEqual({ kind: 'everyday', categoryId: 'c1' });
    expect(s('x'.repeat(81))).toEqual({ kind: 'everyday', categoryId: null });
  });

  it('a sale with a bad amount or date is no sale; an oversized debt id is no debt', () => {
    const sale = (x: unknown) => parse({ replaces: { stops: [], sale: x } }).replaces!.sale;
    expect(sale(SALE)).toEqual(SALE);
    expect(sale({ ...SALE, amount: -1 })).toBeNull();
    expect(sale({ ...SALE, arrives: 'later' })).toBeNull();
    expect(sale('sold')).toBeNull();
    expect(sale({ ...SALE, paysDebtId: 'd'.repeat(81) })).toEqual({ ...SALE, paysDebtId: null });
    expect(sale({ ...SALE, paysDebtId: 'd1' })).toEqual({ ...SALE, paysDebtId: 'd1' });
  });

  it('a non-record replaces is nothing; missing stops is an empty list', () => {
    expect(parse({ replaces: 'car' }).replaces).toBeNull();
    expect(parse({ replaces: null }).replaces).toBeNull();
    expect(parse({ replaces: {} }).replaces).toEqual({ stops: [], sale: null });
  });
});

describe('06.1-02 purchaseDate and closingPercent', () => {
  it('an invalid purchase date is null', () => {
    expect(parse({ purchaseDate: '2027-02-29' }).purchaseDate).toBeNull();
    expect(parse({ purchaseDate: 20270101 }).purchaseDate).toBeNull();
    expect(parse({ purchaseDate: '2027-03-01' }).purchaseDate).toBe('2027-03-01');
  });

  it('closingPercent goes through the taxPercent reader and cap', () => {
    expect(parse({ closingPercent: '3.5' }).closingPercent).toBe(percentFromScaled(35n * PERCENT_SCALE / 10n));
    expect(parse({ closingPercent: 'abc' }).closingPercent).toBeNull();
    expect(parse({ closingPercent: '99999' }).closingPercent).toBeNull();
    expect(parse({ closingPercent: 3.5 }).closingPercent).toBeNull();
  });
});

describe('06.1-02 quickLines (D-21)', () => {
  const ql = (x: unknown): readonly QuickLine[] => parse({ quickLines: [x] }).quickLines!;
  const EXP = { id: 'q1', kind: 'expense', name: 'Dentist', amount: 8000, everyMonths: 0, date: '2026-12-10' };

  it('drops an unknown kind, a bad id or a non-record', () => {
    expect(ql({ ...EXP, kind: 'gift' })).toEqual([]);
    expect(ql({ ...EXP, id: '' })).toEqual([]);
    expect(ql('x')).toEqual([]);
  });

  it('trims the name and cuts it to 80 characters; a missing name is empty', () => {
    expect(ql({ ...EXP, name: '  Dentist  ' })[0]!.name).toBe('Dentist');
    expect(ql({ ...EXP, name: `a${' '.repeat(78)}bcdef` })[0]!.name).toBe('a');
    expect(ql({ ...EXP, name: 'n'.repeat(120) })[0]!.name).toHaveLength(80);
    expect(ql({ ...EXP, name: 5 })[0]!.name).toBe('');
  });

  it('expense: cadence 0, 1, 3 or 12; a one-off needs a date', () => {
    expect(ql(EXP)).toHaveLength(1);
    expect(ql({ ...EXP, date: null })).toEqual([]);
    expect(ql({ ...EXP, everyMonths: 1, date: 'bad' })[0]).toMatchObject({ everyMonths: 1, date: null });
    expect(ql({ ...EXP, everyMonths: 6 })).toEqual([]);
    expect(ql({ ...EXP, amount: -1 })).toEqual([]);
  });

  it('loan: payments 1..600 and a monthly payment above 0', () => {
    const LOAN = { id: 'q2', kind: 'loan', name: 'Car', monthly: 25_000, payments: 36, firstDate: null };
    expect(ql(LOAN)).toEqual([LOAN]);
    expect(ql({ ...LOAN, firstDate: '2027-01-05' })[0]).toMatchObject({ firstDate: '2027-01-05' });
    expect(ql({ ...LOAN, firstDate: 'x' })[0]).toMatchObject({ firstDate: null });
    for (const payments of [0, 601, 2.5, '36']) expect(ql({ ...LOAN, payments })).toEqual([]);
    for (const monthly of [0, -5, 'x']) expect(ql({ ...LOAN, monthly })).toEqual([]);
  });

  it('savings: usable is true only when stored as true', () => {
    const SAV = { id: 'q3', kind: 'savings', name: 'ISA', amount: 300_000, usable: true };
    expect(ql(SAV)).toEqual([SAV]);
    expect(ql({ ...SAV, usable: 'yes' })[0]).toMatchObject({ usable: false });
    expect(ql({ ...SAV, amount: null })).toEqual([]);
  });

  it('income: cadence 0 or 1 with a valid date', () => {
    const INC = { id: 'q4', kind: 'income', name: 'Bonus', amount: 100_000, everyMonths: 0, date: '2027-03-31' };
    expect(ql(INC)).toEqual([INC]);
    expect(ql({ ...INC, everyMonths: 3 })).toEqual([]);
    expect(ql({ ...INC, date: null })).toEqual([]);
    expect(ql({ ...INC, amount: 1.25 })).toEqual([]);
  });

  it('keeps the first 8 lines; a non-list is treated as absent', () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ ...EXP, id: `q${i}` }));
    expect(parse({ quickLines: many }).quickLines).toHaveLength(8);
    expect(parse({ quickLines: { a: 1 } })).not.toHaveProperty('quickLines');
  });
});
