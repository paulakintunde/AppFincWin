/**
 * Pending-bill "mark paid" matching after import (D-55). An imported row
 * that looks like the payment of a pending recurring occurrence is offered
 * as a suggestion only -- matching is one-to-one and nothing is applied
 * here. The caller passes pending rows already scoped to the target
 * account (accountId is carried for that scoping, not read by this
 * module), and rows already flagged as likely duplicates via
 * `excludeIndexes` so an import never offers both at once.
 */
import { nameSimilarity } from '../statement/duplicates';

export interface PendingOccurrence {
  id: string;
  version: number;
  localDate: string;
  amount: number;
  name: string | null;
  accountId: string;
}

export interface PayMatchRow {
  index: number;
  localDate: string;
  amount: number;
  name: string;
}

export interface PayMatch {
  index: number;
  pendingId: string;
}

export const PAY_MATCH_BEFORE_DAYS = 3;
export const PAY_MATCH_AFTER_DAYS = 7;
const NAME_SIMILARITY_MIN = 0.6;

function parseLocalDateParts(s: string): { year: number; month: number; day: number } {
  const [year, month, day] = s.split('-').map(Number) as [number, number, number];
  return { year, month, day };
}

function daysBetween(a: string, b: string): number {
  const pa = parseLocalDateParts(a);
  const pb = parseLocalDateParts(b);
  const ta = Date.UTC(pa.year, pa.month - 1, pa.day);
  const tb = Date.UTC(pb.year, pb.month - 1, pb.day);
  return Math.round((tb - ta) / 86_400_000);
}

interface Candidate {
  rowIndex: number;
  pendingId: string;
  dayGap: number;
  amountDiff: number;
}

/**
 * Same sign; amount within 10% of the planned figure (integer maths:
 * `|imported - planned| * 10 <= |planned|`); imported dated from
 * `due - PAY_MATCH_BEFORE_DAYS` to `due + PAY_MATCH_AFTER_DAYS`; a
 * similar name (a null pending name never matches). Candidates are
 * ranked by day-gap, then amount difference, then pending id, then row
 * index, and assigned greedily one-to-one.
 */
export function matchPendingPayments(
  rows: readonly PayMatchRow[],
  pending: readonly PendingOccurrence[],
  opts?: { excludeIndexes?: ReadonlySet<number> }
): PayMatch[] {
  const excluded = opts?.excludeIndexes ?? new Set<number>();
  const candidates: Candidate[] = [];

  for (const row of rows) {
    if (excluded.has(row.index)) continue;
    for (const p of pending) {
      if (p.name === null) continue;
      if (Math.sign(row.amount) !== Math.sign(p.amount)) continue;

      const dayGap = daysBetween(p.localDate, row.localDate); // positive: imported after due
      if (dayGap < -PAY_MATCH_BEFORE_DAYS || dayGap > PAY_MATCH_AFTER_DAYS) continue;

      const amountDiff = Math.abs(row.amount - p.amount);
      if (amountDiff * 10 > Math.abs(p.amount)) continue;

      if (nameSimilarity(row.name, p.name) < NAME_SIMILARITY_MIN) continue;

      candidates.push({ rowIndex: row.index, pendingId: p.id, dayGap: Math.abs(dayGap), amountDiff });
    }
  }

  candidates.sort((a, b) => {
    if (a.dayGap !== b.dayGap) return a.dayGap - b.dayGap;
    if (a.amountDiff !== b.amountDiff) return a.amountDiff - b.amountDiff;
    if (a.pendingId !== b.pendingId) return a.pendingId < b.pendingId ? -1 : 1;
    return a.rowIndex - b.rowIndex;
  });

  const usedRows = new Set<number>();
  const usedPending = new Set<string>();
  const result: PayMatch[] = [];
  for (const c of candidates) {
    if (usedRows.has(c.rowIndex) || usedPending.has(c.pendingId)) continue;
    result.push({ index: c.rowIndex, pendingId: c.pendingId });
    usedRows.add(c.rowIndex);
    usedPending.add(c.pendingId);
  }

  result.sort((a, b) => a.index - b.index);
  return result;
}
