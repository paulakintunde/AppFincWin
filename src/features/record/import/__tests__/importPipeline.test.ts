import fs from 'fs';
import path from 'path';
import { assert as fcAssert, boolean as fcBoolean, constantFrom as fcConstantFrom, property as fcProperty } from 'fast-check';
import type { BuiltinCategoryKey } from '@/engine/categorize';
import { minorUnits } from '@/engine/money';
import type { PendingOccurrence, RecurringSuggestion } from '@/engine/recurring';
import {
  inferProfile,
  type DraftRow,
  type ExistingRow,
  type FormatProfile,
  type StatedBalance,
  type StatementDraft,
} from '@/engine/statement';
import type { ExistingLeg, TransferAccount } from '@/engine/transfer';
import { arbLedger, renderDraft } from '@/engine/statement/__tests__/fixtures/ledgers';
import {
  buildPreview,
  prepareImport,
  resolveCsvDraft,
  resolveProfile,
  sizeBand,
  statementOptions,
  suggestionToSeries,
  toImportCommit,
  type CommitDecisions,
  type ExistingInfo,
  type PreparedImport,
  type PreviewAccount,
  type PreviewInput,
} from '../importPipeline';

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

// ---------------------------------------------------------------------------------------
// Task 2: resolveProfile, buildPreview, toImportCommit
// ---------------------------------------------------------------------------------------

const ACCOUNT: PreviewAccount = {
  id: 'acc-1',
  name: 'Current',
  kind: 'checking',
  currency: 'GBP',
  overdraftLimit: null,
  creditLimit: null,
};
const CARD_ACCOUNT: PreviewAccount = { ...ACCOUNT, id: 'acc-card', name: 'Card', kind: 'credit' };

const TRANSFER_ACCOUNTS: TransferAccount[] = [
  { id: 'acc-1', name: 'Current', kind: 'checking', currency: 'GBP', exponent: 2 },
  { id: 'acc-2', name: 'Savings', kind: 'savings', currency: 'GBP', exponent: 2 },
  { id: 'acc-usd', name: 'Dollars', kind: 'checking', currency: 'USD', exponent: 2 },
];

const DEPOSIT_PROFILE: FormatProfile = {
  version: 1,
  source: 'csv',
  accountFamily: 'deposit',
  positiveMeans: 'money-in',
  balanceMeans: 'held',
  statedLimit: null,
  decidedBy: 'user',
};
const CARD_PROFILE: FormatProfile = {
  ...DEPOSIT_PROFILE,
  accountFamily: 'card',
  positiveMeans: 'money-spent',
  balanceMeans: 'owed',
};

function draftRow(index: number, over: Partial<DraftRow> = {}): DraftRow {
  return {
    index,
    localDate: '2026-09-01',
    description: `ROW ${index}`,
    magnitude: minorUnits(1000),
    marker: 'minus',
    rawAmount: '-10.00',
    balanceMagnitude: null,
    balanceMarker: 'none',
    rawBalance: null,
    currency: 'GBP',
    externalId: null,
    trnType: null,
    issues: [],
    ...over,
  };
}

function draftOf(rows: DraftRow[], over: Partial<StatementDraft> = {}): StatementDraft {
  return {
    source: 'csv',
    layoutSignature: 'date|description|amount',
    accountHint: 'bank',
    currency: 'GBP',
    rows,
    statedOpening: null,
    statedClosing: null,
    available: null,
    statedLimit: null,
    balanceLabel: null,
    labels: [],
    periodStart: null,
    periodEnd: null,
    warnings: [],
    ...over,
  };
}

const stated = (n: number, marker: 'none' | 'minus' = 'none'): StatedBalance => ({
  magnitude: minorUnits(n),
  marker,
  asOf: null,
  raw: String(n),
});

function previewInput(draft: StatementDraft, over: Partial<PreviewInput> = {}): PreviewInput {
  return {
    draft,
    profile: DEPOSIT_PROFILE,
    format: 'csv',
    account: ACCOUNT,
    accounts: TRANSFER_ACCOUNTS,
    existing: [],
    pending: [],
    transferCandidates: [],
    perEur: new Map(),
    learned: new Map(),
    builtinIds: new Map<BuiltinCategoryKey, string>([
      ['Groceries', 'cat-groc'],
      ['Income', 'cat-inc'],
    ]),
    storedOpeningForFile: null,
    ...over,
  };
}

describe('resolveProfile', () => {
  const draft = draftOf([draftRow(0, { marker: 'minus' }), draftRow(1, { marker: 'none', description: 'SALARY' })]);

  it('returns the inference result unchanged', () => {
    const result = resolveProfile(draft, ACCOUNT, null);
    expect(result).toEqual(inferProfile(draft, { kind: 'checking', limit: null }, null));
  });

  it('uses a remembered profile only when the account and layout signature both match', () => {
    const remembered: FormatProfile = { ...DEPOSIT_PROFILE, positiveMeans: 'money-spent', decidedBy: 'user' };
    const match = resolveProfile(draft, ACCOUNT, { accountId: 'acc-1', signature: draft.layoutSignature, profile: remembered });
    expect(match.kind).toBe('decided');
    if (match.kind === 'decided') expect(match.profile.decidedBy).toBe('remembered');
    const otherAccount = resolveProfile(draft, ACCOUNT, { accountId: 'other', signature: draft.layoutSignature, profile: remembered });
    expect(otherAccount).toEqual(resolveProfile(draft, ACCOUNT, null));
    const otherLayout = resolveProfile(draft, ACCOUNT, { accountId: 'acc-1', signature: 'something else', profile: remembered });
    expect(otherLayout).toEqual(resolveProfile(draft, ACCOUNT, null));
  });

  it('surfaces an ambiguous OFX card profile with its candidates instead of picking one (E-CR-04)', () => {
    const ofxCard = draftOf([draftRow(0, { marker: 'plus', magnitude: minorUnits(5000), rawAmount: '50.00' })], {
      source: 'ofx',
      layoutSignature: 'ofx|card|',
      accountHint: 'card',
      statedClosing: stated(5000),
      available: stated(5000),
    });
    const result = resolveProfile(ofxCard, CARD_ACCOUNT, null);
    expect(result.kind).toBe('ambiguous');
    if (result.kind === 'ambiguous') {
      expect(result.candidates.length).toBeGreaterThan(1);
      expect(result.candidates.length).toBeLessThanOrEqual(4);
    }
  });
});

