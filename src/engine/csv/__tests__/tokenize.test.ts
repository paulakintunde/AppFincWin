import fc from 'fast-check';
import { tokenize, detectDelimiter, MAX_IMPORT_ROWS, type Delimiter } from '../tokenize';

describe('detectDelimiter', () => {
  it('detects comma when comma is most frequent on the first line', () => {
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
  });

  it('detects semicolon when semicolon is most frequent on the first line', () => {
    expect(detectDelimiter('Date;Amount\n01/02/2026;12,50')).toBe(';');
  });

  it('detects tab when tab is most frequent on the first line', () => {
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
  });

  it('strips a leading BOM before counting', () => {
    expect(detectDelimiter('﻿Date;Amount\n01/02/2026;12,50')).toBe(';');
  });

  it('ignores delimiter-like characters inside quotes', () => {
    expect(detectDelimiter('"a;b;c";d')).toBe(';');
  });

  it('ties break as comma, then semicolon, then tab', () => {
    expect(detectDelimiter('a;b\n1;2')).toBe(';');
    expect(detectDelimiter('nothing here')).toBe(',');
  });

  it('only counts characters on the first logical line', () => {
    // Second line has many semicolons but the first line has one comma and no semicolons.
    expect(detectDelimiter('a,b\n;;;;;')).toBe(',');
  });
});

describe('tokenize: basic shape', () => {
  it('tokenizes a simple two-row comma file', () => {
    expect(tokenize('a,b\n1,2\n')).toEqual({
      ok: true,
      rows: [
        ['a', 'b'],
        ['1', '2'],
      ],
      delimiter: ',',
    });
  });

  it('handles quoted fields with embedded commas, doubled quotes, and an embedded newline, CRLF row ending', () => {
    const input = '"x, y","say ""hi"""\r\n"line\nbreak",3';
    expect(tokenize(input)).toEqual({
      ok: true,
      rows: [
        ['x, y', 'say "hi"'],
        ['line\nbreak', '3'],
      ],
      delimiter: ',',
    });
  });

  it('detects semicolon delimiter and strips a leading BOM', () => {
    const input = '﻿Date;Amount\n01/02/2026;12,50';
    expect(tokenize(input)).toEqual({
      ok: true,
      rows: [
        ['Date', 'Amount'],
        ['01/02/2026', '12,50'],
      ],
      delimiter: ';',
    });
  });

  it('adds no empty row for a trailing newline', () => {
    expect(tokenize('a,b\n1,2\n')).toEqual({
      ok: true,
      rows: [
        ['a', 'b'],
        ['1', '2'],
      ],
      delimiter: ',',
    });
  });

  it('skips blank lines', () => {
    expect(tokenize('a,b\n1,2\n\n3,4\n')).toEqual({
      ok: true,
      rows: [
        ['a', 'b'],
        ['1', '2'],
        ['3', '4'],
      ],
      delimiter: ',',
    });
  });

  it('skips a blank line made only of delimiters and whitespace', () => {
    expect(tokenize('a,b\n1,2\n , \n3,4\n')).toEqual({
      ok: true,
      rows: [
        ['a', 'b'],
        ['1', '2'],
        ['3', '4'],
      ],
      delimiter: ',',
    });
  });

  it('tokenizes with plain LF, CRLF and lone CR row endings identically', () => {
    const lf = tokenize('a,b\n1,2\n3,4');
    const crlf = tokenize('a,b\r\n1,2\r\n3,4');
    const cr = tokenize('a,b\r1,2\r3,4');
    const expected = {
      ok: true,
      rows: [
        ['a', 'b'],
        ['1', '2'],
        ['3', '4'],
      ],
      delimiter: ',' as Delimiter,
    };
    expect(lf).toEqual(expected);
    expect(crlf).toEqual(expected);
    expect(cr).toEqual(expected);
  });
});

describe('tokenize: malformed quoting', () => {
  it('reports unterminated-quote for an unclosed quoted field', () => {
    expect(tokenize('"abc')).toEqual({ ok: false, error: 'unterminated-quote', line: 1 });
  });

  it('reports unterminated-quote at the row it started, even with prior valid rows', () => {
    expect(tokenize('a,b\n1,2\n"abc')).toEqual({ ok: false, error: 'unterminated-quote', line: 3 });
  });

  it('reports stray-quote for a quote appearing mid-field', () => {
    expect(tokenize('a"b,c')).toEqual({ ok: false, error: 'stray-quote', line: 1 });
  });

  it('reports stray-quote for a closing quote immediately followed by another character', () => {
    expect(tokenize('"ab"c,d')).toEqual({ ok: false, error: 'stray-quote', line: 1 });
  });
});

