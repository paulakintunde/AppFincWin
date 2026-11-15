// 06.1-18: the two writes these screens call, handed in by their callers (src/shell/decide/SafetyNetRoute.tsx and
// FirstAnswerGateBound.tsx) rather than imported. Grow's write hooks reach the rate-fetch door (src/db/fxResolve) through the
// transaction cache, and the fx-fetch-never-from-reads rule keeps everything under features/decide away from it. The shapes match
// useSetNetAnswerUse() and useSafetyNetAnswer() in src/data/mutations.
import type { SavingsGoalRow } from '@/db/savingsGoals';

/** Unlock (on) or lock (off) the safety net for answers. Unlock shows a toast with Undo; lock a plain toast. Returns the undo step id. */
export interface NetUsePort {
  mutate(a: { goal: SavingsGoalRow; on: boolean; ownerId: string }): string | null;
}

export type NetAnswerInput =
  | { kind: 'amount'; amount: number; currency: string; name: string; saved?: number }
  | { kind: 'not_set' };

export type NetAnswerOutcome =
  | { status: 'created'; stepId: string }
  | { status: 'sized'; stepId: string }
  | { status: 'other_currency' }
  | { status: 'not_set'; stepId: string | null };

/** The first-answer safety-net question's write. */
export type NetAnswerPort = (input: NetAnswerInput) => NetAnswerOutcome;