describe('buildPreview: conversion and reconciliation', () => {
  it('negative balances never lock or flag a row', () => {
    const draft = draftOf(
      [
        draftRow(0, { magnitude: minorUnits(5000), balanceMagnitude: minorUnits(15000), balanceMarker: 'minus' }),
        draftRow(1, { magnitude: minorUnits(4000), balanceMagnitude: minorUnits(19000), balanceMarker: 'minus' }),
        draftRow(2, { magnitude: minorUnits(5000), balanceMagnitude: minorUnits(24000), balanceMarker: 'minus' }),
      ],
      { statedOpening: stated(10000, 'minus') }
    );
    const preview = buildPreview(previewInput(draft));
    expect(preview.rows.map((r) => r.converted.amount)).toEqual([-5000, -4000, -5000]);
    expect(preview.rows.map((r) => r.converted.balance)).toEqual([-15000, -19000, -24000]);
    expect(preview.reconcile.file).toBe('all-verified');
    for (const r of preview.rows) {
      expect(r.check).toBe('verified');
      expect(r.included).toBe(true);
      expect(r.locked).toBe(false);
      expect(r.converted.issues).toEqual([]);
    }
  });

  it('converts a card over its limit: purchases negative, payment positive, limit offered once', () => {
    const draft = draftOf(
      [
        draftRow(0, { magnitude: minorUnits(130000), marker: 'none', rawAmount: '1300.00', balanceMagnitude: minorUnits(130000), rawBalance: '1300.00' }),
        draftRow(1, { magnitude: minorUnits(5000), marker: 'minus', rawAmount: '-50.00', description: 'PAYMENT THANK YOU', balanceMagnitude: minorUnits(125000), rawBalance: '1250.00' }),
      ],
      { statedOpening: stated(0) }
    );
    const profile: FormatProfile = { ...CARD_PROFILE, statedLimit: minorUnits(100000) };
    const preview = buildPreview(previewInput(draft, { profile, account: CARD_ACCOUNT }));
    expect(preview.rows.map((r) => r.converted.amount)).toEqual([-130000, 5000]);
    expect(preview.reconcile.file).toBe('all-verified');
    expect(preview.limitOffer).toEqual({ field: 'credit_limit', amount: 100000 });

    const withLimit = buildPreview(previewInput(draft, { profile, account: { ...CARD_ACCOUNT, creditLimit: 100000 } }));
    expect(withLimit.limitOffer).toBeNull();
    const otherLimit = buildPreview(previewInput(draft, { profile, account: { ...CARD_ACCOUNT, creditLimit: 50000 } }));
    expect(otherLimit.limitOffer).toBeNull();
    const noStated = buildPreview(previewInput(draft, { profile: CARD_PROFILE, account: CARD_ACCOUNT }));
    expect(noStated.limitOffer).toBeNull();
  });

  it('offers an overdraft limit for a bank account only from the profile and only when none is set', () => {
    const draft = draftOf([draftRow(0)]);
    const profile: FormatProfile = { ...DEPOSIT_PROFILE, statedLimit: minorUnits(50000) };
    expect(buildPreview(previewInput(draft, { profile })).limitOffer).toEqual({ field: 'overdraft_limit', amount: 50000 });
    expect(buildPreview(previewInput(draft, { profile, account: { ...ACCOUNT, overdraftLimit: 50000 } })).limitOffer).toBeNull();
  });

  it('marks a row whose running-balance link fails as cannot-verify but still committable', () => {
    const draft = draftOf(
      [
        draftRow(0, { balanceMagnitude: minorUnits(9000), balanceMarker: 'none' }),
        draftRow(1, { balanceMagnitude: minorUnits(5000), balanceMarker: 'none' }),
      ],
      { statedOpening: stated(10000) }
    );
    const preview = buildPreview(previewInput(draft));
    expect(preview.rows[0]?.check).toBe('verified');
    expect(preview.rows[1]?.check).toBe('cannot-verify');
    expect(preview.rows[1]).toMatchObject({ included: true, locked: false });
    expect(preview.reconcile.file).toBe('partial');
  });

  describe('OFX closing balance against a stored opening', () => {
    const rows = [
      draftRow(0, { magnitude: minorUnits(2500), marker: 'minus', externalId: 'F1' }),
      draftRow(1, { magnitude: minorUnits(10000), marker: 'plus', externalId: 'F2' }),
    ];
    const ofx = (closing: number) => draftOf(rows, { source: 'ofx', layoutSignature: 'ofx|bank|CHECKING', statedClosing: stated(closing) });
    const profile: FormatProfile = { ...DEPOSIT_PROFILE, source: 'ofx' };

    it('has nothing to check against without a stored opening', () => {
      const p = buildPreview(previewInput(ofx(57500), { profile, format: 'ofx', storedOpeningForFile: null }));
      expect(p.reconcile.file).toBe('none-in-file');
    });

    it('verifies when opening plus the rows equals the closing balance', () => {
      const p = buildPreview(previewInput(ofx(57500), { profile, format: 'ofx', storedOpeningForFile: 50000 }));
      expect(p.reconcile.file).toBe('all-verified');
    });

    it('reports a mismatch that is off by one minor unit', () => {
      const p = buildPreview(previewInput(ofx(57501), { profile, format: 'ofx', storedOpeningForFile: 50000 }));
      expect(p.reconcile.file).toBe('ends-only-mismatch');
      expect(p.rows.every((r) => r.check === 'cannot-verify' && r.included && !r.locked)).toBe(true);
    });

    it('does not use a stored opening for a CSV file', () => {
      const csv = draftOf(rows, { statedClosing: stated(57500) });
      const p = buildPreview(previewInput(csv, { storedOpeningForFile: 50000 }));
      expect(p.reconcile.file).toBe('none-in-file');
    });
  });

  it('reconciles an available-credit file with no known limit on its signed available figure (E-WR-07)', () => {
    const profile: FormatProfile = { ...CARD_PROFILE, balanceMeans: 'available' };
    const draft = draftOf(
      [
        draftRow(0, { magnitude: minorUnits(3000), marker: 'none', balanceMagnitude: minorUnits(97000) }),
        draftRow(1, { magnitude: minorUnits(2000), marker: 'none', balanceMagnitude: minorUnits(95000) }),
      ],
      { accountHint: 'card' }
    );
    const p = buildPreview(previewInput(draft, { profile, account: CARD_ACCOUNT }));
    expect(p.rows.map((r) => r.converted.availableSigned)).toEqual([97000, 95000]);
    expect(p.rows[1]?.check).toBe('verified');
  });

  it('blocking row issues lock a row and exclude it; bad-balance and unknown-currency do not', () => {
    const blocking = ['bad-date', 'bad-amount', 'zero-amount', 'amount-too-large', 'empty-description', 'conflicting-markers'] as const;
    const draft = draftOf([
      ...blocking.map((issue, i) => draftRow(i, { issues: [issue] })),
      draftRow(6, { issues: ['bad-balance'] }),
      draftRow(7, { issues: ['unknown-currency'] }),
    ]);
    const p = buildPreview(previewInput(draft));
    for (let i = 0; i < blocking.length; i += 1) expect(p.rows[i]).toMatchObject({ included: false, locked: true });
    expect(p.rows[6]).toMatchObject({ included: true, locked: false });
    expect(p.rows[7]).toMatchObject({ included: true, locked: false });
  });

  it('locks a row whose date or amount could not be read even without an issue code', () => {
    const draft = draftOf([draftRow(0, { localDate: null }), draftRow(1, { magnitude: null })]);
    const p = buildPreview(previewInput(draft));
    expect(p.rows.every((r) => !r.included && r.locked)).toBe(true);
  });

  it('carries raw strings, never throws on an empty draft, and keeps the decided profile and format', () => {
    const draft = draftOf([draftRow(0, { rawAmount: '-10.00', rawBalance: '1.00' })]);
    const p = buildPreview(previewInput(draft, { format: 'qfx' }));
    expect(p.rows[0]?.converted).toMatchObject({ rawAmount: '-10.00', rawBalance: '1.00' });
    expect(p.format).toBe('qfx');
    expect(p.profile).toBe(DEPOSIT_PROFILE);
    expect(buildPreview(previewInput(draftOf([]))).rows).toEqual([]);
  });

  it('property: converted amounts equal the ledger amounts under the decided profile, in any convention', () => {
    fcAssert(
      fcProperty(
        arbLedger(),
        fcConstantFrom<1 | -1>(1, -1),
        fcBoolean(),
        fcConstantFrom<'asc' | 'desc'>('asc', 'desc'),
        fcBoolean(),
        (ledger, s, card, orientation, withBalances) => {
          const balanceMeans = card ? 'owed' : 'held';
          const draft = renderDraft(ledger, {
            s,
            balanceMeans,
            kind: card ? 'credit' : 'checking',
            orientation,
            withBalances,
          });
          const profile: FormatProfile = {
            ...DEPOSIT_PROFILE,
            accountFamily: card ? 'card' : 'deposit',
            positiveMeans: s === 1 ? 'money-in' : 'money-spent',
            balanceMeans,
          };
          const p = buildPreview(previewInput(draft, { profile, account: card ? CARD_ACCOUNT : ACCOUNT }));
          const n = ledger.amounts.length;
          const expected = Array.from({ length: n }, (_, pos) => ledger.amounts[orientation === 'asc' ? pos : n - 1 - pos]);
          expect(p.rows.map((r) => r.converted.amount)).toEqual(expected);
        }
      ),
      { numRuns: 40 }
    );
  });
});

