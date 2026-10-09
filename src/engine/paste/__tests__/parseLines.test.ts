import fc from 'fast-check';
import { parseAmount } from '../../money/parseAmount';
import { MAX_IMPORT_ROWS } from '../../csv/tokenize';
import { parseLines, type PasteContext, type PasteResult } from '../parseLines';

const GBP: PasteContext = {
  locale: 'en-GB',
  currency: 'GBP',
  exponent: 2,
  today: '2026-10-09',
  month: '2026-10',
};

function rows(text: string, ctx: PasteContext = GBP) {
  const r = parseLines(text, ctx);
  if (!r.ok) throw new Error('expected ok');
  return r;
}

describe('parseLines examples', () => {
  it('reads name then amount as an expense dated today', () => {
    expect(rows('Studio rent 1450').rows).toEqual([
      { lineNo: 1, name: 'Studio rent', amount: -145000, direction: 'out', localDate: '2026-10-09' },
    ]);
  });

  it('reads a leading + as income with a trailing "D Mon" date', () => {
    expect(rows('+ Freelance invoice 600 12 Oct').rows).toEqual([
      { lineNo: 1, name: 'Freelance invoice', amount: 60000, direction: 'in', localDate: '2026-10-12' },
    ]);
  });

  it('reads tab separated amount-first lines', () => {
    const r = rows('1450\tStudio rent').rows[0];
    expect(r).toMatchObject({ name: 'Studio rent', amount: -145000 });
  });

  it('reads comma separated lines with an ISO date', () => {
    expect(rows('Groceries, 82.40, 2026-10-03').rows[0]).toMatchObject({
      name: 'Groceries',
      amount: -8240,
      localDate: '2026-10-03',
    });
  });

  it('keeps a quoted name with a comma intact and never reads it as an amount', () => {
    expect(rows('"Smith, J", 20').rows[0]).toMatchObject({ name: 'Smith, J', amount: -2000 });
    expect(rows('"Order 66", 20').rows[0]).toMatchObject({ name: 'Order 66', amount: -2000 });
    expect(rows('"a ""q"" b" 5').rows[0]).toMatchObject({ name: 'a "q" b' });
    expect(rows('"unterminated 5').skipped).toEqual([{ lineNo: 1, reason: 'no-amount' }]);
    expect(rows('""  5').skipped).toEqual([{ lineNo: 1, reason: 'no-name' }]);
  });

  it('strips the currency symbol or ISO code of the context currency only', () => {
    expect(rows('Coffee £3.50').rows[0]).toMatchObject({ amount: -350 });
    expect(rows('Coffee gbp3.50').rows[0]).toMatchObject({ amount: -350 });
    expect(rows('Coffee $3.50').skipped).toEqual([{ lineNo: 1, reason: 'no-amount' }]);
  });

  it('skips unreadable lines with a reason', () => {
    const r = rows('Only words\n12.50\nRent 1,2,3\nRent 50 31 Feb');
    expect(r.rows).toEqual([]);
    expect(r.skipped).toEqual([
      { lineNo: 1, reason: 'no-amount' },
      { lineNo: 2, reason: 'no-name' },
      { lineNo: 3, reason: 'bad-amount' },
      { lineNo: 4, reason: 'bad-date' },
    ]);
  });

  it('skips a zero amount and a lone plus', () => {
    expect(rows('Free 0').skipped).toEqual([{ lineNo: 1, reason: 'bad-amount' }]);
    expect(rows('+').skipped).toEqual([{ lineNo: 1, reason: 'no-amount' }]);
  });

  it('ignores blank lines but keeps original line numbers', () => {
    const r = rows('\n  \r\nRent 5\r\n\t\nTea 2');
    expect(r.rows.map((x) => x.lineNo)).toEqual([3, 5]);
    expect(r.skipped).toEqual([]);
  });

  it('dates undated lines the 1st when viewing another month', () => {
    expect(rows('Rent 5', { ...GBP, month: '2026-12' }).rows[0]?.localDate).toBe('2026-12-01');
  });

  it('reads magnitude of a negative token as an expense', () => {
    expect(rows('Refund -20').rows[0]).toMatchObject({ amount: -2000, direction: 'out' });
  });

  it('keeps grouped amounts together', () => {
    expect(rows('Car 1,234.50').rows[0]).toMatchObject({ amount: -123450 });
  });

  it('reads month-name and D/M date forms', () => {
    expect(rows('Oct 3 Tea 2').rows[0]).toMatchObject({ name: 'Tea', localDate: '2026-10-03' });
    expect(rows('Tea 2 3 October').rows[0]).toMatchObject({ localDate: '2026-10-03' });
    expect(rows('Tea 2 Sep 4').rows[0]).toMatchObject({ localDate: '2026-09-04' });
    expect(rows('Tea 2 15/10').rows[0]).toMatchObject({ localDate: '2026-10-15' });
    expect(rows('15/3 Tea 2').rows[0]).toMatchObject({ localDate: '2026-03-15' });
    expect(rows('Tea 2 3/10').skipped).toEqual([{ lineNo: 1, reason: 'bad-date' }]);
    expect(rows('Tea 2 31/2').skipped).toEqual([{ lineNo: 1, reason: 'bad-date' }]);
    expect(rows('Tea 2 2026-02-30').skipped).toEqual([{ lineNo: 1, reason: 'bad-date' }]);
    expect(rows('Tea 2 Oct 32').skipped).toEqual([{ lineNo: 1, reason: 'bad-date' }]);
  });

  it('does not treat a lone month word as a date', () => {
    expect(rows('May Day 5').rows[0]).toMatchObject({ name: 'May Day', amount: -500 });
    expect(rows('Tea 5 6 7').rows[0]).toMatchObject({ name: 'Tea 5 6', amount: -700 });
  });

  it('handles zero-exponent currencies', () => {
    const jpy: PasteContext = { ...GBP, locale: 'ja-JP', currency: 'JPY', exponent: 0 };
    expect(rows('Ramen 980', jpy).rows[0]).toMatchObject({ amount: -980 });
    expect(rows('Ramen 980.5', jpy).skipped).toEqual([{ lineNo: 1, reason: 'bad-amount' }]);
  });

  it('truncates names to 200 characters', () => {
    const long = 'x'.repeat(300);
    expect(rows(`${long} 5`).rows[0]?.name).toHaveLength(200);
  });

  it('refuses input over the row ceiling', () => {
    const many = Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => 'a 1').join('\n');
    expect(parseLines(many, GBP)).toEqual({ ok: false, error: 'too-many-lines', limit: 5000 });
    const ok = Array.from({ length: MAX_IMPORT_ROWS }, () => 'a 1').join('\n');
    expect(rows(ok).rows).toHaveLength(MAX_IMPORT_ROWS);
  });
});

