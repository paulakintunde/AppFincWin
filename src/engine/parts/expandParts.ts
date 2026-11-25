// 10.1-04 (D-01, D-03): one line, parts inside; an unplaced gap is Uncategorised (UI-SPEC owner answer 4).
import type { CategoryAmount, LinePartsInput } from './types';

/** Rows a reader counts for a line. The rows always sum exactly to `line.amount`. */
export function expandParts(line: LinePartsInput): CategoryAmount[] {
  const parts = line.parts;
  if (parts === null || parts.length < 2) {
    return [{ lineId: line.id, categoryId: line.categoryId, amount: line.amount, isGap: false, label: null }];
  }
  const rows: CategoryAmount[] = parts.map((p) => ({
    lineId: line.id,
    categoryId: p.categoryId,
    amount: p.amount,
    isGap: false,
    label: p.label ?? null,
  }));
  const gap = line.amount - parts.reduce((s, p) => s + p.amount, 0);
  if (gap !== 0) {
    rows.push({ lineId: line.id, categoryId: null, amount: gap, isGap: true, label: null });
  }
  return rows;
}
