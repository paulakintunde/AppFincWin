import fs from 'fs';
import path from 'path';
import { prepareImport, resolveCsvDraft, statementOptions, type PreparedImport } from '../importPipeline';

const OFX_DIR = path.join(__dirname, '..', '..', '..', '..', 'engine', 'ofx', '__tests__', 'fixtures');
function ofxBytes(name: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(OFX_DIR, name)));
}

const EXPONENTS: Record<string, number> = { GBP: 2, USD: 2, EUR: 2, JPY: 0 };
const exponentFor = (code: string): number | null => EXPONENTS[code] ?? null;
const REGION = { decimal: '.' as const, dayFirst: true };

const enc = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, 'utf8'));

const CSV = 'Date,Description,Amount,Balance\n2026-09-01,TESCO STORES,-12.50,987.50\n2026-09-02,SALARY,2000.00,2987.50\n';

function expectOk(r: ReturnType<typeof prepareImport>): PreparedImport {
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error('not ok');
  return r.prepared;
}

describe('prepareImport: CSV', () => {
  it('prepares a UTF-8 CSV with detected columns and a certain date format', () => {
    const p = expectOk(prepareImport(enc(CSV), { extension: 'csv' }, REGION, exponentFor));
    if (p.format !== 'csv') throw new Error('expected csv');
    expect(p.csv.header).toEqual(['Date', 'Description', 'Amount', 'Balance']);
    expect(p.csv.dataRows).toHaveLength(2);
    expect(p.csv.delimiter).toBe(',');
    expect(p.csv.detected).toMatchObject({ date: 0, description: 1, amount: 2, balance: 3 });
    expect(p.csv.confidence).toBe('high');
    expect(p.csv.dateFormat).toBe('YMD');
    expect(p.csv.dateAmbiguous).toBe(false);
  });

  it('decodes a Windows-1252 CSV with the pound sign intact', () => {
    const text = 'Date,Description,Amount\n2026-09-01,Cafe £12.50 tip,-12.50\n';
    const p = expectOk(prepareImport(new Uint8Array(Buffer.from(text, 'latin1')), { extension: 'csv' }, REGION, exponentFor));
    if (p.format !== 'csv') throw new Error('expected csv');
    expect(p.csv.dataRows[0]?.[1]).toBe('Cafe £12.50 tip');
  });

  it('parses a UTF-16LE CSV with a byte order mark', () => {
    const body = Buffer.from(CSV, 'utf16le');
    const bytes = new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xfe]), body]));
    const p = expectOk(prepareImport(bytes, { extension: 'csv' }, REGION, exponentFor));
    if (p.format !== 'csv') throw new Error('expected csv');
    expect(p.csv.dataRows).toHaveLength(2);
    expect(p.csv.header[0]).toBe('Date');
  });

  it('flags an ambiguous day/month order and defaults from the region', () => {
    const text = 'Date,Description,Amount\n05/06/2026,A,-1.00\n07/08/2026,B,-2.00\n';
    const dayFirst = expectOk(prepareImport(enc(text), { extension: 'csv' }, REGION, exponentFor));
    const monthFirst = expectOk(prepareImport(enc(text), { extension: 'csv' }, { decimal: '.', dayFirst: false }, exponentFor));
    if (dayFirst.format !== 'csv' || monthFirst.format !== 'csv') throw new Error('expected csv');
    expect(dayFirst.csv.dateAmbiguous).toBe(true);
    expect(dayFirst.csv.dateFormat).toBe('DMY');
    expect(monthFirst.csv.dateAmbiguous).toBe(true);
    expect(monthFirst.csv.dateFormat).toBe('MDY');
  });

  it('flags ambiguous number notation and defaults from the region decimal', () => {
    const text = 'Date,Description,Amount\n2026-09-01,A,5\n2026-09-02,B,10\n';
    const p = expectOk(prepareImport(enc(text), { extension: 'csv' }, { decimal: ',', dayFirst: true }, exponentFor));
    if (p.format !== 'csv') throw new Error('expected csv');
    expect(p.csv.notationAmbiguous).toBe(true);
    expect(p.csv.notation.decimal).toBe(',');
  });

  it('refuses a header-only file as no_rows', () => {
    expect(prepareImport(enc('Date,Description,Amount\n'), { extension: 'csv' }, REGION, exponentFor)).toEqual({
      ok: false,
      reason: 'no_rows',
    });
  });

  it('refuses more than 5,000 data rows as too_many_rows', () => {
    const lines = ['Date,Description,Amount'];
    for (let i = 0; i < 5001; i += 1) lines.push('2026-09-01,X,-1.00');
    expect(prepareImport(enc(lines.join('\n')), { extension: 'csv' }, REGION, exponentFor)).toEqual({
      ok: false,
      reason: 'too_many_rows',
    });
  });

  it('refuses an unterminated quote as unreadable', () => {
    expect(prepareImport(enc('Date,Description\n2026-09-01,"oops\n'), { extension: 'csv' }, REGION, exponentFor)).toEqual({
      ok: false,
      reason: 'unreadable',
    });
  });

  it('refuses text with no recognisable format as unsupported_format, whatever the extension says', () => {
    expect(prepareImport(enc('just some words'), { extension: 'csv' }, REGION, exponentFor)).toEqual({
      ok: false,
      reason: 'unsupported_format',
    });
    expect(prepareImport(new Uint8Array(0), { extension: 'ofx' }, REGION, exponentFor)).toEqual({
      ok: false,
      reason: 'unsupported_format',
    });
  });

  it('sniffs OFX from content even when the extension says csv', () => {
    const p = expectOk(prepareImport(ofxBytes('bank-sgml.ofx'), { extension: 'csv' }, REGION, exponentFor));
    expect(p.format).toBe('ofx');
  });
});