describe('tokenize: empty input', () => {
  it('reports empty for an empty string', () => {
    expect(tokenize('')).toEqual({ ok: false, error: 'empty', line: 0 });
  });

  it('reports empty for a whitespace-only string', () => {
    expect(tokenize('   \n  \t \n')).toEqual({ ok: false, error: 'empty', line: 0 });
  });

  it('reports empty for a BOM-only string', () => {
    expect(tokenize('﻿')).toEqual({ ok: false, error: 'empty', line: 0 });
  });
});

describe('tokenize: row ceiling (D-18)', () => {
  function buildFile(dataRows: number): string {
    const lines = ['h1,h2'];
    for (let i = 0; i < dataRows; i += 1) lines.push(`v${i},v${i}`);
    return lines.join('\n');
  }

  it('accepts exactly 5000 data rows', () => {
    const result = tokenize(buildFile(5000));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows.length).toBe(5001); // header + 5000
    }
  });

  it('rejects 5001 data rows with too-many-rows at the offending row line', () => {
    expect(tokenize(buildFile(5001))).toEqual({ ok: false, error: 'too-many-rows', line: 5002 });
  });

  it('honours a custom maxDataRows override', () => {
    expect(tokenize(buildFile(3), { maxDataRows: 2 })).toEqual({
      ok: false,
      error: 'too-many-rows',
      line: 4,
    });
    const ok = tokenize(buildFile(2), { maxDataRows: 2 });
    expect(ok.ok).toBe(true);
  });

  it('exports MAX_IMPORT_ROWS as 5000', () => {
    expect(MAX_IMPORT_ROWS).toBe(5000);
  });
});

describe('tokenize: uneven row lengths', () => {
  it('pads a data row shorter than the header with empty strings', () => {
    expect(tokenize('a,b,c\n1,2')).toEqual({
      ok: true,
      rows: [
        ['a', 'b', 'c'],
        ['1', '2', ''],
      ],
      delimiter: ',',
    });
  });

  it('keeps extra cells on a data row longer than the header', () => {
    expect(tokenize('a,b\n1,2,3,4')).toEqual({
      ok: true,
      rows: [
        ['a', 'b'],
        ['1', '2', '3', '4'],
      ],
      delimiter: ',',
    });
  });
});

describe('tokenize: explicit delimiter override', () => {
  it('uses the delimiter passed in opts instead of detecting one', () => {
    expect(tokenize('a;b,c\n1;2,3', { delimiter: ';' })).toEqual({
      ok: true,
      rows: [
        ['a', 'b,c'],
        ['1', '2,3'],
      ],
      delimiter: ';',
    });
  });
});

// --- Round-trip property (RFC-4180 quoting) ---

function needsQuoting(field: string, delimiter: string): boolean {
  return field.includes(delimiter) || field.includes('"') || field.includes('\r') || field.includes('\n');
}

function quoteField(field: string, delimiter: string): string {
  if (!needsQuoting(field, delimiter)) return field;
  return `"${field.replace(/"/g, '""')}"`;
}

function serialize(rows: string[][], delimiter: string, lineEnding: string): string {
  return rows.map((row) => row.map((f) => quoteField(f, delimiter)).join(delimiter)).join(lineEnding);
}

function toRectangular(matrix: string[][]): string[][] {
  const width = Math.max(...matrix.map((r) => r.length));
  return matrix.map((r) => {
    const padded = [...r];
    while (padded.length < width) padded.push('');
    return padded;
  });
}

describe('tokenize: round-trip property (fast-check)', () => {
  it('recovers the original matrix for any strings, delimiter and line ending', () => {
    fc.assert(
      fc.property(
        fc
          .array(fc.array(fc.string(), { minLength: 1, maxLength: 6 }), { minLength: 1, maxLength: 20 })
          .map(toRectangular)
          .filter(
            (matrix) =>
              matrix.every((row) => row.some((cell) => cell.trim() !== '')) &&
              // tokenize strips a *leading* BOM defensively (any caller's raw text may carry
              // one) -- exclude the one case where that would rewrite user content: the very
              // first cell of the first row itself starting with a literal BOM character.
              !(matrix[0] as string[])[0]?.startsWith('﻿')
          ),
        fc.constantFrom<Delimiter>(',', ';', '\t'),
        fc.constantFrom('\n', '\r\n', '\r'),
        (matrix, delimiter, lineEnding) => {
          const serialized = serialize(matrix, delimiter, lineEnding);
          const result = tokenize(serialized, { delimiter });
          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.rows).toEqual(matrix);
            expect(result.delimiter).toBe(delimiter);
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
