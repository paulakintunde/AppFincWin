import fc from 'fast-check';
import type { DraftRowIssue } from '../../types';
import type { ReconcileResult, RowCheck } from '../../reconcile';
import { PDF_UNCERTAIN_ISSUES, applyUncertainRows, isUncertainIssue } from '../uncertain';

const rowsOf = (...issues: DraftRowIssue[][]) => issues.map((i) => ({ issues: i }));
const result = (rows: RowCheck[], file: ReconcileResult['file']): ReconcileResult => ({
  orientation: 'as-is',
  rows,
  file,
  verifiedLinks: 3,
  failedLinks: 1,
});

describe('isUncertainIssue', () => {
  it('recognises exactly the four pdf codes', () => {
    for (const c of PDF_UNCERTAIN_ISSUES) expect(isUncertainIssue(c)).toBe(true);
    expect(PDF_UNCERTAIN_ISSUES).toHaveLength(4);
    expect(isUncertainIssue('bad-balance')).toBe(false);
  });
});

describe('applyUncertainRows', () => {
  it('downgrades an uncertain row and all-verified becomes partial', () => {
    const input = result(['verified', 'verified', 'verified'], 'all-verified');
    const out = applyUncertainRows(input, rowsOf([], [], ['pdf-no-date']));
    expect(out.rows).toEqual(['verified', 'verified', 'cannot-verify']);
    expect(out.file).toBe('partial');
    expect(out.verifiedLinks).toBe(3);
    expect(out.failedLinks).toBe(1);
    expect(out.orientation).toBe('as-is');
    expect(input.rows).toEqual(['verified', 'verified', 'verified']);
  });

  it('keeps none-in-file', () => {
    const out = applyUncertainRows(result(['no-balance', 'no-balance'], 'none-in-file'), rowsOf(['pdf-ambiguous-column'], []));
    expect(out.rows).toEqual(['cannot-verify', 'no-balance']);
    expect(out.file).toBe('none-in-file');
  });

  it('keeps ends-only-mismatch and partial', () => {
    expect(applyUncertainRows(result(['verified'], 'ends-only-mismatch'), rowsOf(['pdf-ambiguous-date'])).file).toBe('ends-only-mismatch');
    expect(applyUncertainRows(result(['verified'], 'partial'), rowsOf(['pdf-wrapped-description'])).file).toBe('partial');
  });

  it('leaves non-pdf issues and clean files untouched', () => {
    const input = result(['verified', 'cannot-verify'], 'all-verified');
    const out = applyUncertainRows(input, rowsOf(['bad-balance'], []));
    expect(out).toEqual(input);
    expect(out.file).toBe('all-verified');
  });

  it('property: uncertain rows are always cannot-verify and verified never grows', () => {
    const check = fc.constantFrom<RowCheck>('verified', 'verified-as-group', 'cannot-verify', 'no-balance');
    const issue = fc.constantFrom<DraftRowIssue>(...PDF_UNCERTAIN_ISSUES, 'bad-balance', 'bad-date');
    fc.assert(
      fc.property(
        fc.array(fc.tuple(check, fc.array(issue, { maxLength: 3 })), { maxLength: 20 }),
        fc.constantFrom<ReconcileResult['file']>('all-verified', 'partial', 'none-in-file', 'ends-only-mismatch'),
        (pairs, file) => {
          const out = applyUncertainRows(
            result(pairs.map((p) => p[0]), file),
            pairs.map((p) => ({ issues: p[1] }))
          );
          const countV = (r: readonly RowCheck[]) => r.filter((x) => x === 'verified').length;
          pairs.forEach((p, i) => {
            if (p[1].some(isUncertainIssue)) expect(out.rows[i]).toBe('cannot-verify');
          });
          expect(countV(out.rows)).toBeLessThanOrEqual(countV(pairs.map((p) => p[0])));
        }
      )
    );
  });
});