describe('buildPreview: duplicates', () => {
  const existing = (id: string, over: Partial<ExistingRow> = {}): ExistingRow => ({
    id,
    localDate: '2026-09-01',
    amount: -1000,
    name: 'ROW 0',
    externalId: null,
    importFormat: null,
    ...over,
  });

  it('starts a duplicate-flagged row unticked but not locked', () => {
    const p = buildPreview(previewInput(draftOf([draftRow(0)]), { existing: [existing('e1')] }));
    expect(p.rows[0]?.duplicate).toEqual({ kind: 'existing', id: 'e1', by: 'match' });
    expect(p.rows[0]).toMatchObject({ included: false, locked: false });
  });

  it('counts occurrences: two identical rows against one stored row flag exactly one', () => {
    const draft = draftOf([draftRow(0, { description: 'ROW 0' }), draftRow(1, { description: 'ROW 0' })]);
    const p = buildPreview(previewInput(draft, { existing: [existing('e1')] }));
    expect(p.rows.filter((r) => r.duplicate !== null)).toHaveLength(1);
    expect(p.rows.filter((r) => r.included)).toHaveLength(1);
  });

  it('keeps two identical rows of one file when nothing is stored', () => {
    const draft = draftOf([draftRow(0, { description: 'ROW 0' }), draftRow(1, { description: 'ROW 0' })]);
    const p = buildPreview(previewInput(draft));
    expect(p.rows.every((r) => r.included && r.duplicate === null)).toBe(true);
  });

  it('matches by FITID within the window and reports fitidDisabled for an unreliable file', () => {
    const ofx = draftOf([draftRow(0, { externalId: 'F1', localDate: '2026-09-03' })], { source: 'ofx' });
    const hit = buildPreview(
      previewInput(ofx, { format: 'ofx', existing: [existing('e1', { externalId: 'F1', name: 'DIFFERENT', localDate: '2026-09-01' })] })
    );
    expect(hit.rows[0]?.duplicate).toEqual({ kind: 'existing', id: 'e1', by: 'fitid' });
    expect(hit.fitidDisabled).toBe(false);

    const tooOld = buildPreview(
      previewInput(ofx, { format: 'ofx', existing: [existing('e1', { externalId: 'F1', name: 'DIFFERENT', localDate: '2026-08-01' })] })
    );
    expect(tooOld.rows[0]?.duplicate).toBeNull();

    const clash = draftOf(
      [draftRow(0, { externalId: 'F1' }), draftRow(1, { externalId: 'F1', magnitude: minorUnits(2000), localDate: '2026-09-02' })],
      { source: 'ofx' }
    );
    expect(buildPreview(previewInput(clash, { format: 'ofx' })).fitidDisabled).toBe(true);
  });

  it('flags a cross-format row within two days', () => {
    const ofx = draftOf([draftRow(0, { localDate: '2026-09-03' })], { source: 'ofx' });
    const p = buildPreview(previewInput(ofx, { format: 'ofx', existing: [existing('e1', { importFormat: 'csv' })] }));
    expect(p.rows[0]?.duplicate).toEqual({ kind: 'existing', id: 'e1', by: 'cross-format-window' });
  });
});

