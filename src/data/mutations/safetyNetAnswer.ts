// 06.1-12 (D-14, D-28): the first-answer safety-net question. An amount makes the flagged goal in Grow (locked) when none exists,
// or sets the size of the one that does; "Not set yet" makes nothing and stamps the D-23 flag. The goal is Grow's, written through
// Grow's own hooks (save_goal_plan for a new net, a size-only edit for an existing one), so nothing is stored twice. Setting the
// size ticks setup item 4 through the flagged goal; "Not set yet" ticks it through answered_net_not_set_at.
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { queryKeys } from '@/data/keys';
import { useQueryClient } from '@tanstack/react-query';
import { useEditGoal, useSaveGoalPlan } from './growGoals';
import { useSetDecideAnswered } from './decideSetup';

export type SafetyNetAnswerInput =
  | { kind: 'amount'; amount: number; currency: string; /** The name for a net made here (the screen passes its translated copy). */ name: string; /** What is already saved in the existing net, in its currency; a size below it is refused. */ saved?: number }
  | { kind: 'not_set' };

export type SafetyNetAnswerOutcome =
  | { status: 'created'; stepId: string }
  | { status: 'sized'; stepId: string }
  | { status: 'other_currency' }
  | { status: 'not_set'; stepId: string | null };

export function useSafetyNetAnswer(
  userId: string,
  householdId: string
): { answer(input: SafetyNetAnswerInput): SafetyNetAnswerOutcome } {
  const qc = useQueryClient();
  const plan = useSaveGoalPlan();
  const edit = useEditGoal();
  const flags = useSetDecideAnswered(userId);
  return {
    answer(input) {
      if (input.kind === 'not_set') {
        const step = flags.set({ flag: 'net_not_set', on: true });
        return { status: 'not_set', stepId: step === null ? null : step.stepId };
      }
      const goals = qc.getQueryData<SavingsGoalRow[]>(queryKeys.savingsGoals(userId, householdId)) ?? [];
      const net = goals.find((g) => g.is_safety_net === true && g.deleted_at === null) ?? null;
      let outcome: SafetyNetAnswerOutcome;
      if (net === null) {
        const made = plan.save({
          ownerId: userId,
          householdId,
          fields: {
            name: input.name,
            currency: input.currency,
            locked: true,
            protect: true,
            is_safety_net: true,
            target: input.amount,
            ready_by: null,
            monthly_amount: null,
            opening_saved: 0,
          },
          series: null,
        });
        outcome = { status: 'created', stepId: made.stepId };
      } else if (net.currency !== input.currency) {
        // The size is in another currency than the one asked in: nothing is changed here; the screen links to Grow.
        return { status: 'other_currency' };
      } else {
        outcome = { status: 'sized', stepId: edit.edit(net, { target: input.amount }, userId, input.saved ?? 0) };
      }
      // An amount answers the question, so "Not set yet" no longer stands. A bookkeeping clear: it rides in the goal's one Undo.
      flags.set({ flag: 'net_not_set', on: false, noUndo: true });
      return outcome;
    },
  };
}
