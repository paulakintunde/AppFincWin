import type { BuiltinCategoryKey } from '@/engine/categorize';
import { minorUnits } from '@/engine/money';
import type { PendingOccurrence } from '@/engine/recurring';
import type { DraftRow, ExistingRow, FormatProfile, PdfExtraction, StatementDraft } from '@/engine/statement';
import type { ExistingLeg, TransferAccount } from '@/engine/transfer';
import {
  buildPreview,
  needsClosingBalance,
  pdfStatementOptions,
  prepareImport,
  preparePdfDrafts,
  resolveProfile,
  reviewGate,
  toImportCommit,
  withClosingBalance,
  type ExistingInfo,
  type PreviewAccount,
  type PreviewInput,
} from '../importPipeline';

const EXPONENTS: Record<string, number> = { GBP: 2, USD: 2, EUR: 2, JPY: 0 };
const exponentFor = (code: string): number | null => EXPONENTS[code] ?? null;
const REGION = { decimal: '.' as const, dayFirst: true };
const enc = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, 'utf8'));

const FIXTURES = '../../../../engine/statement/pdf/__tests__/fixtures';
const extractOf = (name: string): PdfExtraction => require(`${FIXTURES}/${name}.extract.json`) as PdfExtraction;
const pdfCtx = { accountCurrency: 'GBP', region: REGION, today: '2026-09-26', yearOverride: null };

const ACCOUNT: PreviewAccount = {
  id: 'acc-1',
  name: 'Current',
  kind: 'checking',
  currency: 'GBP',
  overdraftLimit: null,
  creditLimit: null,
};
const TRANSFER_ACCOUNTS: TransferAccount[] = [
  { id: 'acc-1', name: 'Current', kind: 'checking', currency: 'GBP', exponent: 2 },
  { id: 'acc-2', name: 'Savings', kind: 'savings', currency: 'GBP', exponent: 2 },
];

function draftsOf(name: string) {
  const r = preparePdfDrafts(extractOf(name), pdfCtx, exponentFor);
  if (r.kind !== 'drafts') throw new Error('unreadable');
  return r.drafts;
}
const pdfDraft = (name = 'current-account'): StatementDraft => draftsOf(name)[0]!.draft;

function csvDraft(): StatementDraft {
  const row: DraftRow = {
    index: 0,
    localDate: '2026-09-01',
    description: 'ROW 0',
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
  };
  return {
    source: 'csv',
    layoutSignature: 'x',
    accountHint: 'bank',
    currency: 'GBP',
    rows: [row],
    statedOpening: null,
    statedClosing: null,
    available: null,
    statedLimit: null,
    balanceLabel: null,
    labels: [],
    periodStart: null,
    periodEnd: null,
    warnings: [],
  };
}

function previewInput(draft: StatementDraft, over: Partial<PreviewInput> = {}): PreviewInput {
  return {
    draft,
    profile: {
      version: 1,
      source: 'csv',
      accountFamily: 'deposit',
      positiveMeans: 'money-in',
      balanceMeans: 'held',
      statedLimit: null,
      decidedBy: 'user',
    },
    format: 'csv',
    account: ACCOUNT,
    accounts: TRANSFER_ACCOUNTS,
    existing: [],
    pending: [],
    transferCandidates: [],
    perEur: new Map(),
    learned: new Map(),
    builtinIds: new Map<BuiltinCategoryKey, string>([['Groceries', 'cat-groc']]),
    storedOpeningForFile: null,
    ...over,
  };
}

function profileOf(draft: StatementDraft): FormatProfile {
  const r = resolveProfile(draft, ACCOUNT, null);
  if (r.kind !== 'decided') throw new Error('ambiguous');
  return r.profile;
}
const pdfPreview = (draft: StatementDraft, over: Partial<PreviewInput> = {}) =>
  buildPreview(previewInput(draft, { profile: profileOf(draft), format: 'pdf', ...over }));

