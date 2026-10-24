// 05-20 (D-10, D-11, D-34, D-35): Wait and save, and Pass, through the write queue. Both call record_decide_outcome
// (05-04), which stamps the status and cooling_off_at, and for Wait creates the savings goal in the same call. There is
// no undo step. 'already-applied' is success. Variables are JSON only; failed-write records carry ids and kinds only.
import * as Crypto from 'expo-crypto';
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import * as reminders from '@/features/decide/notifications/waitReminder';
import { getAnalytics } from '@/services/analytics';
import { recordDecideOutcome, type DecideOutcomeDecision, type DecideWaitGoal } from '@/db/decideOutcomes';
import type { DecideCheckRow } from '@/db/decideChecks';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import type { WithPending } from '@/data/types';
import {
  classifySettledWriteError,
  settledWriteErrorCode,
  shouldRetryWrite,
  writeRetryDelay,
} from '@/data/sync/writeErrors';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { showToast } from '@/state/undoToast';
import { guardSession, markSession } from '@/data/sync/sessionEpoch';
import { writeClient } from './writeClient';
import { coolingOffAt } from './decideGoAhead';

type CheckList = WithPending<DecideCheckRow>[];

export interface DecideOutcomeVars {
  checkId: string;
  ownerId: string;
  householdId: string;
  decision: DecideOutcomeDecision;
}

export function registerDecideOutcomeMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.decideOutcome, {
    mutationFn: (vars: DecideOutcomeVars) =>
      guardSession(vars, async () => recordDecideOutcome(await writeClient(), vars.checkId, vars.decision)),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: DecideOutcomeVars) => {
      markSession(vars);
      const checksKey = queryKeys.decideChecks(vars.ownerId, vars.householdId);
      await qc.cancelQueries({ queryKey: checksKey });
      const wait = vars.decision.outcome === 'wait' ? vars.decision : null;
      qc.setQueryData<CheckList>(checksKey, (old) =>
        (old ?? []).map((r) =>
          r.id === vars.checkId
            ? {
                ...r,
                status: wait ? ('waiting' as const) : ('passed' as const),
                verdict_at_decision: vars.decision.verdict,
                ...(wait ? { wait_monthly: wait.wait_monthly, ready_by: wait.ready_by } : {}),
                pending: true,
              }
            : r
        )
      );
      if (wait?.goal) {
        const goal = wait.goal;
        const now = new Date().toISOString();
        const optimistic: SavingsGoalRow = {
          id: goal.id,
          household_id: vars.householdId,
          created_by: vars.ownerId,
          check_id: vars.checkId,
          name: goal.name,
          currency: goal.currency,
          target: goal.target,
          monthly_amount: wait.wait_monthly,
          ready_by: wait.ready_by,
          opening_saved: 0,
          kind: 'wait',
          done_at: null,
          is_sample: false,
          deleted_at: null,
          version: 1,
          created_at: now,
          updated_at: now,
        };
        qc.setQueryData<SavingsGoalRow[]>(queryKeys.savingsGoals(vars.ownerId, vars.householdId), (old) => [
          ...(old ?? []).filter((g) => g.id !== goal.id),
          optimistic,
        ]);
      }
    },
    onSuccess: (_result: unknown, vars: DecideOutcomeVars) => {
      void qc.invalidateQueries({ queryKey: queryKeys.decideChecks(vars.ownerId, vars.householdId) });
      if (vars.decision.outcome === 'wait' && vars.decision.goal) {
        void qc.invalidateQueries({ queryKey: queryKeys.savingsGoals(vars.ownerId, vars.householdId) });
      }
    },
    onError: async (err: unknown, vars: DecideOutcomeVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return;
      void qc.invalidateQueries({ queryKey: queryKeys.decideChecks(vars.ownerId, vars.householdId) });
      void qc.invalidateQueries({ queryKey: queryKeys.savingsGoals(vars.ownerId, vars.householdId) });
      await recordFailedWrite({
        entity: 'decide_checks',
        entityId: vars.checkId,
        kind: cls,
        code: settledWriteErrorCode(err),
        attempted: { outcome: vars.decision.outcome },
      });
      // A definitive failure only: a write paused offline never reaches onError until it replays and settles.
      showToast({ kind: 'refusal', text: { key: 'decide.toast.outcomeFailed' } });
    },
  });
}

type CheckRef = Pick<DecideCheckRow, 'id' | 'created_by' | 'household_id' | 'name' | 'inputs'>;
type VerdictState = DecideOutcomeDecision['verdict'];

function useOutcomeMutation() {
  return useMutation<unknown, unknown, DecideOutcomeVars>({
    mutationKey: mutationKeys.decideOutcome,
    scope: WRITE_SCOPE,
  });
}

/** D-35: the 48-hour reminder, when the user asked for it and the size needs spreading. A refusal never blocks the save. */
async function scheduleCooling(checkId: string, coolingOff: boolean): Promise<void> {
  if (!coolingOff) return;
  const now = new Date();
  try {
    await reminders.scheduleCoolingOffReminder(checkId, coolingOffAt(now), now);
  } catch {
    // The decision is already queued; the reconcile pass sets the reminder from the server's cooling_off_at.
  }
}

export function useWaitAndSave(): {
  save(args: {
    check: CheckRef;
    verdict: VerdictState;
    currency: string;
    monthlyAmount: number;
    readyBy: string | null;
    today: string;
    goalTarget: number | null;
    coolingOff: boolean;
  }): Promise<{ reminder: 'set' | 'off' | 'none' }>;
} {
  const mutation = useOutcomeMutation();
  return {
    async save(args) {
      const { check } = args;
      const fallbackName = typeof check.inputs.name === 'string' ? check.inputs.name : '';
      const goal: DecideWaitGoal | null =
        args.goalTarget !== null && args.goalTarget > 0
          ? {
              id: Crypto.randomUUID(),
              name: check.name || fallbackName,
              currency: args.currency,
              target: args.goalTarget,
            }
          : null;
      mutation.mutate({
        checkId: check.id,
        ownerId: check.created_by,
        householdId: check.household_id,
        decision: {
          outcome: 'wait',
          verdict: args.verdict,
          wait_monthly: args.monthlyAmount,
          ready_by: args.readyBy,
          cooling_off: args.coolingOff,
          goal,
        },
      });
      getAnalytics().track('decision_recorded', { decision: 'wait' });
      void scheduleCooling(check.id, args.coolingOff);
      if (args.readyBy === null) return { reminder: 'none' };
      try {
        const result = await reminders.scheduleWaitReminder(check.id, args.readyBy, args.today);
        return { reminder: result.scheduled ? 'set' : 'off' };
      } catch {
        // A refused or failing scheduler still leaves the decision saved.
        return { reminder: 'off' };
      }
    },
  };
}

export function usePass(): {
  pass(args: { check: CheckRef; verdict: VerdictState; coolingOff: boolean }): void;
} {
  const mutation = useOutcomeMutation();
  return {
    pass(args) {
      const { check } = args;
      mutation.mutate({
        checkId: check.id,
        ownerId: check.created_by,
        householdId: check.household_id,
        decision: { outcome: 'pass', verdict: args.verdict, cooling_off: args.coolingOff },
      });
      getAnalytics().track('decision_recorded', { decision: 'pass' });
      void scheduleCooling(check.id, args.coolingOff);
    },
  };
}
