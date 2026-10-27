/**
 * The shadow review report (05.1-28, D-14). Test-only. `renderReport` is pure; `writeReport` is the only place that touches
 * disk and is called only when SHADOW_REPORT=1, so the default CI run never writes a file (T-05.1-59).
 */
import * as fs from 'fs';
import * as path from 'path';
import { CAUSES, type Cause } from './classify';
import type { ChangedAnswer, ShadowRun } from './compare';

export interface ApprovedNewFit {
  key: string;
  cause: Cause;
  reason: string;
  approved: boolean;
  changedInGapClosure?: boolean;
}
export interface ApprovedGroup {
  cause: Cause;
  count: number;
  note: string;
  accepted: boolean;
}
export interface ApprovedChanges {
  reviewed: boolean;
  reviewedBy: string | null;
  reviewedAt: string | null;
  newFits: ApprovedNewFit[];
  groups: ApprovedGroup[];
}

export const REPORT_DIR = path.join('.planning', 'phases', '05.1-decide-engine-v3', 'shadow');

const fmt = (v: number | string | null | undefined): string => (v === null || v === undefined ? '-' : String(v));

function figures(c: ChangedAnswer): string {
  const d = c.detail;
  return `price ${fmt(d.price)}, dayOne ${fmt(d.dayOne)}, monthLeft ${fmt(d.monthLeft)}, erest ${fmt(d.erest)}, e ${fmt(d.e)}, unspent ${fmt(d.unspent)}, emergency ${fmt(d.emergency)}`;
}

export function groupByCause(changes: readonly ChangedAnswer[]): Map<Cause, ChangedAnswer[]> {
  const out = new Map<Cause, ChangedAnswer[]>();
  for (const cause of CAUSES) {
    const rows = changes.filter((c) => c.cause === cause);
    if (rows.length > 0) out.set(cause, rows);
  }
  return out;
}

export function renderReport(run: ShadowRun, approved: ApprovedChanges): string {
  const L: string[] = [];
  const newFits = run.changes.filter((c) => c.newFits);
  L.push('# Shadow report: today\'s engine against v3 (05.1-28)');
  L.push('');
  L.push('Synthetic data only (D-17): 300 seeded histories, the 9 personas, the 22 scenarios and the D-18 extras. Old engine on the `month` basis.');
  L.push('');
  L.push('| Figure | Count |');
  L.push('|---|---|');
  L.push(`| Comparisons | ${run.total} |`);
  L.push(`| Same answer | ${run.agreed} |`);
  L.push(`| Changed answer | ${run.changes.length} |`);
  L.push(`| New fits (v3 fits_month or fits_unspent, old did not fit) | ${newFits.length} |`);
  L.push(`| Unsupported by the old engine (not counted as agreement or change) | ${run.unsupported.length} |`);
  L.push(`| Not ready (D-52), not counted as agreement or change | ${run.notReady.length} |`);
  L.push(`| Not-ready rate | ${run.total === 0 ? '0.0' : ((run.notReady.length / run.total) * 100).toFixed(1)}% |`);
  L.push(`| Owner review | ${approved.reviewed ? `reviewed by ${fmt(approved.reviewedBy)} on ${fmt(approved.reviewedAt)}` : 'not yet reviewed'} |`);
  L.push('');
  L.push('## Changes by cause');
  for (const [cause, rows] of groupByCause(run.changes)) {
    const group = approved.groups.find((g) => g.cause === cause);
    L.push('');
    L.push(`### ${cause} (${rows.length})`);
    L.push('');
    if (group) L.push(`${group.note} Accepted: ${group.accepted ? 'yes' : 'no'}.`);
    L.push('');
    const pairs = new Map<string, number>();
    for (const r of rows) pairs.set(`${r.old} -> ${r.v3}`, (pairs.get(`${r.old} -> ${r.v3}`) ?? 0) + 1);
    L.push('| Old -> v3 | Count |');
    L.push('|---|---|');
    for (const [k, n] of pairs) L.push(`| ${k} | ${n} |`);
    L.push('');
    L.push('Examples:');
    for (const r of rows.slice(0, 3)) L.push(`- \`${r.key}\` ${r.old} -> ${r.v3}: ${figures(r)}`);
  }
  L.push('');
  L.push('## New fits');
  L.push('');
  L.push('Every case where v3 says fits and the old engine did not. Each needs the owner\'s approval before switch-on (D-14).');
  L.push('');
  L.push('| Key | Cause | Old -> v3 | Approved | Reason |');
  L.push('|---|---|---|---|---|');
  for (const c of newFits) {
    const entry = approved.newFits.find((n) => n.key === c.key);
    L.push(`| \`${c.key}\` | ${c.cause} | ${c.old} -> ${c.v3} | ${entry?.approved ? 'yes' : 'no'} | ${entry ? entry.reason : 'MISSING'} |`);
  }
  L.push('');
  L.push('## Not ready (D-52)');
  L.push('');
  L.push(`${run.notReady.length} of ${run.total} comparisons. v3 asks for more records instead of answering.`);
  L.push('');
  const codes = new Map<string, number>();
  for (const n of run.notReady) for (const m of n.missing) codes.set(m, (codes.get(m) ?? 0) + 1);
  L.push('| Missing code | Count |');
  L.push('|---|---|');
  for (const [k, n] of codes) L.push(`| ${k} | ${n} |`);
  L.push('');
  L.push('Keys and codes:');
  L.push(run.notReady.map((n) => `\`${n.key}\` (${n.missing.join(', ')})`).join(', '));
  L.push('');
  L.push('## Unsupported by the old engine');
  L.push('');
  const reasons = new Map<string, number>();
  for (const u of run.unsupported) reasons.set(u.reason, (reasons.get(u.reason) ?? 0) + 1);
  L.push('| Reason | Count |');
  L.push('|---|---|');
  for (const [k, n] of reasons) L.push(`| ${k} | ${n} |`);
  L.push('');
  L.push('Keys:');
  L.push(run.unsupported.map((u) => `\`${u.key}\``).join(', '));
  L.push('');
  return L.join('\n');
}

export function writeReport(run: ShadowRun, approved: ApprovedChanges): void {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  // 05.1-49: the hand-written owner review section sits above the generated tables and survives regeneration.
  const reviewFile = path.join(REPORT_DIR, 'review-gap-closure.md');
  const review = fs.existsSync(reviewFile) ? fs.readFileSync(reviewFile, 'utf8').trimEnd() + '\n\n---\n\n' : '';
  fs.writeFileSync(path.join(REPORT_DIR, 'SHADOW-REPORT.md'), review + renderReport(run, approved));
  fs.writeFileSync(path.join(REPORT_DIR, 'shadow-report.json'), JSON.stringify(run, null, 2) + '\n');
}