describe('PDF: prepareImport, drafts, options, closing balance', () => {
  it('recognises a PDF from its bytes without decoding, with an empty statements array', () => {
    expect(prepareImport(enc('%PDF-1.7\n%binary'), { extension: 'other' }, REGION, exponentFor)).toEqual({
      ok: true,
      prepared: { format: 'pdf', statements: [] },
    });
  });

  it('lets a PDF through at 6 MB but refuses a 6 MB CSV as too_big', () => {
    const pdf = new Uint8Array(6 * 1024 * 1024);
    pdf.set(enc('%PDF-1.7\n'));
    expect(prepareImport(pdf, { extension: 'pdf' }, REGION, exponentFor)).toMatchObject({ ok: true });
    const csv = new Uint8Array(6 * 1024 * 1024).fill(97);
    csv.set(enc('Date,Description,Amount\n'));
    expect(prepareImport(csv, { extension: 'csv' }, REGION, exponentFor)).toEqual({ ok: false, reason: 'too_big' });
  });

  it('builds one draft for a current account and two for a multi-account statement', () => {
    expect(draftsOf('current-account')).toHaveLength(1);
    const multi = draftsOf('multi-account');
    expect(multi).toHaveLength(2);
    const options = pdfStatementOptions(multi);
    expect(options.map((o) => o.label)).toEqual(['checking', 'savings']);
    expect(options.map((o) => o.index)).toEqual([0, 1]);
    expect(options.every((o) => o.kind === 'bank' && o.count > 0)).toBe(true);
    expect(options.map((o) => o.count)).toEqual(multi.map((d) => d.draft.rows.length));
  });

  it('fills a missing period from the first and last row dates, and keeps a stated one', () => {
    const none = pdfDraft('no-balances');
    expect(none.periodStart).toBe('2026-03-03');
    expect(none.periodEnd).toBe('2026-03-29');
    const stated = pdfDraft('current-account');
    expect(stated.periodStart).toBe('2026-03-01');
    expect(stated.periodEnd).toBe('2026-03-31');
  });

  it('asks for a closing balance only when a PDF has no balances at all', () => {
    expect(needsClosingBalance(pdfDraft('no-balances'))).toBe(true);
    expect(needsClosingBalance(pdfDraft('current-account'))).toBe(false);
    expect(needsClosingBalance(csvDraft())).toBe(false);
  });

  it('withClosingBalance returns a copy dated at the period end', () => {
    const original = pdfDraft('no-balances');
    const next = withClosingBalance(original, { magnitude: minorUnits(1234560), marker: 'none', raw: '12,345.60' });
    expect(next.statedClosing).toEqual({ magnitude: 1234560, marker: 'none', asOf: original.periodEnd, raw: '12,345.60' });
    expect(original.statedClosing).toBeNull();
    expect(next).not.toBe(original);
  });
});