describe('prepareImport: OFX and QFX', () => {
  it('returns ofx drafts for an OFX file', () => {
    const p = expectOk(prepareImport(ofxBytes('bank-sgml.ofx'), { extension: 'ofx' }, REGION, exponentFor));
    if (p.format === 'csv') throw new Error('expected ofx');
    expect(p.format).toBe('ofx');
    expect(p.statements.length).toBeGreaterThan(0);
  });

  it('labels a file qfx by extension', () => {
    const p = expectOk(prepareImport(ofxBytes('bank-sgml.ofx'), { extension: 'qfx' }, REGION, exponentFor));
    expect(p.format).toBe('qfx');
  });

  it('labels a file qfx by its INTU tags', () => {
    const p = expectOk(prepareImport(ofxBytes('card-sgml-positive-purchases.qfx'), { extension: 'other' }, REGION, exponentFor));
    expect(p.format).toBe('qfx');
  });

  it('refuses an investment statement as unsupported_statement', () => {
    const text = 'OFXHEADER:100\nDATA:OFXSGML\n\n<OFX><INVSTMTMSGSRSV1><INVSTMTTRNRS><INVSTMTRS><CURDEF>USD</INVSTMTRS></INVSTMTTRNRS></INVSTMTMSGSRSV1></OFX>';
    expect(prepareImport(enc(text), { extension: 'ofx' }, REGION, exponentFor)).toEqual({
      ok: false,
      reason: 'unsupported_statement',
    });
  });

  it('refuses an OFX file with no statements as unreadable', () => {
    const text = 'OFXHEADER:100\nDATA:OFXSGML\n\n<OFX><SIGNONMSGSRSV1></SIGNONMSGSRSV1></OFX>';
    expect(prepareImport(enc(text), { extension: 'ofx' }, REGION, exponentFor)).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('refuses an OFX file with no root as unreadable', () => {
    const text = 'OFXHEADER:100\nDATA:OFXSGML\n\nnothing here';
    expect(prepareImport(enc(text), { extension: 'ofx' }, REGION, exponentFor)).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('maps an oversized or too deeply nested OFX file to too_big', () => {
    const deep = `OFXHEADER:100\nDATA:OFXSGML\n\n<OFX>${'<A>'.repeat(400)}x${'</A>'.repeat(400)}</OFX>`;
    const r = prepareImport(enc(deep), { extension: 'ofx' }, REGION, exponentFor);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(['too_big', 'unreadable']).toContain(r.reason);
  });
});

describe('statementOptions', () => {
  it('lists kind, currency and line count for each statement, never an account number', () => {
    const p = expectOk(prepareImport(ofxBytes('multi-statement.ofx'), { extension: 'ofx' }, REGION, exponentFor));
    if (p.format === 'csv') throw new Error('expected ofx');
    const options = statementOptions(p.statements);
    expect(options).toEqual([
      { index: 0, kind: 'bank', currency: 'GBP', count: 2 },
      { index: 1, kind: 'card', currency: 'GBP', count: expect.any(Number) },
    ]);
    expect(JSON.stringify(options)).not.toContain('99887766');
  });

  it('treats a draft with no account hint as a bank statement', () => {
    const p = expectOk(prepareImport(ofxBytes('bank-sgml.ofx'), { extension: 'ofx' }, REGION, exponentFor));
    if (p.format === 'csv') throw new Error('expected ofx');
    const first = p.statements[0]!;
    expect(statementOptions([{ ...first, accountHint: null, currency: null }])).toEqual([
      { index: 0, kind: 'bank', currency: null, count: first.rows.length },
    ]);
  });
});

describe('resolveCsvDraft', () => {
  it('builds a draft with the account currency as the default and the chosen notation', () => {
    const p = expectOk(prepareImport(enc(CSV), { extension: 'csv' }, REGION, exponentFor));
    if (p.format !== 'csv') throw new Error('expected csv');
    const draft = resolveCsvDraft(
      p.csv,
      { mapping: p.csv.detected, dateFormat: p.csv.dateFormat, notation: p.csv.notation, account: { currency: 'GBP' } },
      exponentFor
    );
    expect(draft.source).toBe('csv');
    expect(draft.rows).toHaveLength(2);
    expect(draft.rows[0]).toMatchObject({ localDate: '2026-09-01', magnitude: 1250, currency: 'GBP', description: 'TESCO STORES' });
  });
});
