/**
 * Series offers from history (CONTEXT D-17, D-18; user decision 2026-10-09:
 * detect.ts is reused unchanged, no new thresholds here). The caller passes
 * only non-sample, non-transfer, non-skipped rows to `detectRecurring`, then
 * narrows the output with `selectOffers`.
 */
import type { RecurringSuggestion } from './detect';
import { normaliseDescription } from '../categorize/guessCategory';

export interface SeriesOffer {
  key: string;
  suggestion: RecurringSuggestion;
  /** The month (YYYY-MM) of the second-latest row in the group. */
  previousMonth: string;
  latestRowId: string;
}

/** The exact grouping key `detectRecurring` builds for a row. */
export function offerKey(name: string, currency: string, amount: number): string {
  return `${normaliseDescription(name)}|${currency}|${Math.sign(amount)}`;
}

export function selectOffers(
  detected: readonly RecurringSuggestion[],
  ctx: {
    viewedMonth: string;
    dismissedKeys: ReadonlySet<string>;
    seriesLinkedRowIds: ReadonlySet<string>;
    rowDates: ReadonlyMap<string, string>;
  }
): SeriesOffer[] {
  const out: SeriesOffer[] = [];
  for (const s of detected) {
    if (s.freq !== 'monthly') continue;
    if (ctx.dismissedKeys.has(s.key)) continue;
    if (s.rowIds.some((id) => ctx.seriesLinkedRowIds.has(id))) continue;
    const dated = s.rowIds
      .map((id) => ({ id, date: ctx.rowDates.get(id) }))
      .filter((r): r is { id: string; date: string } => r.date !== undefined)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (dated.length < 2) continue;
    const latest = dated[dated.length - 1]!;
    const prev = dated[dated.length - 2]!;
    if (latest.date.slice(0, 7) !== ctx.viewedMonth) continue;
    out.push({ key: s.key, suggestion: s, previousMonth: prev.date.slice(0, 7), latestRowId: latest.id });
  }
  out.sort((a, b) => a.key.localeCompare(b.key));
  return out;
}
