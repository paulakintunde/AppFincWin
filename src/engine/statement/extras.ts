/**
 * Reconcile "extras" (REC-26, 02.3 D-23): app lines on the target account
 * inside the statement's period that the duplicate matcher did not consume.
 * D-23: extras = what findDuplicates did not consume; the hint is display-only
 * and never changes a default (RESEARCH A10).
 */

export const EXTRA_NEAR_WINDOW_DAYS = 3;

export interface StatementPeriod {
  from: string;
  toInclusive: string;
}

export interface ExtraPoolRow {
  id: string;
  localDate: string;
  amount: number;
  name: string | null;
  status: 'paid' | 'pending' | 'skipped';
}

export interface MissingLine {
  index: number;
  localDate: string | null;
  amount: number | null;
}

export interface ExtraLine {
  id: string;
  localDate: string;
  amount: number;
  name: string | null;
  nearIndex: number | null;
}

export interface FindExtrasResult {
  extras: ExtraLine[];
  nearByIndex: Map<number, string>;
}

function daysBetween(a: string, b: string): number {
  const [ya, ma, da] = a.split('-').map(Number) as [number, number, number];
  const [yb, mb, db] = b.split('-').map(Number) as [number, number, number];
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

/** Stated period, else first-to-last row dates; null when unknown or inverted. */
export function statementPeriod(
  stated: { start: string | null; end: string | null },
  rowDates: readonly (string | null)[]
): StatementPeriod | null {
  let min: string | null = null;
  let max: string | null = null;
  for (const d of rowDates) {
    if (d === null) continue;
    if (min === null || d < min) min = d;
    if (max === null || d > max) max = d;
  }
  const from = stated.start ?? min;
  const toInclusive = stated.end ?? max;
  if (from === null || toInclusive === null || from > toInclusive) return null;
  return { from, toInclusive };
}

export function findExtras(
  pool: readonly ExtraPoolRow[],
  matchedIds: ReadonlySet<string>,
  period: StatementPeriod | null,
  missing: readonly MissingLine[]
): FindExtrasResult {
  const nearByIndex = new Map<number, string>();
  if (period === null) return { extras: [], nearByIndex };

  const candidates = pool
    .filter(
      (p) =>
        p.status === 'paid' &&
        !matchedIds.has(p.id) &&
        p.localDate >= period.from &&
        p.localDate <= period.toInclusive
    )
    .sort((a, b) =>
      a.localDate !== b.localDate ? (a.localDate < b.localDate ? -1 : 1) : a.id < b.id ? -1 : 1
    );

  const byAmount = new Map<number, MissingLine[]>();
  for (const m of missing) {
    if (m.amount === null || m.localDate === null) continue;
    const list = byAmount.get(m.amount);
    if (list === undefined) byAmount.set(m.amount, [m]);
    else list.push(m);
  }

  const extras: ExtraLine[] = candidates.map((c) => {
    let best: MissingLine | null = null;
    let bestGap = 0;
    for (const m of byAmount.get(c.amount) ?? []) {
      if (nearByIndex.has(m.index)) continue;
      const gap = Math.abs(daysBetween(c.localDate, m.localDate as string));
      if (gap > EXTRA_NEAR_WINDOW_DAYS) continue;
      if (best === null || gap < bestGap || (gap === bestGap && m.index < best.index)) {
        best = m;
        bestGap = gap;
      }
    }
    if (best !== null) nearByIndex.set(best.index, c.id);
    return {
      id: c.id,
      localDate: c.localDate,
      amount: c.amount,
      name: c.name,
      nearIndex: best === null ? null : best.index,
    };
  });

  return { extras, nearByIndex };
}
