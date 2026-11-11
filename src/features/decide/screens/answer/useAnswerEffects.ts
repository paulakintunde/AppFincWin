// 06.1-23 (UX-16, CO-D-124, CMP-F03): what happens once when an answer arrives, once per (check, code, variant) per mount:
// one warning haptic when a rule was crossed, the seen state remembered (so Home can say "Changed since you looked"), the per-day
// history row (the whole Result, as JSON), and the analytics event with the code and variant only. The history table may not exist in production yet, so that
// write is allowed to fail without the answer noticing.
import { useEffect, useRef } from 'react';
import type { Result } from '@/engine/decide/v3';
import type { DecideCheckRow } from '@/db/decideChecks';
import { getAnalytics } from '@/services/analytics';
import { hapticWarning } from '@/ui/haptics';

export interface AnswerEffectWrites {
  /** useMarkCheckSeen().markSeen */
  markSeen: (row: DecideCheckRow, state: Result['legacyState'], basis: 'logged_months') => boolean;
  /** useRecordCheckHistory(ownerId).mutate */
  recordHistory: (a: { checkId: string; result: { code: string; variant?: string | null } }) => boolean;
}

export interface UseAnswerEffectsArgs {
  row: DecideCheckRow | null;
  /** The settled result being shown; null while loading, on an error or for a not-ready answer. */
  result: Result | null;
  writes: AnswerEffectWrites;
}

export function useAnswerEffects({ row, result, writes }: UseAnswerEffectsArgs): void {
  const done = useRef<string | null>(null);
  const live = useRef(writes);
  useEffect(() => {
    live.current = writes;
  });
  const id = row?.id ?? null;
  const code = result?.code ?? null;
  const variant = result?.variant ?? null;
  const ready = result !== null && result.readiness?.ready !== false;

  useEffect(() => {
    if (id === null || result === null || code === null || row === null) return;
    // A not-ready answer is not a verdict: nothing is remembered or counted for it.
    if (!ready) return;
    const key = `${id}|${code}|${variant ?? 'none'}`;
    if (done.current === key) return;
    done.current = key;
    if (result.facts.some((f) => f.code === 'line_crossed')) hapticWarning();
    // An ask (needs_input) is shown and counted, but it is not something Decide said about the purchase: no seen state, no history.
    if (code !== 'needs_input') {
      try {
        live.current.markSeen(row, result.legacyState, 'logged_months');
      } catch {
        // seen tracking is a convenience; the answer stands without it
      }
      try {
        live.current.recordHistory({ checkId: id, result });
      } catch {
        // the history table may not exist yet
      }
    }
    getAnalytics().track('decide_answer_shown', { code, variant: variant ?? 'none' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- result and row are read once per (check, code, variant)
  }, [id, code, variant, ready]);
}
