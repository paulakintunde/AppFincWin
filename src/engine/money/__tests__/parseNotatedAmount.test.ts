import fc from 'fast-check';
import { parseNotatedAmount, markerSign, type AmountMarker, type NumberNotation, type NotatedAmountResult } from '../parseNotatedAmount';

const WEST: NumberNotation = { decimal: '.', group: ',', grouping: 'western' };
const EU: NumberNotation = { decimal: ',', group: '.', grouping: 'western' };
const FR: NumberNotation = { decimal: ',', group: ' ', grouping: 'western' };
const CH: NumberNotation = { decimal: '.', group: "'", grouping: 'western' };
const IN: NumberNotation = { decimal: '.', group: ',', grouping: 'indian' };

describe('parseNotatedAmount: bare and simple signs (WEST, exponent 2)', () => {
  it('reads a bare amount as marker none', () => {
    expect(parseNotatedAmount('12.50', WEST, 2)).toEqual({ ok: true, magnitude: 1250, marker: 'none' });
  });

  it('reads a leading minus', () => {
    expect(parseNotatedAmount('-12.50', WEST, 2)).toEqual({ ok: true, magnitude: 1250, marker: 'minus' });
  });

  it('reads a trailing minus', () => {
    expect(parseNotatedAmount('12.50-', WEST, 2)).toEqual({ ok: true, magnitude: 1250, marker: 'minus' });
  });

  it('reads U+2212 (true minus sign) as minus', () => {
    expect(parseNotatedAmount('−12.50', WEST, 2)).toEqual({ ok: true, magnitude: 1250, marker: 'minus' });
  });

  it('reads U+2013 (en dash) as minus', () => {
    expect(parseNotatedAmount('–12.50', WEST, 2)).toEqual({ ok: true, magnitude: 1250, marker: 'minus' });
  });

  it('reads parentheses as parens', () => {
    expect(parseNotatedAmount('(12.50)', WEST, 2)).toEqual({ ok: true, magnitude: 1250, marker: 'parens' });
  });

  it('reads parentheses around a currency symbol as parens', () => {
    expect(parseNotatedAmount('(£12.50)', WEST, 2)).toEqual({ ok: true, magnitude: 1250, marker: 'parens' });
  });

  it('reads a leading plus as marker plus', () => {
    expect(parseNotatedAmount('+12.50', WEST, 2)).toEqual({ ok: true, magnitude: 1250, marker: 'plus' });
  });
});

describe('parseNotatedAmount: DR/CR/OD markers (WEST, exponent 2)', () => {
  it.each([
    ['12.50 DR', 'dr'],
    ['DR 12.50', 'dr'],
    ['12.50 Dr', 'dr'],
    ['12.50D', 'dr'],
    ['12.50 CR', 'cr'],
    ['12.50C', 'cr'],
  ] as const)('reads %p as marker %p', (raw, marker) => {
    expect(parseNotatedAmount(raw, WEST, 2)).toEqual({ ok: true, magnitude: 1250, marker });
  });

  it('reads a trailing OD marker (balance notation)', () => {
    expect(parseNotatedAmount('1,234.56 OD', WEST, 2)).toEqual({ ok: true, magnitude: 123456, marker: 'od' });
  });
});

describe('parseNotatedAmount: conflicting and agreeing markers', () => {
  it('rejects a minus with a disagreeing CR as conflicting-markers', () => {
    expect(parseNotatedAmount('-12.50 CR', WEST, 2)).toEqual({ ok: false, error: 'conflicting-markers' });
  });

  it('rejects parens with a disagreeing CR as conflicting-markers', () => {
    expect(parseNotatedAmount('(12.50) CR', WEST, 2)).toEqual({ ok: false, error: 'conflicting-markers' });
  });

  it('accepts a minus that agrees with DR, resolving to dr (precedence)', () => {
    expect(parseNotatedAmount('-12.50 DR', WEST, 2)).toEqual({ ok: true, magnitude: 1250, marker: 'dr' });
  });
});

