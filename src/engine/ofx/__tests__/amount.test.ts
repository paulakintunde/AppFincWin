import fc from 'fast-check';
import { parseOfxAmount } from '../amount';

describe('parseOfxAmount', () => {
  it('reads a leading-minus amount at exponent 2', () => {
    const result = parseOfxAmount('-12.50', 2);
    expect(result).toEqual({ ok: true, magnitude: 1250, marker: 'minus' });
  });

  it('reads an unmarked positive amount as marker none', () => {
    const result = parseOfxAmount('12.50', 2);
    expect(result).toEqual({ ok: true, magnitude: 1250, marker: 'none' });
  });

  it('reads a leading-plus amount as marker plus', () => {
    const result = parseOfxAmount('+12.50', 2);
    expect(result).toEqual({ ok: true, magnitude: 1250, marker: 'plus' });
  });

  it('reads a comma decimal mark (European banks) as minus', () => {
    const result = parseOfxAmount('-12,50', 2);
    expect(result).toEqual({ ok: true, magnitude: 1250, marker: 'minus' });
  });

  it('strips excess trailing zeros beyond the exponent without rounding', () => {
    const result = parseOfxAmount('-12.5000', 2);
    expect(result).toEqual({ ok: true, magnitude: 1250, marker: 'minus' });
  });

  it('rejects a non-zero excess beyond the exponent as too-many-decimals, never rounding', () => {
    const result = parseOfxAmount('-12.5001', 2);
    expect(result).toEqual({ ok: false, error: 'too-many-decimals' });
  });

  it('reads a zero amount as ok with marker none', () => {
    const result = parseOfxAmount('0.00', 2);
    expect(result).toEqual({ ok: true, magnitude: 0, marker: 'none' });
  });

  it('reads a signed zero amount as ok with its marker (extractor flags zero separately)', () => {
    const result = parseOfxAmount('-0.00', 2);
    expect(result).toEqual({ ok: true, magnitude: 0, marker: 'minus' });
  });

  it('rejects grouping -- OFX never sends it', () => {
    const result = parseOfxAmount('1,234.50', 2);
    expect(result).toEqual({ ok: false, error: 'invalid' });
  });

  it('rejects an empty string', () => {
    const result = parseOfxAmount('', 2);
    expect(result).toEqual({ ok: false, error: 'empty' });
  });

  it('rejects a blank (whitespace-only) string as empty', () => {
    const result = parseOfxAmount('   ', 2);
    expect(result).toEqual({ ok: false, error: 'empty' });
  });

  it('rejects a letter anywhere in the cell', () => {
    const result = parseOfxAmount('12.50CR', 2);
    expect(result.ok).toBe(false);
  });

  it('trims surrounding whitespace before scanning', () => {
    const result = parseOfxAmount('  -12.50  ', 2);
    expect(result).toEqual({ ok: true, magnitude: 1250, marker: 'minus' });
  });

  it('reads a zero-exponent currency (e.g. JPY) integer amount', () => {
    const result = parseOfxAmount('-1200', 0);
    expect(result).toEqual({ ok: true, magnitude: 1200, marker: 'minus' });
  });

  it('reads a padded four-decimal amount against a 2-exponent currency', () => {
    const result = parseOfxAmount('45.0000', 2);
    expect(result).toEqual({ ok: true, magnitude: 4500, marker: 'none' });
  });

  describe('property: magnitude and sign survive round-tripping through rendering', () => {
    it('holds for integers, an exponent, both decimal marks and 0-2 trailing zeros', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -100_000_000_000, max: 100_000_000_000 }),
          fc.constantFrom(0, 2, 3),
          fc.constantFrom('.', ','),
          fc.integer({ min: 0, max: 2 }),
          (a, exponent, mark, extraZeros) => {
            const magnitude = Math.abs(a);
            const wholeDigits = String(magnitude).padStart(exponent + 1, '0');
            const whole = exponent === 0 ? wholeDigits : wholeDigits.slice(0, -exponent) || '0';
            const fraction = exponent === 0 ? '' : wholeDigits.slice(-exponent).padEnd(exponent + extraZeros, '0');
            const body = exponent === 0 ? whole : `${whole}${mark}${fraction}`;
            const raw = a < 0 ? `-${body}` : body;

            const result = parseOfxAmount(raw, exponent);
            expect(result.ok).toBe(true);
            if (result.ok) {
              expect(result.magnitude).toBe(magnitude);
              expect(result.marker).toBe(a < 0 ? 'minus' : 'none');
            }
          }
        ),
        { numRuns: 300 }
      );
    });
  });

  it('never leaks input content in a failure -- no-leak', () => {
    const secret = 'TESCO 12.50 DR JONES PHARMACY';
    const result = parseOfxAmount(`${secret}xyz`, 2);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(JSON.stringify(result)).not.toContain('TESCO');
      expect(JSON.stringify(result)).not.toContain('JONES');
    }
  });
});
