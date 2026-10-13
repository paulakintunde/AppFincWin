// REC-26: the pure view model behind the review list, so FlashList gets one flat array in both
// modes. 'new' is today's list; 'reconcile' leads with the missing lines, folds what is already
// recorded into one disclosure row and folds the app-only lines (D-23) into a second, read-only
// one that pages 50 at a time.
import type { ExtraLine } from '@/engine/statement';
import type { PreviewRow } from './importPipeline';

export const EXTRAS_PAGE = 50;

export type ReviewItem =
  | { kind: 'row'; key: string; row: PreviewRow; tag: 'missing' | 'recorded' | 'duplicate' | null }
  | { kind: 'recordedSummary'; key: 'recorded-summary'; count: number; open: boolean }
  | { kind: 'extrasHeader'; key: 'extras-header'; count: number; open: boolean }
  | { kind: 'extrasNote'; key: 'extras-note' }
  | { kind: 'extra'; key: string; extra: ExtraLine }
  | { kind: 'showMore'; key: 'extras-more'; count: number };

export function buildReviewItems(input: {
  rows: readonly PreviewRow[];
  mode: 'reconcile' | 'new';
  recordedOpen: boolean;
  extrasOpen: boolean;
  extrasShown: number;
  extras: readonly ExtraLine[];
}): ReviewItem[] {
  const { rows, mode, recordedOpen, extrasOpen, extrasShown, extras } = input;
  if (mode === 'new') {
    return rows.map((row) => ({
      kind: 'row' as const,
      key: `row-${row.index}`,
      row,
      tag: row.duplicate !== null ? ('duplicate' as const) : null,
    }));
  }

  const items: ReviewItem[] = [];
  const missing = rows.filter((r) => r.duplicate === null);
  const recorded = rows.filter((r) => r.duplicate !== null);
  for (const row of missing) items.push({ kind: 'row', key: `row-${row.index}`, row, tag: 'missing' });

  if (recorded.length > 0) {
    items.push({ kind: 'recordedSummary', key: 'recorded-summary', count: recorded.length, open: recordedOpen });
    if (recordedOpen) {
      for (const row of recorded) items.push({ kind: 'row', key: `row-${row.index}`, row, tag: 'recorded' });
    }
  }

  if (extras.length > 0) {
    items.push({ kind: 'extrasHeader', key: 'extras-header', count: extras.length, open: extrasOpen });
    if (extrasOpen) {
      items.push({ kind: 'extrasNote', key: 'extras-note' });
      for (const extra of extras.slice(0, extrasShown)) items.push({ kind: 'extra', key: `extra-${extra.id}`, extra });
      const remaining = extras.length - extrasShown;
      if (remaining > 0) items.push({ kind: 'showMore', key: 'extras-more', count: Math.min(EXTRAS_PAGE, remaining) });
    }
  }
  return items;
}
