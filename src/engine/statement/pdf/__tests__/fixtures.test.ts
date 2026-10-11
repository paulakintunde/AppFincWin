// Real extraction snapshots (plan 02.1-06) read by the real reader and run through Phase 2's unchanged
// profile, conversion and reconciliation (D-19, IMP-01, IMP-02). No PDF-specific substitute for any stage.
import { applyUncertainRows, convertDraft, inferProfile, isUncertainIssue, linkFxFees, reconcile } from '../..';
import type { AccountKind, StatementDraft } from '../..';
import { pdfToDrafts } from '../toDraft';
import type { PdfExtraction } from '../types';

interface ExpectedRow {
  date: string;
  description: string;
  amount: number;
  balance: number | null;
  foreign?: { amount: number; currency: string } | null;
  feeOf?: number | null;
}
interface Expected {
  accountKind: AccountKind;
  opening: number | null;
  closing: number | null;
  rows: ExpectedRow[];
  sections: { label: string; rowCount: number; opening: number; closing: number; rows?: ExpectedRow[] }[] | null;
  expect: { reconcile: string; uncertainRows: number[] };
}

const NAMES = ['current-account', 'savings', 'credit-card', 'year-end', 'no-balances', 'multi-account'] as const;
const load = (name: string): { extraction: PdfExtraction; expected: Expected } => ({
  extraction: require(`./fixtures/${name}.extract.json`) as PdfExtraction,
  expected: require(`./fixtures/${name}.expected.json`) as Expected,
});

const options = {
  accountCurrency: 'GBP',
  exponentFor: (code: string) => (['GBP', 'USD', 'EUR'].includes(code) ? 2 : null),
  dayFirst: true,
  decimalMark: '.' as const,
  today: '2026-09-26',
  yearOverride: null,
};

const hasPdfIssue = (draft: StatementDraft): number[] =>
  draft.rows.flatMap((r, i) => (r.issues.some(isUncertainIssue) ? [i] : []));

describe.each(NAMES)('fixture %s', (name) => {
  const { extraction, expected } = load(name);
  const result = pdfToDrafts(extraction, options);

  it('reads as drafts', () => {
    expect(result.kind).toBe('drafts');
  });
  if (result.kind !== 'drafts') return;

  const sections = expected.sections;
  it('gives one draft per account section', () => {
    expect(result.drafts).toHaveLength(sections === null ? 1 : sections.length);
    if (sections !== null) {
      expect(result.drafts.map((d) => d.sectionLabel)).toEqual(sections.map((s) => s.label));
      expect(result.drafts.map((d) => d.draft.rows.length)).toEqual(sections.map((s) => s.rowCount));
    }
  });

  result.drafts.forEach((pd, i) => {
    const draft = pd.draft;
    const section = sections === null ? null : sections[i]!;
    const rows = section === null ? expected.rows : (section.rows ?? expected.rows);
    const opening = section === null ? expected.opening : section.opening;
    const closing = section === null ? expected.closing : section.closing;
    const kind: AccountKind = section === null ? expected.accountKind : (section.label as AccountKind);
    const uncertain = section === null ? expected.expect.uncertainRows : [];

    describe(`draft ${i}`, () => {
      it('has the expected rows, dates and descriptions', () => {
        expect(draft.rows.map((r) => [r.localDate, r.description])).toEqual(rows.map((r) => [r.date, r.description]));
        expect(hasPdfIssue(draft)).toEqual(uncertain);
        expect(pd.yearQuestion).toBeNull();
      });

      it('runs through Phase 2 profile, conversion and reconciliation to the expected ledger', () => {
        const profile = inferProfile(draft, { kind, limit: null }, null);
        expect(profile.kind).toBe('decided');
        if (profile.kind !== 'decided') return;
        const converted = convertDraft(draft, profile.profile, { limit: null });
        converted.rows.forEach((row, k) => {
          if (draft.rows[k]!.issues.includes('pdf-ambiguous-column')) return;
          expect(row.amount).toBe(rows[k]!.amount);
        });
        // IMP-05: foreign figures and fee links come out of the same conversion (D-30, D-32)
        converted.rows.forEach((row, k) => {
          expect(row.foreign ?? null).toEqual(rows[k]!.foreign ?? null);
        });
        const links = linkFxFees(
          converted.rows.map((r, k) => ({
            index: k,
            localDate: r.localDate,
            description: r.description,
            amount: r.amount,
            hasForeign: (r.foreign ?? null) !== null,
          })),
        );
        rows.forEach((row, k) => expect(links.get(k) ?? null).toBe(row.feeOf ?? null));
        if (opening !== null) expect(converted.opening).toBe(opening);
        if (closing !== null) expect(converted.closing).toBe(closing);

        const checked = applyUncertainRows(
          reconcile(
            converted.rows.map((r) => ({ amount: r.amount, balance: r.balance, localDate: r.localDate })),
            { opening: converted.opening, closing: converted.closing },
          ),
          draft.rows,
        );
        expect(checked.file).toBe(section === null ? expected.expect.reconcile : 'all-verified');
        for (const k of uncertain) expect(checked.rows[k]).toBe('cannot-verify');
      });
    });
  });
});

describe('fixture specifics', () => {
  const first = (name: string): StatementDraft => {
    const r = pdfToDrafts(load(name).extraction, options);
    if (r.kind !== 'drafts') throw new Error('expected drafts');
    return r.drafts[0]!.draft;
  };

  it('credit-card carries the stated limit, the billed amount and the foreign text', () => {
    const draft = first('credit-card');
    expect(draft.statedLimit).toBe(100000);
    expect(draft.labels).toContain('limit-label');
    expect(draft.accountHint).toBe('card');
    const profile = inferProfile(draft, { kind: 'credit', limit: null }, null);
    if (profile.kind !== 'decided') throw new Error('expected decided');
    const row = convertDraft(draft, profile.profile, { limit: null }).rows[4]!;
    expect(row.amount).toBe(-3538);
    expect(row.description).toContain('USD 45.00 @ 1.2718');
  });

  it('year-end runs across the new year', () => {
    const dates = first('year-end').rows.map((r) => r.localDate);
    expect(dates[0]).toBe('2025-12-16');
    expect(dates[dates.length - 1]).toBe('2026-01-13');
  });
});