describe('buildPreview: transfers, mark-paid and categories', () => {
  const leg = (id: string, over: Partial<ExistingLeg> = {}): ExistingLeg => ({
    id,
    accountId: 'acc-2',
    localDate: '2026-09-01',
    amount: 10000,
    currency: 'GBP',
    name: 'FROM CURRENT',
    paymentType: null,
    transferId: null,
    ...over,
  });
  const out = (index: number, over: Partial<DraftRow> = {}) =>
    draftRow(index, { magnitude: minorUnits(10000), description: 'TRANSFER TO SAVINGS', ...over });

  it('suggests a pair, a choice and an orphan', () => {
    const pair = buildPreview(previewInput(draftOf([out(0)]), { transferCandidates: [leg('L1')] }));
    expect(pair.rows[0]?.transfer).toEqual({ kind: 'pair', existingId: 'L1' });

    const choose = buildPreview(previewInput(draftOf([out(0)]), { transferCandidates: [leg('L1'), leg('L2')] }));
    expect(choose.rows[0]?.transfer).toEqual({ kind: 'choose', options: ['L1', 'L2'] });

    const orphan = buildPreview(previewInput(draftOf([out(0)])));
    expect(orphan.rows[0]?.transfer).toEqual({ kind: 'orphan' });

    const none = buildPreview(previewInput(draftOf([draftRow(0, { description: 'TESCO' })])));
    expect(none.rows[0]?.transfer).toBeNull();
  });

  it('a choose reserves both legs: a second row is never offered either of them (E-WR-06)', () => {
    const draft = draftOf([out(0), out(1, { localDate: '2026-09-02' })]);
    const p = buildPreview(previewInput(draft, { transferCandidates: [leg('L1'), leg('L2')] }));
    const ids = p.rows.flatMap((r) =>
      r.transfer?.kind === 'pair' ? [r.transfer.existingId] : r.transfer?.kind === 'choose' ? r.transfer.options : []
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives a duplicate-flagged row no transfer suggestion', () => {
    const p = buildPreview(
      previewInput(draftOf([out(0)]), {
        transferCandidates: [leg('L1')],
        existing: [{ id: 'e1', localDate: '2026-09-01', amount: -10000, name: 'TRANSFER TO SAVINGS', externalId: null, importFormat: null }],
      })
    );
    expect(p.rows[0]?.duplicate).not.toBeNull();
    expect(p.rows[0]?.transfer).toBeNull();
  });

  it('attaches a pay-match and gives that row no transfer suggestion', () => {
    const pending: PendingOccurrence = {
      id: 'p1',
      version: 3,
      localDate: '2026-09-02',
      amount: -10000,
      currency: 'GBP',
      name: 'TRANSFER TO SAVINGS',
      accountId: 'acc-1',
    };
    const p = buildPreview(previewInput(draftOf([out(0)]), { pending: [pending], transferCandidates: [leg('L1')] }));
    expect(p.rows[0]?.payMatch).toEqual({ pendingId: 'p1' });
    expect(p.rows[0]?.transfer).toBeNull();
  });

  it('does not offer a pay-match for a duplicate-flagged row', () => {
    const pending: PendingOccurrence = { id: 'p1', version: 1, localDate: '2026-09-01', amount: -1000, currency: 'GBP', name: 'ROW 0', accountId: 'acc-1' };
    const p = buildPreview(
      previewInput(draftOf([draftRow(0)]), {
        pending: [pending],
        existing: [{ id: 'e1', localDate: '2026-09-01', amount: -1000, name: 'ROW 0', externalId: null, importFormat: null }],
      })
    );
    expect(p.rows[0]?.payMatch).toBeNull();
  });

  it('IN-04: a line in a mapped currency other than the pending occurrence’s is not offered as its payment', () => {
    const pending: PendingOccurrence = { id: 'p1', version: 1, localDate: '2026-09-01', amount: -1000, currency: 'GBP', name: 'ROW 0', accountId: 'acc-1' };
    const p = buildPreview(previewInput(draftOf([draftRow(0, { currency: 'EUR' })]), { pending: [pending] }));
    expect(p.rows[0]?.payMatch).toBeNull();
    const same = buildPreview(previewInput(draftOf([draftRow(0)]), { pending: [pending] }));
    expect(same.rows[0]?.payMatch).toEqual({ pendingId: 'p1' });
  });

  it('guesses categories: learned, keyword, income, none', () => {
    const draft = draftOf([
      draftRow(0, { description: 'TESCO STORES' }),
      draftRow(1, { description: 'CORNER SHOP', marker: 'none', magnitude: minorUnits(500) }),
      draftRow(2, { description: 'WEIRD THING' }),
      draftRow(3, { description: 'My Gym' }),
    ]);
    const p = buildPreview(previewInput(draft, { learned: new Map([['my gym', 'cat-gym']]) }));
    expect(p.rows.map((r) => [r.categoryId, r.categorySource])).toEqual([
      ['cat-groc', 'keyword'],
      ['cat-inc', 'income-default'],
      [null, 'none'],
      ['cat-gym', 'learned'],
    ]);
  });
});

describe('toImportCommit', () => {
  const NEW_IDS = () => {
    let n = 0;
    return () => `id-${++n}`;
  };
  const CTX = {
    householdId: 'hh-1',
    accountId: 'acc-1',
    timeZone: 'Europe/London',
    transferCategoryId: 'cat-transfer',
    accounts: TRANSFER_ACCOUNTS,
    existingById: new Map<string, ExistingInfo>(),
    accountVersion: 4,
    remember: null as { signature: string; id: string } | null,
  };
  const decisions = (over: Partial<CommitDecisions> = {}): CommitDecisions => ({
    included: new Set<number>(),
    categories: new Map(),
    links: new Map(),
    orphans: new Map(),
    payMatches: new Set(),
    acceptLimit: false,
    ...over,
  });
  const all = (p: { rows: { index: number }[] }) => new Set(p.rows.map((r) => r.index));

  it('inserts included rows as paid rows with provenance and the stored sign', () => {
    const draft = draftOf(
      [
        draftRow(0, { description: 'TESCO STORES', rawAmount: '-10.00', rawBalance: '5.00', externalId: 'F9' }),
        draftRow(1, { description: 'SALARY', marker: 'none', magnitude: minorUnits(200000), rawAmount: '2000.00' }),
        draftRow(2, { description: 'NOT TICKED' }),
      ],
      { source: 'ofx' }
    );
    const preview = buildPreview(previewInput(draft, { format: 'qfx' }));
    const { rows, finalize } = toImportCommit(preview, decisions({ included: new Set([0, 1]) }), CTX, 'batch-1', NEW_IDS());
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      id: 'id-1',
      household_id: 'hh-1',
      account_id: 'acc-1',
      original_amount: -1000,
      original_currency: 'GBP',
      local_date: '2026-09-01',
      time_zone: 'Europe/London',
      note: null,
      name: 'TESCO STORES',
      category_id: 'cat-groc',
      status: 'paid',
      import_batch_id: 'batch-1',
      raw_amount: '-10.00',
      raw_balance: '5.00',
      external_id: 'F9',
      import_format: 'ofx',
    });
    expect(rows[1]).toMatchObject({ original_amount: 200000, category_id: 'cat-inc', import_format: 'ofx' });
    expect(finalize).toEqual({ transferCategoryId: 'cat-transfer', links: [], markPaid: [], limit: null, profile: null });
  });

  it('uses csv as the import format for a csv file and honours a category override, including none', () => {
    const preview = buildPreview(previewInput(draftOf([draftRow(0, { description: 'TESCO' }), draftRow(1)])));
    const { rows } = toImportCommit(
      preview,
      decisions({ included: all(preview), categories: new Map<number, string | null>([[0, null], [1, 'cat-x']]) }),
      CTX,
      'b',
      NEW_IDS()
    );
    expect(rows.map((r) => [r.import_format, r.category_id])).toEqual([
      ['csv', null],
      ['csv', 'cat-x'],
    ]);
  });

  it('never commits a locked row even when it is in the included set', () => {
    const preview = buildPreview(previewInput(draftOf([draftRow(0, { issues: ['bad-date'] }), draftRow(1)])));
    const { rows } = toImportCommit(preview, decisions({ included: all(preview) }), CTX, 'b', NEW_IDS());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.raw_amount).toBe('-10.00');
  });

  it('carries no file name and no extra keys, and issue arrays hold codes only', () => {
    const preview = buildPreview(previewInput(draftOf([draftRow(0, { issues: ['bad-balance'] })])));
    expect(Object.keys(preview).sort()).toEqual(['fitidDisabled', 'format', 'limitOffer', 'profile', 'reconcile', 'rows']);
    expect(preview.rows[0]?.converted.issues).toEqual(['bad-balance']);
    const commit = toImportCommit(preview, decisions({ included: all(preview) }), CTX, 'b', NEW_IDS());
    expect(JSON.stringify(commit)).not.toMatch(/filename|\.csv|\.ofx/i);
  });

  describe('transfer links', () => {
    const leg: ExistingLeg = {
      id: 'L1',
      accountId: 'acc-2',
      localDate: '2026-09-01',
      amount: 10000,
      currency: 'GBP',
      name: 'FROM CURRENT',
      paymentType: null,
      transferId: null,
    };
    const stored = (over: Partial<ExistingInfo> = {}): ExistingInfo => ({
      version: 7,
      category_id: 'cat-old',
      local_date: '2026-09-01',
      original_amount: 10000,
      status: 'paid',
      transfer_id: null,
      ...over,
    });
    const preview = () =>
      buildPreview(
        previewInput(draftOf([draftRow(0, { magnitude: minorUnits(10000), description: 'TRANSFER TO SAVINGS' })]), {
          transferCandidates: [leg],
        })
      );

    it('builds a link to the stored row with its version, category and own transfer id', () => {
      const p = preview();
      const ctx = { ...CTX, existingById: new Map([['L1', stored()]]) };
      const { rows, finalize } = toImportCommit(p, decisions({ included: all(p), links: new Map([[0, 'L1']]) }), ctx, 'b', NEW_IDS());
      expect(rows).toHaveLength(1);
      expect(finalize.links).toEqual([
        {
          importedId: rows[0]?.id,
          importedCategoryId: rows[0]?.category_id ?? null,
          storedId: 'L1',
          storedVersion: 7,
          storedCategoryId: 'cat-old',
          transferId: expect.any(String),
          storedTransferId: null,
        },
      ]);
    });

    it('sets a link aside when the stored leg is already in a transfer (E-WR-06)', () => {
      const p = preview();
      const ctx = { ...CTX, existingById: new Map([['L1', stored({ transfer_id: 't-9' })]]) };
      const { rows, finalize } = toImportCommit(p, decisions({ included: all(p), links: new Map([[0, 'L1']]) }), ctx, 'b', NEW_IDS());
      expect(finalize.links).toEqual([]);
      expect(rows).toHaveLength(1);
    });

    it('sets a link aside when the stored row is unknown, the row is not included, or no Transfer category exists', () => {
      const p = preview();
      const known = new Map([['L1', stored()]]);
      const unknown = toImportCommit(p, decisions({ included: all(p), links: new Map([[0, 'L1']]) }), CTX, 'b', NEW_IDS());
      expect(unknown.finalize.links).toEqual([]);
      const notIncluded = toImportCommit(p, decisions({ links: new Map([[0, 'L1']]) }), { ...CTX, existingById: known }, 'b', NEW_IDS());
      expect(notIncluded.finalize.links).toEqual([]);
      const noCategory = toImportCommit(
        p,
        decisions({ included: all(p), links: new Map([[0, 'L1']]) }),
        { ...CTX, existingById: known, transferCategoryId: null },
        'b',
        NEW_IDS()
      );
      expect(noCategory.finalize.links).toEqual([]);
    });

    it('never links one stored leg to two rows', () => {
      const p = buildPreview(
        previewInput(
          draftOf([
            draftRow(0, { magnitude: minorUnits(10000), description: 'TRANSFER TO SAVINGS' }),
            draftRow(1, { magnitude: minorUnits(10000), description: 'TRANSFER TO SAVINGS', localDate: '2026-09-02' }),
          ]),
          { transferCandidates: [leg] }
        )
      );
      const ctx = { ...CTX, existingById: new Map([['L1', stored()]]) };
      const { finalize } = toImportCommit(
        p,
        decisions({ included: all(p), links: new Map([[0, 'L1'], [1, 'L1']]) }),
        ctx,
        'b',
        NEW_IDS()
      );
      expect(finalize.links).toHaveLength(1);
    });
  });

  describe('orphan transfers', () => {
    const preview = (over: Partial<DraftRow> = {}) =>
      buildPreview(previewInput(draftOf([draftRow(0, { magnitude: minorUnits(10000), description: 'TRANSFER TO SAVINGS', ...over })])));

    it('inserts the row and an exactly negated counter-leg sharing one transfer id, both Transfer category', () => {
      const p = preview();
      const { rows } = toImportCommit(
        p,
        decisions({ included: all(p), orphans: new Map([[0, { accountId: 'acc-2', counterAmount: null }]]) }),
        CTX,
        'b',
        NEW_IDS()
      );
      expect(rows).toHaveLength(2);
      const [a, b] = rows;
      expect(a?.account_id).toBe('acc-1');
      expect(b?.account_id).toBe('acc-2');
      expect(a?.original_amount).toBe(-10000);
      expect(b?.original_amount).toBe(10000);
      expect(a?.transfer_id).toBeTruthy();
      expect(a?.transfer_id).toBe(b?.transfer_id);
      expect(a?.category_id).toBe('cat-transfer');
      expect(b?.category_id).toBe('cat-transfer');
      expect(b).toMatchObject({ status: 'paid', local_date: '2026-09-01', original_currency: 'GBP', external_id: null, raw_amount: null });
      expect(a?.id).not.toBe(b?.id);
    });

    it('needs the typed amount for a cross-currency counter-leg and uses it as given', () => {
      const p = preview();
      const without = toImportCommit(
        p,
        decisions({ included: all(p), orphans: new Map([[0, { accountId: 'acc-usd', counterAmount: null }]]) }),
        CTX,
        'b',
        NEW_IDS()
      );
      expect(without.rows).toHaveLength(1);
      expect(without.rows[0]?.transfer_id ?? null).toBeNull();

      const withAmount = toImportCommit(
        p,
        decisions({ included: all(p), orphans: new Map([[0, { accountId: 'acc-usd', counterAmount: 12700 }]]) }),
        CTX,
        'b',
        NEW_IDS()
      );
      expect(withAmount.rows).toHaveLength(2);
      expect(withAmount.rows[1]).toMatchObject({ original_amount: 12700, original_currency: 'USD', account_id: 'acc-usd' });
    });

    it('puts the outgoing leg first-signed negative when the imported row is money in', () => {
      const p = buildPreview(previewInput(draftOf([draftRow(0, { magnitude: minorUnits(4000), marker: 'none', description: 'TRANSFER FROM SAVINGS' })])));
      const { rows } = toImportCommit(
        p,
        decisions({ included: all(p), orphans: new Map([[0, { accountId: 'acc-2', counterAmount: null }]]) }),
        CTX,
        'b',
        NEW_IDS()
      );
      expect(rows.map((r) => r.original_amount)).toEqual([4000, -4000]);
    });

    it('sets the orphan aside for the same account, an unknown account, or a row that is not an orphan suggestion', () => {
      const p = preview();
      for (const accountId of ['acc-1', 'nope']) {
        const { rows } = toImportCommit(
          p,
          decisions({ included: all(p), orphans: new Map([[0, { accountId, counterAmount: null }]]) }),
          CTX,
          'b',
          NEW_IDS()
        );
        expect(rows).toHaveLength(1);
      }
      const plain = buildPreview(previewInput(draftOf([draftRow(0, { description: 'TESCO' })])));
      const { rows } = toImportCommit(
        plain,
        decisions({ included: all(plain), orphans: new Map([[0, { accountId: 'acc-2', counterAmount: null }]]) }),
        CTX,
        'b',
        NEW_IDS()
      );
      expect(rows).toHaveLength(1);
    });

    it('sets the orphan aside when there is no Transfer category', () => {
      const p = preview();
      const { rows } = toImportCommit(
        p,
        decisions({ included: all(p), orphans: new Map([[0, { accountId: 'acc-2', counterAmount: null }]]) }),
        { ...CTX, transferCategoryId: null },
        'b',
        NEW_IDS()
      );
      expect(rows).toHaveLength(1);
    });
  });

  describe('mark paid', () => {
    const pending: PendingOccurrence = {
      id: 'p1',
      version: 3,
      localDate: '2026-09-02',
      amount: -1000,
      currency: 'GBP',
      name: 'ROW 0',
      accountId: 'acc-1',
    };
    const info: ExistingInfo = {
      version: 3,
      category_id: null,
      local_date: '2026-09-02',
      original_amount: -1000,
      status: 'pending',
      transfer_id: null,
    };
    const preview = () => buildPreview(previewInput(draftOf([draftRow(0, { magnitude: minorUnits(1000) })]), { pending: [pending] }));

    it('replaces the inserted row with an in-place patch of the pending row and keeps the line for fallback', () => {
      const p = preview();
      expect(p.rows[0]?.payMatch).toEqual({ pendingId: 'p1' });
      const ctx = { ...CTX, existingById: new Map([['p1', info]]) };
      const { rows, finalize } = toImportCommit(p, decisions({ included: all(p), payMatches: new Set([0]) }), ctx, 'b', NEW_IDS());
      expect(rows).toEqual([]);
      expect(finalize.markPaid).toEqual([
        {
          pendingId: 'p1',
          expectedVersion: 3,
          before: { status: 'pending', local_date: '2026-09-02', original_amount: -1000 },
          patch: { status: 'paid', local_date: '2026-09-01', original_amount: -1000 },
          line: expect.objectContaining({ original_amount: -1000, status: 'paid', local_date: '2026-09-01', import_batch_id: 'b' }),
        },
      ]);
    });

    it('inserts the line as an ordinary row when the pending row is unknown or no longer pending', () => {
      const p = preview();
      const unknown = toImportCommit(p, decisions({ included: all(p), payMatches: new Set([0]) }), CTX, 'b', NEW_IDS());
      expect(unknown.rows).toHaveLength(1);
      expect(unknown.finalize.markPaid).toEqual([]);
      const paid = { ...CTX, existingById: new Map([['p1', { ...info, status: 'paid' }]]) };
      const stale = toImportCommit(p, decisions({ included: all(p), payMatches: new Set([0]) }), paid, 'b', NEW_IDS());
      expect(stale.rows).toHaveLength(1);
      expect(stale.finalize.markPaid).toEqual([]);
    });

    it('ignores a mark-paid decision for a row that has no match', () => {
      const p = buildPreview(previewInput(draftOf([draftRow(0)])));
      const { rows, finalize } = toImportCommit(p, decisions({ included: all(p), payMatches: new Set([0]) }), CTX, 'b', NEW_IDS());
      expect(rows).toHaveLength(1);
      expect(finalize.markPaid).toEqual([]);
    });
  });

  it('builds the limit patch only when accepted, and the profile only when remembered', () => {
    const profile: FormatProfile = { ...CARD_PROFILE, statedLimit: minorUnits(100000) };
    const preview = buildPreview(previewInput(draftOf([draftRow(0)]), { profile, account: CARD_ACCOUNT }));
    const accepted = toImportCommit(
      preview,
      decisions({ included: all(preview), acceptLimit: true }),
      { ...CTX, accountId: 'acc-card', remember: { signature: 'sig', id: 'prof-1' } },
      'b',
      NEW_IDS()
    );
    expect(accepted.finalize.limit).toEqual({
      accountId: 'acc-card',
      expectedVersion: 4,
      before: { credit_limit: null },
      patch: { credit_limit: 100000 },
    });
    expect(accepted.finalize.profile).toEqual({ accountId: 'acc-card', signature: 'sig', profile, id: 'prof-1' });

    const declined = toImportCommit(preview, decisions({ included: all(preview) }), CTX, 'b', NEW_IDS());
    expect(declined.finalize.limit).toBeNull();

    const noOffer = buildPreview(previewInput(draftOf([draftRow(0)])));
    expect(toImportCommit(noOffer, decisions({ included: all(noOffer), acceptLimit: true }), CTX, 'b', NEW_IDS()).finalize.limit).toBeNull();
  });

  it('builds an overdraft limit patch for a bank account', () => {
    const profile: FormatProfile = { ...DEPOSIT_PROFILE, statedLimit: minorUnits(50000) };
    const preview = buildPreview(previewInput(draftOf([draftRow(0)]), { profile }));
    const { finalize } = toImportCommit(preview, decisions({ included: all(preview), acceptLimit: true }), CTX, 'b', NEW_IDS());
    expect(finalize.limit).toEqual({
      accountId: 'acc-1',
      expectedVersion: 4,
      before: { overdraft_limit: null },
      patch: { overdraft_limit: 50000 },
    });
  });
});

