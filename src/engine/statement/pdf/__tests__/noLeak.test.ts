// IMP-03, engine side: nothing read from a statement reaches a failure output, a fingerprint, a thrown error
// or a log line (D-14, D-15). Corrupted copies of a real extraction must still end in codes only.
import { buildLayoutFingerprint } from '../layoutFingerprint';
import { pdfToDrafts } from '../toDraft';
import type { PdfDraftResult } from '../toDraft';
import { parsePdfReadResponse } from '../validate';
import type { PdfExtraction } from '../types';

const SECRETS = ['ALEX SAMPLE', '40302010', '20-30-40', 'EXAMPLE STREET', 'ACME'];
const CODES = [
  'bad-date', 'bad-amount', 'zero-amount', 'empty-description', 'unknown-currency', 'amount-too-large', 'conflicting-markers', 'bad-balance',
  'pdf-wrapped-description', 'pdf-no-date', 'pdf-ambiguous-column', 'pdf-ambiguous-date',
];

const base = require('./fixtures/current-account.extract.json') as PdfExtraction;
const clone = (): PdfExtraction => JSON.parse(JSON.stringify(base)) as PdfExtraction;

const options = { accountCurrency: 'GBP', exponentFor: () => 2, dayFirst: true, decimalMark: '.' as const, today: '2026-09-26', yearOverride: null };

const corruptions: Record<string, () => PdfExtraction> = {
  'identity strings in amount cells': () => {
    const e = clone();
    for (const p of e.pages) for (const i of p.items) if (i.x > 330) i.str = 'ALEX SAMPLE 40302010';
    return e;
  },
  'header removed': () => {
    const e = clone();
    for (const p of e.pages) p.items = p.items.filter((i) => !['Date', 'Description', 'Paid out', 'Paid in', 'Balance', 'Amount', 'Details', 'Money out', 'Money in'].includes(i.str));
    return e;
  },
  'all items blank': () => {
    const e = clone();
    for (const p of e.pages) for (const i of p.items) i.str = ' ';
    return e;
  },
  'pages emptied': () => {
    const e = clone();
    for (const p of e.pages) p.items = [];
    return e;
  },
  'identity everywhere': () => {
    const e = clone();
    for (const p of e.pages) for (const i of p.items) i.str = 'ACME 20-30-40 EXAMPLE STREET';
    return e;
  },
};

let spies: jest.SpyInstance[] = [];
beforeEach(() => {
  spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => undefined));
});
afterEach(() => {
  for (const s of spies) expect(s).not.toHaveBeenCalled();
  for (const s of spies) s.mockRestore();
});

const leaks = (value: unknown): string[] => SECRETS.filter((s) => JSON.stringify(value).includes(s));

function checkResult(r: PdfDraftResult): void {
  if (r.kind === 'unreadable') {
    expect(leaks(r)).toEqual([]);
    expect(Object.keys(r.fingerprint).sort()).toEqual(['failedStep', 'hasAmount', 'hasBalance', 'hasDate', 'hasDebitCredit', 'hasDescription', 'pages']);
    return;
  }
  for (const d of r.drafts) {
    expect(d.draft.layoutSignature).not.toContain('40302010');
    expect(d.draft.layoutSignature).toMatch(/^pdf\|[a-z]+\|[a-z,]*\|[.,]$/);
    for (const row of d.draft.rows) for (const code of row.issues) expect(CODES).toContain(code);
  }
}

describe.each(Object.keys(corruptions))('corrupted extraction: %s', (name) => {
  it('never throws, logs or leaks', () => {
    const e = corruptions[name]!();
    let result: PdfDraftResult | undefined;
    expect(() => {
      result = pdfToDrafts(e, options);
    }).not.toThrow();
    checkResult(result!);
    expect(() => parsePdfReadResponse({ ok: true, pageCount: e.pageCount, pages: e.pages })).not.toThrow();
    expect(() => parsePdfReadResponse({ ok: false, error: 'ALEX SAMPLE 40302010' })).not.toThrow();
    expect(parsePdfReadResponse({ ok: false, error: 'ALEX SAMPLE 40302010' })).toBeNull();
    const fp = buildLayoutFingerprint({ failedStep: 'no_table', pageCount: e.pageCount, roles: [] });
    expect(leaks(fp)).toEqual([]);
  });
});

it('a statement with nothing readable yields only the anonymous fingerprint', () => {
  const r = pdfToDrafts(corruptions['pages emptied']!(), options);
  expect(r.kind).toBe('unreadable');
  expect(leaks(r)).toEqual([]);
});