describe('parseNotatedAmount: currency symbols and ISO codes (WEST, exponent 2)', () => {
  it('reads a currency symbol before the sign', () => {
    expect(parseNotatedAmount('£-12.50', WEST, 2)).toEqual({ ok: true, magnitude: 1250, marker: 'minus' });
  });

  it('reads a currency symbol after the sign', () => {
    expect(parseNotatedAmount('-£12.50', WEST, 2)).toEqual({ ok: true, magnitude: 1250, marker: 'minus' });
  });

  it('reads a leading ISO code with no marker', () => {
    expect(parseNotatedAmount('GBP 12.50', WEST, 2)).toEqual({ ok: true, magnitude: 1250, marker: 'none' });
  });

  it('reads a trailing ISO code with no marker', () => {
    expect(parseNotatedAmount('12.50 EUR', WEST, 2)).toEqual({ ok: true, magnitude: 1250, marker: 'none' });
  });

  it('unwraps a spreadsheet ="…" cell wrapper', () => {
    expect(parseNotatedAmount('="12.50"', WEST, 2)).toEqual({ ok: true, magnitude: 1250, marker: 'none' });
  });

  it('unwraps a plain "…" quoted cell (no spreadsheet = prefix)', () => {
    expect(parseNotatedAmount('"12.50"', WEST, 2)).toEqual({ ok: true, magnitude: 1250, marker: 'none' });
  });

  it('reads a trailing currency symbol with no marker', () => {
    expect(parseNotatedAmount('12.50£', WEST, 2)).toEqual({ ok: true, magnitude: 1250, marker: 'none' });
  });

  it('strips NBSP / narrow-NBSP / zero-width padding from both ends', () => {
    const raw = '  ​12.50​  ';
    expect(parseNotatedAmount(raw, WEST, 2)).toEqual({ ok: true, magnitude: 1250, marker: 'none' });
  });
});

describe('parseNotatedAmount: regional grouping and decimal marks', () => {
  it('reads French space-grouped, comma-decimal notation', () => {
    expect(parseNotatedAmount('1 234,56', FR, 2)).toEqual({ ok: true, magnitude: 123456, marker: 'none' });
  });

  it('reads European dot-grouped, comma-decimal notation', () => {
    expect(parseNotatedAmount('1.234,56', EU, 2)).toEqual({ ok: true, magnitude: 123456, marker: 'none' });
  });

  it('reads Swiss apostrophe-grouped notation', () => {
    expect(parseNotatedAmount("1'234.50", CH, 2)).toEqual({ ok: true, magnitude: 123450, marker: 'none' });
  });

  it('reads Swiss notation with a curly U+2019 apostrophe the same as a plain one', () => {
    expect(parseNotatedAmount('1’234.50', CH, 2)).toEqual({ ok: true, magnitude: 123450, marker: 'none' });
  });

  it('reads Indian lakh/crore grouping', () => {
    expect(parseNotatedAmount('12,34,567.00', IN, 2)).toEqual({ ok: true, magnitude: 123456700, marker: 'none' });
  });

  it('rejects western grouping under Indian notation as ambiguous-separator', () => {
    expect(parseNotatedAmount('1,234,567.00', IN, 2)).toEqual({ ok: false, error: 'ambiguous-separator' });
  });

  it('accepts the same digits as well-grouped under western notation', () => {
    expect(parseNotatedAmount('1,234,567.00', WEST, 2)).toEqual({ ok: true, magnitude: 123456700, marker: 'none' });
  });
});

describe('parseNotatedAmount: excess decimals and exponent boundaries', () => {
  it('strips a zero excess decimal beyond the exponent', () => {
    expect(parseNotatedAmount('12.500', WEST, 2)).toEqual({ ok: true, magnitude: 1250, marker: 'none' });
  });

  it('strips zero excess decimals for a zero-exponent currency', () => {
    expect(parseNotatedAmount('1200.00', WEST, 0)).toEqual({ ok: true, magnitude: 1200, marker: 'none' });
  });

  it('rejects a non-zero excess decimal as too-many-decimals, never rounding', () => {
    expect(parseNotatedAmount('12.501', WEST, 2)).toEqual({ ok: false, error: 'too-many-decimals' });
  });
});

describe('parseNotatedAmount: rejections', () => {
  it('rejects an empty string as empty', () => {
    expect(parseNotatedAmount('', WEST, 2)).toEqual({ ok: false, error: 'empty' });
  });

  it('rejects non-numeric text as invalid', () => {
    expect(parseNotatedAmount('abc', WEST, 2)).toEqual({ ok: false, error: 'invalid' });
  });

  it('rejects a trailing 4-letter non-ISO token as invalid, not silently stripped', () => {
    expect(parseNotatedAmount('12.50 XYZQ', WEST, 2)).toEqual({ ok: false, error: 'invalid' });
  });

  it('rejects a lone sign with no digits as invalid, not empty', () => {
    expect(parseNotatedAmount('-', WEST, 2)).toEqual({ ok: false, error: 'invalid' });
  });

  it('rejects a lone 3-letter ISO-shaped token with no amount as invalid', () => {
    expect(parseNotatedAmount('GBP', WEST, 2)).toEqual({ ok: false, error: 'invalid' });
  });

  it('accepts a trailing decimal mark with no fraction digits, matching parseAmount', () => {
    expect(parseNotatedAmount('12.', WEST, 2)).toEqual({ ok: true, magnitude: 1200, marker: 'none' });
  });
});

