import { sniffFormat } from '../sniffFormat';

describe('sniffFormat: OFX detection', () => {
  it('recognises an OFX 1.x SGML header', () => {
    expect(sniffFormat('OFXHEADER:100\nDATA:OFXSGML\n...<OFX>...')).toBe('ofx');
  });

  it('recognises an OFX 2.x XML header', () => {
    expect(sniffFormat('<?xml version="1.0"?>\n<?OFX OFXHEADER="200"?><OFX>')).toBe('ofx');
  });

  it('recognises a bare <ofx> tag after leading whitespace, any case', () => {
    expect(sniffFormat('  \n<ofx><SIGNONMSGSRSV1>')).toBe('ofx');
  });
});

describe('sniffFormat: CSV detection', () => {
  it('recognises a comma-delimited first line', () => {
    expect(sniffFormat('Date,Description,Amount\n2026-01-01,Coffee,-3.50')).toBe('csv');
  });

  it('recognises a semicolon-delimited first line', () => {
    expect(sniffFormat('Datum;Bedrag\n2026-01-01;-3,50')).toBe('csv');
  });

  it('recognises a tab-delimited first line', () => {
    expect(sniffFormat('Date\tDescription\tAmount\n2026-01-01\tCoffee\t-3.50')).toBe('csv');
  });
});

describe('sniffFormat: unknown', () => {
  it('reports unknown for a PDF header', () => {
    expect(sniffFormat('%PDF-1.7\n%âãÏÓ')).toBe('unknown');
  });

  it('reports unknown for prose with no delimiter', () => {
    expect(sniffFormat('hello world')).toBe('unknown');
  });

  it('reports unknown for an empty string', () => {
    expect(sniffFormat('')).toBe('unknown');
  });
});

describe('sniffFormat: only the first 4 KB is scanned', () => {
  it('never sees an <OFX> tag placed after the 4 KB window', () => {
    const padding = 'x'.repeat(4200);
    const text = `${padding}\n<OFX>`;
    // The first line (the padding) has no delimiter, and the <OFX> tag never
    // enters the scanned window, so this reads as unknown, not ofx.
    expect(sniffFormat(text)).toBe('unknown');
  });

  it('reads csv from the first line when a later <OFX> tag falls outside the window', () => {
    const padding = ','.repeat(4200);
    const text = `a,b${padding}\n<OFX>`;
    expect(sniffFormat(text)).toBe('csv');
  });
});

describe('sniffFormat: no-leak (never throws for sensitive statement text)', () => {
  const sensitiveInputs = [
    'TESCO STORES 3021',
    'DR JONES PHARMACY',
    '1 234,56 OD at ACME LTD',
    'TESCO STORES 3021 -12.50 CR',
  ];

  it.each(sensitiveInputs)('never throws sniffing %p', (text) => {
    expect(() => sniffFormat(text)).not.toThrow();
  });
});