describe('sizeBand', () => {
  it('bands a row count', () => {
    expect([1, 50, 51, 500, 501, 5000].map(sizeBand)).toEqual(['1-50', '1-50', '51-500', '51-500', '501-5000', '501-5000']);
  });
});

describe('suggestionToSeries', () => {
  const suggestion: RecurringSuggestion = {
    key: 'netflix|GBP|-',
    name: 'NETFLIX',
    amount: -999,
    currency: 'GBP',
    freq: 'monthly',
    anchorDate: '2026-11-03',
    rowIds: ['r1', 'r2', 'r3'],
  };
  const rows = [
    { id: 'r1', localDate: '2026-07-03', categoryId: 'cat-a' },
    { id: 'r3', localDate: '2026-09-03', categoryId: 'cat-latest' },
    { id: 'r2', localDate: '2026-08-03', categoryId: 'cat-b' },
    { id: 'other', localDate: '2026-09-04', categoryId: 'cat-z' },
  ];

  it('anchors on the latest row, links the others and takes that row category', () => {
    const r = suggestionToSeries(suggestion, rows, { householdId: 'hh', accountId: 'acc-1', timeZone: 'Europe/London' }, 'series-1');
    expect(r.anchorTransactionId).toBe('r3');
    expect(r.linkTransactionIds.sort()).toEqual(['r1', 'r2']);
    expect(r.series).toEqual({
      id: 'series-1',
      household_id: 'hh',
      account_id: 'acc-1',
      name: 'NETFLIX',
      amount: -999,
      currency: 'GBP',
      category_id: 'cat-latest',
      payment_type: null,
      freq: 'monthly',
      anchor_date: '2026-11-03',
      time_zone: 'Europe/London',
      end_date: null,
      occurrence_count: null,
    });
  });

  it('copes with rows that do not include a suggested id', () => {
    const r = suggestionToSeries(suggestion, [], { householdId: 'hh', accountId: 'a', timeZone: 'UTC' }, 's');
    expect(r.anchorTransactionId).toBe('r3');
    expect(r.linkTransactionIds).toEqual(['r1', 'r2']);
    expect(r.series.category_id).toBeNull();
  });

  it('breaks a same-day tie towards the later row in the list', () => {
    const tie = [
      { id: 'r1', localDate: '2026-09-03', categoryId: null },
      { id: 'r2', localDate: '2026-09-03', categoryId: null },
    ];
    const r = suggestionToSeries({ ...suggestion, rowIds: ['r1', 'r2'] }, tie, { householdId: 'h', accountId: 'a', timeZone: 'UTC' }, 's');
    expect(r.anchorTransactionId).toBe('r2');
  });
});
