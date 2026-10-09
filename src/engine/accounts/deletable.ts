// Delete-or-archive rule. CONTEXT D-24: soft-deleted lines do not count; the server guard
// (plan 02) enforces the same rule.

export type AccountDeleteState =
  | { kind: 'delete' }
  | { kind: 'archive'; reason: 'lines' | 'series' | 'both'; lineCount: number };

export function accountDeleteState(input: {
  liveLineCount: number;
  activeSeriesCount: number;
}): AccountDeleteState {
  const { liveLineCount, activeSeriesCount } = input;
  for (const n of [liveLineCount, activeSeriesCount]) {
    if (!Number.isInteger(n) || n < 0) throw new RangeError('counts must be non-negative integers');
  }
  if (liveLineCount === 0 && activeSeriesCount === 0) return { kind: 'delete' };
  const reason =
    liveLineCount > 0 && activeSeriesCount > 0 ? 'both' : liveLineCount > 0 ? 'lines' : 'series';
  return { kind: 'archive', reason, lineCount: liveLineCount };
}
