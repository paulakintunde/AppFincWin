import fc from 'fast-check';
import { MAX_ABS_AMOUNT_MINOR, minorUnits, type NumberNotation } from '../../money';
import {
  foreignFromColumns,
  foreignFromOfx,
  impliedRate,
  isFxFeeDescription,
  linkFxFees,
  parseForeignNote,
  type FeeLinkRow,
} from '../foreign';

const EXP: Record<string, number> = { USD: 2, CAD: 2, GBP: 2, AUD: 2, EUR: 2, NZD: 2, JPY: 0, KWD: 3 };
const exponentFor = (c: string): number | null => (c in EXP ? (EXP[c] as number) : null);
const dot: NumberNotation = { decimal: '.', group: ',', grouping: 'western' };
const comma: NumberNotation = { decimal: ',', group: '.', grouping: 'western' };
const opts = { notation: dot, exponentFor };

describe('parseForeignNote', () => {
  it.each([
    ['USD 45.00 @ 1.2718', 'USD', 4500, 'USD 45.00'],
    ['45.00 USD', 'USD', 4500, '45.00 USD'],
    ['usd 45.00', 'USD', 4500, 'usd 45.00'],
    ['US$45.00', 'USD', 4500, 'US$45.00'],
    ['C$13.92', 'CAD', 1392, 'C$13.92'],
    ['A$5.00', 'AUD', 500, 'A$5.00'],
    ['€12.50', 'EUR', 1250, '€12.50'],
    ['£ 3.00', 'GBP', 300, '£ 3.00'],
    ['  JPY 500 ', 'JPY', 500, 'JPY 500'],
    ['USD -45.00', 'USD', 4500, 'USD -45.00'],
  ])('reads %s', (text, currency, magnitude, raw) => {
    expect(parseForeignNote(text, opts)).toEqual({ magnitude, currency, raw });
  });

  it('honours the comma notation', () => {
    expect(parseForeignNote('EUR 1.234,50', { notation: comma, exponentFor })).toEqual({
      magnitude: 123450,
      currency: 'EUR',
      raw: 'EUR 1.234,50',
    });
  });

  it.each(['$10.00', '¥500', 'ACME GROCERS', '45.00', 'XXX 10.00', '', 'USD', 'USD abc', 'USD 0.00', '10.00 ACME'])(
    'rejects %j',
    (text) => {
      expect(parseForeignNote(text, opts)).toBeNull();
    }
  );

  it('rejects an amount above the limit', () => {
    expect(parseForeignNote('USD 999999999999999.00', opts)).toBeNull();
    expect(parseForeignNote(`JPY ${MAX_ABS_AMOUNT_MINOR + 1}`, opts)).toBeNull();
  });

  it('ignores overlong input tails', () => {
    const r = parseForeignNote(`USD 45.00 ${'x'.repeat(1000)}`, opts);
    expect(r?.magnitude).toBe(4500);
  });
});

