// IMP-05 / D-30, D-32, D-34: the four foreign fixtures (PDF credit-card, OFX ORIGCURRENCY, OFX CURRENCY,
// CSV original-amount columns) go through the one shared extractor and Phase 2's unchanged profile,
// conversion and reconciliation. Every figure is in the account currency; the foreign amount is provenance.
import * as fs from 'fs';
import * as path from 'path';
import { csvToDraft, detectColumns, inferDateFormat, inferNumberNotation, notationFor, tokenize } from '../../csv';
import { parseOfx } from '../../ofx';
import { pdfToDrafts } from '../pdf/toDraft';
import { knownCurrencyExponent, minorUnits, type MinorUnits } from '../../money';
import type { PdfExtraction } from '../pdf/types';
import { applyUncertainRows, convertDraft, impliedRate, inferProfile, linkFxFees, reconcile } from '..';
import type { AccountKind, StatementDraft } from '..';

// Review HI-01: the real known-currency lookup, not an allow-list.
const exponentFor = (code: string): number | null => knownCurrencyExponent(code);
const foreignText = (name: string): string => fs.readFileSync(path.join(__dirname, 'fixtures', 'foreign', name), 'utf8');

function ofxDraft(name: string): StatementDraft {
  const result = parseOfx(foreignText(name), { exponentFor });
  if (!result.ok) throw new Error('fixture failed to parse');
  return result.drafts[0] as StatementDraft;
}

function csvDraft(name: string): StatementDraft {
  const tokens = tokenize(foreignText(name));
  if (!tokens.ok) throw new Error('fixture failed to tokenise');
  const [header, ...rows] = tokens.rows as [string[], ...string[][]];
  const { mapping } = detectColumns(header, rows);
  const dates = inferDateFormat(rows.map((r) => r[0] ?? ''));
  const notation = inferNumberNotation(rows.map((r) => r[2] ?? ''));
  return csvToDraft(header, rows, {
    mapping,
    dateFormat: dates.kind === 'certain' ? dates.format : 'DMY',
    notation: notation.kind === 'certain' ? notation.notation : notationFor('.'),
    delimiter: tokens.delimiter,
    defaultCurrency: 'GBP',
    exponentFor,
  });
}

function pdfDraft(): StatementDraft {
  const extraction = require('../pdf/__tests__/fixtures/credit-card.extract.json') as PdfExtraction;
  const result = pdfToDrafts(extraction, {
    accountCurrency: 'GBP',
    exponentFor,
    dayFirst: true,
    decimalMark: '.',
    today: '2026-09-26',
    yearOverride: null,
  });
  if (result.kind !== 'drafts') throw new Error('expected drafts');
  return result.drafts[0]!.draft;
}

interface Case {
  name: string;
  draft: () => StatementDraft;
  kind: AccountKind;
  /** Stated opening used when the format carries none (OFX has only a closing balance). */
  opening: MinorUnits | null;
  closing: number;
  files: string[];
  rate: string;
  purchase: number;
  fee: number;
  charged: number;
  foreignMinor: number;
}

const CASES: Case[] = [
  {
    name: 'credit-card.extract.json (PDF)',
    draft: pdfDraft,
    kind: 'credit',
    opening: null,
    closing: -125000,
    files: ['partial'], // the foreign row keeps its D-23 flag, so the file is partial
    rate: '0.7862',
    purchase: 4,
    fee: 5,
    charged: -3538,
    foreignMinor: -4500,
  },
  {
    name: 'card-origcurrency.ofx',
    draft: () => ofxDraft('card-origcurrency.ofx'),
    kind: 'credit',
    opening: minorUnits(-30000),
    closing: -37944,
    files: ['all-verified'],
    rate: '1.392',
    purchase: 1,
    fee: 2,
    charged: -1392,
    foreignMinor: -1000,
  },
  {
    name: 'card-currency.ofx',
    draft: () => ofxDraft('card-currency.ofx'),
    kind: 'credit',
    opening: minorUnits(-30000),
    closing: -37944,
    files: ['all-verified'],
    rate: '1.392',
    purchase: 1,
    fee: 2,
    charged: -1392,
    foreignMinor: -1000,
  },
  {
    name: 'card-foreign.csv',
    draft: () => csvDraft('card-foreign.csv'),
    kind: 'checking',
    opening: null,
    closing: 121040,
    files: ['all-verified'],
    rate: '0.7862',
    purchase: 2,
    fee: 3,
    charged: -3538,
    foreignMinor: -4500,
  },
];

describe.each(CASES)('$name', (c) => {
  const draft = c.draft();
  const profile = inferProfile(draft, { kind: c.kind, limit: null }, null);

  it('is a decided profile', () => {
    expect(profile.kind).toBe('decided');
  });
  if (profile.kind !== 'decided') return;

  const converted = convertDraft(draft, profile.profile, { limit: null });

  it('keeps the account-currency charged amount and carries the foreign figure', () => {
    const row = converted.rows[c.purchase]!;
    expect(row.amount).toBe(c.charged);
    expect(row.foreign).toEqual({ amount: c.foreignMinor, currency: 'USD' });
    expect(converted.rows.filter((_, k) => k !== c.purchase).every((r) => (r.foreign ?? null) === null)).toBe(true);
    const rate = impliedRate(
      { magnitude: Math.abs(c.charged), exponent: 2 },
      { magnitude: Math.abs(c.foreignMinor), exponent: 2 },
    );
    expect(rate).toBe(c.rate);
  });

  it('reconciles in the account currency', () => {
    expect(converted.closing).toBe(c.closing);
    const result = applyUncertainRows(
      reconcile(
        converted.rows.map((r) => ({ amount: r.amount, balance: r.balance, localDate: r.localDate })),
        { opening: converted.opening ?? c.opening, closing: converted.closing },
      ),
      draft.rows,
    );
    expect(c.files).toContain(result.file);
  });

  it('links the separate fee line to the foreign purchase', () => {
    const links = linkFxFees(
      converted.rows.map((r, k) => ({
        index: k,
        localDate: r.localDate,
        description: r.description,
        amount: r.amount,
        hasForeign: (r.foreign ?? null) !== null,
      })),
    );
    expect(links.get(c.fee)).toBe(c.purchase);
    expect(links.size).toBe(1);
  });
});
