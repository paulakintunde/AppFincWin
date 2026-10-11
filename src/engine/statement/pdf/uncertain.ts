/**
 * D-23: rows the PDF reader is not sure of are never blocking but are always
 * reviewed. After reconciliation, any row carrying one of these codes reads
 * 'cannot-verify' even when its balance link checks out, and a file that would
 * otherwise read 'all-verified' reads 'partial'.
 */
import type { DraftRowIssue } from '../types';
import type { ReconcileResult, RowCheck } from '../reconcile';

export const PDF_UNCERTAIN_ISSUES: readonly DraftRowIssue[] = [
  'pdf-wrapped-description',
  'pdf-no-date',
  'pdf-ambiguous-column',
  'pdf-ambiguous-date',
];

export function isUncertainIssue(issue: DraftRowIssue): boolean {
  return PDF_UNCERTAIN_ISSUES.includes(issue);
}

export function applyUncertainRows(
  result: ReconcileResult,
  rows: readonly { issues: readonly DraftRowIssue[] }[]
): ReconcileResult {
  let changed = false;
  const next: RowCheck[] = result.rows.map((check, i) => {
    const uncertain = (rows[i]?.issues ?? []).some(isUncertainIssue);
    if (!uncertain) return check;
    if (check !== 'cannot-verify') changed = true;
    return 'cannot-verify';
  });
  return {
    ...result,
    rows: next,
    file: changed && result.file === 'all-verified' ? 'partial' : result.file,
  };
}