describe('foreignFromOfx', () => {
  const base = { trnAmtMagnitude: minorUnits(1392), accountExponent: 2, curRate: '1.392', curSym: 'USD' };

  it('origcurrency: the foreign amount is TRNAMT / CURRATE', () => {
    expect(foreignFromOfx({ ...base, kind: 'origcurrency' }, exponentFor)).toEqual({
      chargedMagnitude: 1392,
      foreign: { magnitude: 1000, currency: 'USD', raw: 'USD @ 1.392' },
    });
  });

  it('currency: the charged amount is TRNAMT x CURRATE', () => {
    expect(foreignFromOfx({ ...base, kind: 'currency', trnAmtMagnitude: minorUnits(1000) }, exponentFor)).toEqual({
      chargedMagnitude: 1392,
      foreign: { magnitude: 1000, currency: 'USD', raw: 'USD @ 1.392' },
    });
  });

  it('rounds half-up in the right exponent for JPY and KWD legs', () => {
    const jpy = foreignFromOfx(
      { kind: 'origcurrency', trnAmtMagnitude: minorUnits(145), accountExponent: 0, curRate: '145', curSym: 'USD' },
      exponentFor
    );
    expect(jpy?.foreign.magnitude).toBe(100);
    const toJpy = foreignFromOfx(
      { kind: 'currency', trnAmtMagnitude: minorUnits(500), accountExponent: 2, curRate: '0.0069', curSym: 'JPY' },
      exponentFor
    );
    expect(toJpy?.chargedMagnitude).toBe(345);
    const kwd = foreignFromOfx(
      { kind: 'currency', trnAmtMagnitude: minorUnits(1000), accountExponent: 2, curRate: '3.25', curSym: 'KWD' },
      exponentFor
    );
    expect(kwd?.chargedMagnitude).toBe(325);
    const half = foreignFromOfx(
      { kind: 'currency', trnAmtMagnitude: minorUnits(1), accountExponent: 2, curRate: '1.5', curSym: 'USD' },
      exponentFor
    );
    expect(half?.chargedMagnitude).toBe(2);
  });

  it.each([['0'], [''], ['abc'], [null]])('rejects curRate %j', (curRate) => {
    expect(foreignFromOfx({ ...base, kind: 'origcurrency', curRate }, exponentFor)).toBeNull();
  });

  it('rejects a missing or unknown CURSYM', () => {
    expect(foreignFromOfx({ ...base, kind: 'currency', curSym: null }, exponentFor)).toBeNull();
    expect(foreignFromOfx({ ...base, kind: 'currency', curSym: 'ZZZ' }, exponentFor)).toBeNull();
  });

  it('rejects zero and oversize results', () => {
    expect(
      foreignFromOfx({ ...base, kind: 'origcurrency', trnAmtMagnitude: minorUnits(1), curRate: '99999' }, exponentFor)
    ).toBeNull();
    expect(
      foreignFromOfx(
        { ...base, kind: 'currency', trnAmtMagnitude: minorUnits(MAX_ABS_AMOUNT_MINOR), curRate: '99999' },
        exponentFor
      )
    ).toBeNull();
  });
});

describe('foreignFromColumns', () => {
  it('reads an original amount and currency', () => {
    expect(foreignFromColumns('45.00', 'usd', 'GBP', opts)).toEqual({
      magnitude: 4500,
      currency: 'USD',
      raw: '45.00 USD',
    });
    expect(foreignFromColumns('-45.00', 'USD', 'GBP', opts)?.magnitude).toBe(4500);
  });

  it.each([
    ['45.00', 'GBP', 'GBP'],
    ['', 'USD', 'GBP'],
    ['45.00', '', 'GBP'],
    ['45.00', 'US', 'GBP'],
    ['45.00', 'ZZZ', 'GBP'],
    ['abc', 'USD', 'GBP'],
    ['0.00', 'USD', 'GBP'],
    ['999999999999999.00', 'USD', 'GBP'],
  ])('returns null for %j %j', (amount, cur, row) => {
    expect(foreignFromColumns(amount, cur, row, opts)).toBeNull();
  });
});

describe('impliedRate', () => {
  it.each([
    [1392, 2, 1000, 2, '1.392'],
    [3538, 2, 4500, 2, '0.7862'],
    [500, 0, 345, 2, '144.9275'],
    [100, 2, 100, 2, '1'],
    [1, 2, 3, 2, '0.3333'],
    [20000, 4, 100000, 4, '0.2'],
    [100005, 2, 100000, 2, '1.0001'],
    [100004, 2, 100000, 2, '1'],
    [1, 2, 100000, 2, '0'],
  ])('(%i e%i) over (%i e%i) -> %s', (cm, ce, fm, fe, expected) => {
    expect(impliedRate({ magnitude: cm, exponent: ce }, { magnitude: fm, exponent: fe })).toBe(expected);
  });

  it('returns 0 for a non-positive foreign magnitude', () => {
    expect(impliedRate({ magnitude: 5, exponent: 2 }, { magnitude: 0, exponent: 2 })).toBe('0');
  });

  it('property: at most 4 decimals, no trailing zero, never throws', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1e12 }),
        fc.integer({ min: 1, max: 1e12 }),
        fc.integer({ min: 0, max: 3 }),
        fc.integer({ min: 0, max: 3 }),
        (c, f, ce, fe) => {
          const s = impliedRate({ magnitude: c, exponent: ce }, { magnitude: f, exponent: fe });
          expect(s).toMatch(/^\d+(\.\d{1,4})?$/);
          if (s.includes('.')) expect(s.endsWith('0')).toBe(false);
        }
      )
    );
  });
});