function nonBlank(text: string): number {
  return text.split(/\r\n|\r|\n/).filter((l) => l.trim() !== '').length;
}

describe('parseLines properties', () => {
  const check = (text: string) => {
    let r: PasteResult = { ok: false, error: 'too-many-lines', limit: 0 };
    expect(() => {
      r = parseLines(text, GBP);
    }).not.toThrow();
    if (r.ok) {
      expect(r.rows.length + r.skipped.length).toBe(nonBlank(text));
      const rowNos = new Set(r.rows.map((x) => x.lineNo));
      for (const s of r.skipped) expect(rowNos.has(s.lineNo)).toBe(false);
      for (const x of r.rows) {
        expect(Number.isInteger(x.amount)).toBe(true);
        expect(x.name.length).toBeGreaterThan(0);
        expect(x.name.length).toBeLessThanOrEqual(200);
      }
    }
  };

  it('never throws and partitions lines for arbitrary strings', () => {
    fc.assert(fc.property(fc.string(), (s) => check(s)), { numRuns: 500 });
    fc.assert(fc.property(fc.string({ unit: 'binary' }), (s) => check(s)), { numRuns: 300 });
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom('a', '1', ' ', '\t', ',', '"', '+', '-', '.', '/', '\n', 'Oct', '£', '0'),
          { maxLength: 60 }
        ),
        (parts) => check(parts.join(''))
      ),
      { numRuns: 800 }
    );
  });

  it('round-trips generated lines and equals parseAmount of the token', () => {
    const name = fc
      .array(fc.constantFrom(...'abcdefghij'.split('')), { minLength: 1, maxLength: 8 })
      .map((a) => a.join(''));
    const fmt = (minor: number) => `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, '0')}`;
    fc.assert(
      fc.property(
        name,
        fc.integer({ min: 1, max: 1_000_000_000 }),
        fc.option(fc.integer({ min: 1, max: 28 }), { nil: undefined }),
        fc.constantFrom('\t', ', ', ' '),
        fc.boolean(),
        fc.boolean(),
        (n, amt, day, sep, amountFirst, plus) => {
          const date = day === undefined ? undefined : `2026-10-${String(day).padStart(2, '0')}`;
          const token = fmt(amt);
          const fields = amountFirst ? [token, n] : [n, token];
          if (date !== undefined) fields.push(date);
          const text = `${plus ? '+' : ''}${fields.join(sep)}`;
          const r = rows(text);
          expect(r.skipped).toEqual([]);
          const parsed = parseAmount(token, { locale: 'en-GB', exponent: 2 });
          if (!parsed.ok) throw new Error('token');
          expect(r.rows).toEqual([
            {
              lineNo: 1,
              name: n,
              amount: plus ? parsed.value : -parsed.value,
              direction: plus ? 'in' : 'out',
              localDate: date ?? '2026-10-09',
            },
          ]);
        }
      ),
      { numRuns: 500 }
    );
  });
});