describe('markerSign', () => {
  it.each([
    ['minus', -1],
    ['parens', -1],
    ['dr', -1],
    ['od', -1],
    ['none', 1],
    ['plus', 1],
    ['cr', 1],
  ] as const)('markerSign(%p) === %p', (marker, sign) => {
    expect(markerSign(marker)).toBe(sign);
  });
});

describe('parseNotatedAmount: no-leak (sensitive statement text never reaches the result)', () => {
  const sensitiveInputs = [
    'TESCO STORES 3021',
    'DR JONES PHARMACY',
    '1 234,56 OD at ACME LTD',
    'TESCO STORES 3021 -12.50 CR',
  ];

  it.each(sensitiveInputs)('never throws and never leaks %p into the result', (raw) => {
    let result: NotatedAmountResult | undefined;
    expect(() => {
      result = parseNotatedAmount(raw, WEST, 2);
    }).not.toThrow();
    const json = JSON.stringify(result);
    expect(json).not.toMatch(/TESCO|JONES|ACME/);
  });
});

// Builds a plain decimal string from a MinorUnits integer using pure string manipulation --
// no division. Kept local (mirrors the identical helper in parseAmount.test.ts) since this
// file must not depend on test-only helpers from another test file.
function decimalStringFromMinor(n: number, exponent: number): string {
  const digits = Math.abs(n).toString().padStart(exponent + 1, '0');
  if (exponent === 0) return digits;
  const cut = digits.length - exponent;
  return `${digits.slice(0, cut)}.${digits.slice(cut)}`;
}

// Renders a non-negative magnitude in a given notation's grouping/decimal style, by
// formatting via Intl (which supplies correct western/Indian group placement) and then
// remapping the canonical '.'/',' characters onto the notation's own decimal/group chars.
function renderMagnitude(m: number, exponent: number, notation: NumberNotation): string {
  const decimalStr = decimalStringFromMinor(m, exponent);
  const locale = notation.grouping === 'indian' ? 'en-IN' : 'en-US';
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
    useGrouping: true,
  }).format(decimalStr as unknown as number);
  let out = '';
  for (const ch of formatted) {
    if (ch === '.') out += notation.decimal;
    else if (ch === ',') out += notation.group;
    else out += ch;
  }
  return out;
}

interface Renderer {
  name: string;
  build: (magnitudeStr: string) => string;
  marker: AmountMarker;
}

const RENDERERS: readonly Renderer[] = [
  { name: 'bare', build: (s) => s, marker: 'none' },
  { name: 'leading plus', build: (s) => `+${s}`, marker: 'plus' },
  { name: 'leading minus', build: (s) => `-${s}`, marker: 'minus' },
  { name: 'trailing minus', build: (s) => `${s}-`, marker: 'minus' },
  { name: 'U+2212 minus', build: (s) => `−${s}`, marker: 'minus' },
  { name: 'en dash', build: (s) => `–${s}`, marker: 'minus' },
  { name: 'parens', build: (s) => `(${s})`, marker: 'parens' },
  { name: 'DR prefix', build: (s) => `DR ${s}`, marker: 'dr' },
  { name: 'DR suffix', build: (s) => `${s} DR`, marker: 'dr' },
  { name: 'CR prefix', build: (s) => `CR ${s}`, marker: 'cr' },
  { name: 'CR suffix', build: (s) => `${s} CR`, marker: 'cr' },
  { name: 'currency then sign', build: (s) => `£-${s}`, marker: 'minus' },
  { name: 'sign then currency', build: (s) => `-£${s}`, marker: 'minus' },
  { name: 'ISO code prefix', build: (s) => `GBP ${s}`, marker: 'none' },
  { name: 'ISO code suffix', build: (s) => `${s} EUR`, marker: 'none' },
  { name: 'NBSP padding', build: (s) => ` ${s} `, marker: 'none' },
];

const NOTATIONS: readonly NumberNotation[] = [WEST, EU, FR, CH, IN];

describe('parseNotatedAmount: round-trip property (fast-check)', () => {
  it('recovers magnitude and marker for every notation/renderer combination, exponent 2', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000_000_000 }),
        fc.constantFrom(...NOTATIONS),
        fc.constantFrom(...RENDERERS),
        (m, notation, renderer) => {
          const exponent = 2;
          const magnitudeStr = renderMagnitude(m, exponent, notation);
          const raw = renderer.build(magnitudeStr);
          const result = parseNotatedAmount(raw, notation, exponent);
          expect(result).toEqual({ ok: true, magnitude: m, marker: renderer.marker });
          if (result.ok) {
            const signed = markerSign(result.marker) * result.magnitude;
            const expectedSigned = markerSign(renderer.marker) * m;
            expect(signed).toEqual(expectedSigned);
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