describe('PDF: buildPreview, reviewGate and commit', () => {
  const existingRow = (over: Partial<ExistingRow> = {}): ExistingRow => ({
    id: 'e1',
    localDate: '2026-03-03',
    amount: -4520,
    name: 'ACME GROCERS',
    externalId: null,
    importFormat: 'csv',
    ...over,
  });

  it('marks uncertain rows cannot-verify but included and unlocked, and the file partial', () => {
    const p = pdfPreview(pdfDraft());
    for (const i of [5, 18]) {
      expect(p.rows[i]).toMatchObject({ check: 'cannot-verify', included: true, locked: false });
    }
    expect(p.reconcile.file).toBe('partial');
  });

  it('flags a CSV row one day off as a cross-format possible duplicate and still attaches transfers', () => {
    const leg: ExistingLeg = {
      id: 'L1',
      accountId: 'acc-2',
      localDate: '2026-03-01',
      amount: 50000,
      currency: 'GBP',
      name: 'FROM CURRENT',
      paymentType: null,
      transferId: null,
    };
    const p = pdfPreview(pdfDraft(), { existing: [existingRow()], transferCandidates: [leg] });
    expect(p.rows[1]?.duplicate).toEqual({ kind: 'existing', id: 'e1', by: 'cross-format-window' });
    expect(p.rows[1]?.included).toBe(false);
    expect(p.rows[0]?.transfer).not.toBeNull();
  });

  it('offers the stated limit into a credit account whose limit is 0 (D-49)', () => {
    const draft = pdfDraft('credit-card');
    const account: PreviewAccount = { ...ACCOUNT, id: 'acc-card', name: 'Visa', kind: 'credit', creditLimit: 0 };
    const r = resolveProfile(draft, account, null);
    if (r.kind !== 'decided') throw new Error('ambiguous');
    const p = buildPreview(previewInput(draft, { profile: r.profile, format: 'pdf', account }));
    expect(p.limitOffer).toEqual({ field: 'credit_limit', amount: 100000 });
  });

  it('pairs a card payment with the matching outgoing leg on another account', () => {
    const draft = pdfDraft('credit-card');
    const account: PreviewAccount = { ...ACCOUNT, id: 'acc-card', name: 'Example Card', kind: 'credit' };
    const r = resolveProfile(draft, account, null);
    if (r.kind !== 'decided') throw new Error('ambiguous');
    const leg: ExistingLeg = {
      id: 'L9',
      accountId: 'acc-1',
      localDate: '2026-03-01',
      amount: -50000,
      currency: 'GBP',
      name: 'CARD PAYMENT EXAMPLE CARD',
      paymentType: null,
      transferId: null,
    };
    const accounts: TransferAccount[] = [...TRANSFER_ACCOUNTS, { id: 'acc-card', name: 'Example Card', kind: 'credit', currency: 'GBP', exponent: 2 }];
    const p = buildPreview(previewInput(draft, { profile: r.profile, format: 'pdf', account, accounts, transferCandidates: [leg] }));
    const idx = p.rows.findIndex((row) => row.converted.amount === 50000);
    expect(p.rows[idx]?.transfer).toEqual({ kind: 'pair', existingId: 'L9' });
  });

  it('does not flag a row one day off an earlier PDF import: same-format matching is exact-date', () => {
    const p = pdfPreview(pdfDraft(), { existing: [existingRow({ importFormat: 'pdf' })] });
    expect(p.rows[1]?.duplicate).toBeNull();
    const exact = pdfPreview(pdfDraft(), { existing: [existingRow({ importFormat: 'pdf', localDate: '2026-03-02' })] });
    expect(exact.rows[1]?.duplicate).toMatchObject({ kind: 'existing', id: 'e1' });
  });

  it('carries the Automatic pay-match suggestion exactly as for CSV', () => {
    const pending: PendingOccurrence = {
      id: 'p1',
      version: 1,
      localDate: '2026-03-03',
      amount: -8900,
      currency: 'GBP',
      name: 'NORTHWIND ENERGY',
      accountId: 'acc-1',
      automatic: true,
    };
    const p = pdfPreview(pdfDraft(), { pending: [pending] });
    expect(p.rows[2]?.payMatch).toEqual({ pendingId: 'p1', automatic: true });
  });

  it('carries a refund suggestion exactly as for CSV', () => {
    const p = pdfPreview(pdfDraft(), {
      purchases: [
        { id: 'pur-1', amount: -50000, currency: 'GBP', name: 'Wingtip Toys', localDate: '2026-02-20', categoryId: 'cat-x', isRefund: false },
      ],
    });
    // Nothing PDF-specific: the refund stage runs over the same rows; a money-out row never matches a purchase.
    expect(p.rows.filter((r) => r.refund !== null)).toHaveLength(0);
    const refunded = pdfPreview(pdfDraft(), {
      purchases: [
        { id: 'pur-2', amount: -185000, currency: 'GBP', name: 'Contoso Payroll', localDate: '2026-02-20', categoryId: 'cat-x', isRefund: false },
      ],
    });
    expect(refunded.rows[19]?.refund?.purchaseId).toBe('pur-2');
  });

  it('checks a user closing balance against the stored opening, leaving only the uncertain row unverified', () => {
    const base = pdfDraft('no-balances');
    const total = pdfPreview(base).rows.reduce((n, r) => n + (r.converted.amount ?? 0), 0);
    const opening = 500000;
    const draft = withClosingBalance(base, { magnitude: minorUnits(opening + total), marker: 'none', raw: 'x' });
    const p = pdfPreview(draft, { storedOpeningForFile: opening });
    expect(p.reconcile.file).toBe('partial');
    expect(p.rows.filter((r) => r.check === 'cannot-verify').map((r) => r.index)).toEqual([6]);
    expect(p.rows.filter((r) => r.check === 'verified')).toHaveLength(9);
  });

  it('reviewGate counts included unverified rows for PDF and is off for CSV and OFX', () => {
    const p = pdfPreview(pdfDraft());
    expect(reviewGate(p)).toEqual({ required: true, count: 2 });
    const unticked = { ...p, rows: p.rows.map((r) => (r.index === 5 ? { ...r, included: false } : r)) };
    expect(reviewGate(unticked)).toEqual({ required: true, count: 1 });
    const csv = buildPreview(previewInput(csvDraft()));
    expect(reviewGate(csv)).toEqual({ required: false, count: 0 });
    expect(reviewGate({ ...csv, format: 'ofx' })).toEqual({ required: false, count: 0 });
  });

  it("stamps committed rows import_format 'pdf' with raw_amount and no external_id", () => {
    const p = pdfPreview(pdfDraft());
    const ctx = {
      householdId: 'hh-1',
      accountId: 'acc-1',
      timeZone: 'Europe/London',
      transferCategoryId: 'cat-transfer',
      accounts: TRANSFER_ACCOUNTS,
      existingById: new Map<string, ExistingInfo>(),
      accountVersion: 1,
      remember: null,
    };
    let n = 0;
    const { rows } = toImportCommit(
      p,
      {
        included: new Set(p.rows.map((r) => r.index)),
        categories: new Map(),
        links: new Map(),
        orphans: new Map(),
        payMatches: new Set(),
        acceptLimit: false,
      },
      ctx,
      'batch-1',
      () => `id-${++n}`
    );
    expect(rows).toHaveLength(30);
    expect(rows.every((r) => r.import_format === 'pdf' && r.external_id === null && r.raw_amount !== null)).toBe(true);
  });
});