describe('isFxFeeDescription', () => {
  it.each([
    'NON-STERLING TRANSACTION FEE',
    'Foreign transaction fee',
    'FX FEE',
    'Currency  conversion fee',
    'INTERNATIONAL TRANSACTION FEE',
  ])('%s is a fee', (d) => expect(isFxFeeDescription(d)).toBe(true));
  it.each(['COFFEE', 'FEEDBACK LTD'])('%s is not', (d) => expect(isFxFeeDescription(d)).toBe(false));
});

function row(
  index: number,
  localDate: string | null,
  description: string,
  amount: number | null,
  hasForeign: boolean
): FeeLinkRow {
  return { index, localDate, description, amount, hasForeign };
}
const FEE = 'NON-STERLING TRANSACTION FEE';

describe('linkFxFees', () => {
  it('links a fee right after its foreign purchase', () => {
    const m = linkFxFees([row(0, '2026-03-02', 'SHOP', -3538, true), row(1, '2026-03-02', FEE, -97, false)]);
    expect(m).toEqual(new Map([[1, 0]]));
  });

  it('links across a one-day difference', () => {
    const m = linkFxFees([row(0, '2026-03-01', 'SHOP', -3538, true), row(1, '2026-03-02', FEE, -97, false)]);
    expect(m.get(1)).toBe(0);
    const m2 = linkFxFees([row(0, '2026-03-02', 'SHOP', -3538, true), row(1, '2026-03-01', FEE, -97, false)]);
    expect(m2.get(1)).toBe(0);
  });

  it('a fee is linked only when exactly one purchase qualifies', () => {
    const none = linkFxFees([
      row(0, '2026-03-02', 'A', -100, true),
      row(1, '2026-03-02', 'B', -200, true),
      row(2, '2026-03-02', 'LOCAL', -50, false),
      row(3, '2026-03-02', FEE, -3, false),
    ]);
    expect(none.size).toBe(0);
    const one = linkFxFees([
      row(0, '2026-03-02', 'A', -100, true),
      row(1, '2026-03-02', 'LOCAL', -50, false),
      row(2, '2026-03-02', FEE, -3, false),
    ]);
    expect(one.get(2)).toBe(0);
  });

  it('prefers the directly preceding candidate among several', () => {
    const m = linkFxFees([
      row(0, '2026-03-02', 'A', -100, true),
      row(1, '2026-03-02', 'B', -200, true),
      row(2, '2026-03-02', FEE, -3, false),
    ]);
    expect(m.get(2)).toBe(1);
  });

  it('never links across a sign difference, a gap, or missing data', () => {
    expect(linkFxFees([row(0, '2026-03-02', 'A', 100, true), row(1, '2026-03-02', FEE, -3, false)]).size).toBe(0);
    expect(linkFxFees([row(0, '2026-03-02', 'A', -100, true), row(1, '2026-03-05', FEE, -3, false)]).size).toBe(0);
    expect(linkFxFees([row(0, null, 'A', -100, true), row(1, '2026-03-05', FEE, -3, false)]).size).toBe(0);
    expect(linkFxFees([row(0, '2026-03-02', 'A', -100, true), row(1, null, FEE, -3, false)]).size).toBe(0);
    expect(linkFxFees([row(0, '2026-03-02', 'A', -100, true), row(1, '2026-03-02', FEE, null, false)]).size).toBe(0);
    expect(linkFxFees([row(0, '2026-03-02', 'A', null, true), row(1, '2026-03-02', FEE, -3, false)]).size).toBe(0);
    expect(linkFxFees([row(0, 'garbage', 'A', -100, true), row(1, '2026-03-02', FEE, -3, false)]).size).toBe(0);
  });

  it('never links a fee row to another fee, nor one purchase to two fees', () => {
    const m = linkFxFees([
      row(0, '2026-03-02', 'A', -100, true),
      row(1, '2026-03-02', FEE, -3, false),
      row(2, '2026-03-02', FEE, -3, false),
    ]);
    expect(m).toEqual(new Map([[1, 0]]));
    const feeForeign = linkFxFees([row(0, '2026-03-02', FEE, -100, true), row(1, '2026-03-02', FEE, -3, false)]);
    expect(feeForeign.size).toBe(0);
  });

  it('ignores non-fee rows', () => {
    expect(linkFxFees([row(0, '2026-03-02', 'A', -100, true), row(1, '2026-03-02', 'B', -3, false)]).size).toBe(0);
  });
});
