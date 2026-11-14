/**
 * v3 recurring candidates (05.1 S1, v3 §4.1, D-02, D-21, C2). Since 05.5-10 (ARC-06) this is a thin adapter: the one
 * bill detector is recurring/detect.ts (detectRecurring) plus recurring/twoDate.ts, because Activity owns bills (D-12).
 * This adds only what Decide needs on top: per-account grouping, dismissed and linked filters, month-end anchors and
 * the candidate shape. It holds no window, tolerance or repeat-count of its own. Candidates are for setup only and
 * never reach the verdict path (I34).
 */
import type { Cadence, RecurringCandidate } from '../../decide/v3/types';
import { minorUnits } from '../../money/types';
import { detectRecurring, type RecurringSuggestion } from '../../recurring/detect';
import { offerKey } from '../../recurring/offer';
import type { RecurringFreq } from '../../recurring/schedule';
import { twoDateClusters } from '../../recurring/twoDate';
import { parseDate } from '../../time/calendar';

export interface DetectRow {
  readonly id: string;
  readonly name: string;
  readonly amount: number;
  readonly currency: string;
  readonly date: string;
  readonly isTransfer: boolean;
  readonly accountId: string | null;
}

export interface DetectContext {
  readonly dismissedKeys: ReadonlySet<string>;
  readonly linkedRowIds: ReadonlySet<string>;
}

const CADENCE_OF: Readonly<Record<RecurringFreq, Cadence>> = {
  weekly: { unit: 'week', every: 1 },
  fortnightly: { unit: 'week', every: 2 },
  monthly: { unit: 'month', every: 1 },
  quarterly: { unit: 'month', every: 3 },
  yearly: { unit: 'month', every: 12 },
};

const TWO_DATE_SUFFIX = '#two-dates';

interface Group {
  readonly key: string;
  readonly direction: 'in' | 'out';
  readonly rows: DetectRow[];
}

function byDateThenId(a: DetectRow, b: DetectRow): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Runs the one detector on a single group's rows (already ordered by date then id) and shapes its answer. */
function candidateFrom(
  group: Group,
  rows: readonly DetectRow[],
  payGroupKey: string | null
): RecurringCandidate | null {
  const found: RecurringSuggestion[] = detectRecurring(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      amount: r.amount,
      currency: r.currency,
      localDate: r.date,
      isTransfer: r.isTransfer,
    }))
  );
  const hit = found[0];
  if (hit === undefined) return null;
  const byId = new Map(rows.map((r) => [r.id, r] as const));
  const used = hit.rowIds.map((id) => byId.get(id) as DetectRow);
  const cadence = CADENCE_OF[hit.freq];
  // L-05: month-end bills keep their day (31 Dec, 31 Jan, 28 Feb anchor on the 31st, not the 28th)
  let anchorDate = hit.anchorDate;
  if (cadence.unit === 'month') {
    const maxDay = Math.max(...used.map((r) => parseDate(r.date).d));
    anchorDate = (used.filter((r) => parseDate(r.date).d === maxDay).pop() as DetectRow).date;
  }
  return {
    key: group.key,
    name: hit.name,
    direction: group.direction,
    cadence,
    anchorDate,
    amount: minorUnits(Math.abs(hit.amount)),
    rowIds: hit.rowIds,
    payGroupKey,
  };
}

/** Candidate series from logged rows: every cadence, plus pay on two fixed dates a month (checked first, C2). */
export function detectCandidates(rows: readonly DetectRow[], ctx: DetectContext): readonly RecurringCandidate[] {
  const groups = new Map<string, Group>();
  for (const row of rows) {
    if (row.isTransfer || row.amount === 0) continue;
    const key = offerKey(row.name, row.currency, row.amount);
    const groupKey = `${key}|${row.accountId ?? ''}`;
    const group = groups.get(groupKey);
    if (group === undefined) groups.set(groupKey, { key, direction: row.amount > 0 ? 'in' : 'out', rows: [row] });
    else group.rows.push(row);
  }

  const out: RecurringCandidate[] = [];
  for (const group of groups.values()) {
    if (ctx.dismissedKeys.has(group.key)) continue;
    if (group.rows.some((r) => ctx.linkedRowIds.has(r.id))) continue;
    const sorted = [...group.rows].sort(byDateThenId);
    if (sorted.length < 2) continue;

    const clusters = twoDateClusters(sorted.map((r) => r.date));
    if (clusters !== null) {
      const payGroupKey = group.key + TWO_DATE_SUFFIX;
      const lowSet = new Set(clusters.members[0]);
      const lowRows = sorted.filter((r) => lowSet.has(r.date));
      const highRows = sorted.filter((r) => !lowSet.has(r.date));
      const a = candidateFrom(group, lowRows, payGroupKey);
      const b = candidateFrom(group, highRows, payGroupKey);
      if (a !== null && b !== null) {
        out.push(a, b);
        continue;
      }
    }

    const single = candidateFrom(group, sorted, null);
    if (single !== null) out.push(single);
  }

  out.sort((x, y) => {
    if (x.rowIds.length !== y.rowIds.length) return y.rowIds.length - x.rowIds.length;
    if (x.name !== y.name) return x.name < y.name ? -1 : 1;
    if (x.key !== y.key) return x.key < y.key ? -1 : 1;
    if (x.anchorDate !== y.anchorDate) return x.anchorDate < y.anchorDate ? -1 : 1;
    // Same payee on two accounts can tie on everything above: break it on the first row id so the order never
    // depends on input order (I16).
    const xr = x.rowIds[0] as string;
    const yr = y.rowIds[0] as string;
    return xr < yr ? -1 : xr > yr ? 1 : 0;
  });
  return out;
}
