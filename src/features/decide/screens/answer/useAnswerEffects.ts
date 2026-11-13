// 06.1-23 (UX-16, CO-D-124, CMP-F03): what happens once when an answer arrives, once per (check, code, variant) per mount:
// one warning haptic when a rule was crossed, the seen state remembered (so Home can say "Changed since you looked"), the per-day
// history row (the whole Result, as JSON), and the analytics event with the code and variant only. The history table may not exist in production yet, so that
// write is allowed to fail without the answer noticing.
import { useEffect, useRef } from 'react';
import { seenOf, type Result } from '@/engine/decide/v3';
import type { DecideCheckRow, StoredSeenV3 } from '@/db/decideChecks';
import { getAnalytics } from '@/services/analytics';
import { hapticWarning } from '@/ui/haptics';

export interface AnswerEffectWrites {
  /** useMarkCheckSeen().markSeen */
  markSeen: (row: DecideCheckRow, state: Result['legacyState'], basis: 'logged_months') => boolean;
  /** useRecordCheckHistory(ownerId).mutate */
  recordHistory: (a: { checkId: string; result: { code: string; variant?: string | null } }) => boolean;
  /**
   * 06.1-78: useSaveCheckAnswer().save, the only writer of answer_v3. Without it every open check on Decide home stays "Draft".
   * It skips a write when the stored answer is already the same, so calling it again is harmless.
   */
  saveAnswer?: (row: DecideCheckRow, seen: StoredSeenV3) => boolean;
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

  // 06.1-78: the answer the user was shown is stored once per (check, answer), so Decide home's open-checks row shows the answered
  // state and "Changed since you looked" compares with what was last seen. A not-ready answer and an ask are not stored (the row
  // stays a draft for them).
  const seen = ready && result !== null && code !== 'needs_input' ? seenOf(result) : null;
  const seenKey = seen === null ? null : JSON.stringify(seen);
  const saved = useRef<string | null>(null);
  useEffect(() => {
    if (id === null || row === null || seen === null || seenKey === null) return;
    const key = `${id}|${seenKey}`;
    if (saved.current === key) return;
    saved.current = key;
    try {
      live.current.saveAnswer?.(row, { ...seen, lineFacts: [...seen.lineFacts] } as StoredSeenV3);
    } catch {
      // storing the answer is a convenience for Decide home; the answer stands without it
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- row and seen are read once per (check, answer)
  }, [id, seenKey]);
}
