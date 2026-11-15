// 06.1-68 (H-7, CB-11, CF-2): the readiness rows answered on this screen, held on the screen only, so a tap changes the row at once
// ("Saved, updating…", choices off) instead of after the reads catch up (plan 51 finding 4: 30 s or more on a phone).
// A row leaves this set when the engine's list no longer has it (the engine agrees), or when its answer is taken back: once the
// answer has been seen in the cache (the waiver row, or the skipped line), its absence later means Undo ran (or the write failed and
// was rolled back, T-06.1-68-02), so the row is shown open again. Nothing is written here.
import { useCallback, useMemo, useState } from 'react';

/** How an answered row is told apart from a taken-back one: its waiver key in the live answers, or its pending line skipped. */
export type AnsweredBy = { readonly waiverKey: string } | { readonly lineId: string };

interface Entry {
  readonly by: AnsweredBy;
  /** The answer has shown up in the cache at least once. */
  readonly seen: boolean;
}

export interface AnsweredRowsInput {
  /** The ids of the rows the engine names now; null while there is no result (nothing is dropped then). */
  rowIds: readonly string[] | null;
  /** The live readiness answers' keys (decide_answers, not deleted). */
  waiverKeys: ReadonlySet<string>;
  /** True while the line is still pending in the cache (not skipped yet, or put back by Undo). */
  linePending: (lineId: string) => boolean;
}

export interface AnsweredRows {
  answered: ReadonlySet<string>;
  mark: (rowId: string, by: AnsweredBy) => void;
}

const appliedIn = (by: AnsweredBy, waiverKeys: ReadonlySet<string>, linePending: (lineId: string) => boolean): boolean =>
  'waiverKey' in by ? waiverKeys.has(by.waiverKey) : !linePending(by.lineId);

export function useAnsweredRows({ rowIds, waiverKeys, linePending }: AnsweredRowsInput): AnsweredRows {
  const [entries, setEntries] = useState<ReadonlyMap<string, Entry>>(() => new Map());

  // Kept in step during render (no effect, no extra frame): mark answers seen, and drop the ones the engine agreed with or that
  // were taken back. Settles in one pass: a second pass over the result changes nothing.
  let next: Map<string, Entry> | null = null;
  for (const [id, e] of entries) {
    const isApplied = appliedIn(e.by, waiverKeys, linePending);
    const gone = rowIds !== null && !rowIds.includes(id);
    const drop = gone || (e.seen && !isApplied);
    const see = !drop && isApplied && !e.seen;
    if (!drop && !see) continue;
    next ??= new Map(entries);
    if (drop) next.delete(id);
    else next.set(id, { by: e.by, seen: true });
  }
  if (next !== null) setEntries(next);
  const current = next ?? entries;

  const answered = useMemo(() => new Set(current.keys()), [current]);

  const mark = useCallback((rowId: string, by: AnsweredBy): void => {
    setEntries((prev) => {
      const next = new Map(prev);
      next.set(rowId, { by, seen: false });
      return next;
    });
  }, []);

  return { answered, mark };
}
