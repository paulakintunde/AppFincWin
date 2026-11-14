// 05-20 (D-10, D-11, D-34, D-35): Wait and save, and Pass, through the write queue. Both call record_decide_outcome
// (05-04), which stamps the status and cooling_off_at, and for Wait creates the savings goal in the same call. 05.3-47
// (D-21): each save also records ONE undo step. 05.3-68: the undo step is recorded by record_decide_outcome itself
// (4-arg), because a client step cannot restore decide_checks.status. 'already-applied' is success. Variables are JSON only; failed-write records carry ids and kinds only.
import * as Crypto from 'expo-crypto';
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import * as reminders from '@/features/decide/notifications/waitReminder';
import { getAnalytics } from '@/services/analytics';
import { recordDecideOutcome, type DecideOutcomeDecision, type DecideOutcomeResult, type DecideWaitGoal } from '@/db/decideOutcomes';
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
import type { CheckV2, Evaluation } from '@/engine/decide/v3';
import { guardSession, markSession } from '@/data/sync/sessionEpoch';
import { recordWrittenVersion } from '@/data/sync/versionChain';
import { writeClient } from './writeClient';
import { coolingOffAt } from './coolingOff';
import { newStepId } from './undoCapture';

export interface DecideOutcomeUndo {
  stepId: string;
  labelKey: 'planSaved' | 'notBuyingSaved';
  labelName: string;
}

type CheckList = WithPending<DecideCheckRow>[];

export interface DecideOutcomeVars {
  checkId: string;
  ownerId: string;
  householdId: string;
  decision: DecideOutcomeDecision;
  /** 05.3-78: the cached check version when the outcome was queued; the server moves it by one for the answer save queued just before and one for the outcome. */
  baseVersion?: number;
  /** 05.3-47: when set, the write records one undo step after it lands. Old callers leave it off. */
  undo?: DecideOutcomeUndo;
}

/** Check ids with an outcome write queued or in flight: a second tap returns the first step and writes nothing. */
const inFlight = new Map<string, string>();

export function registerDecideOutcomeMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.decideOutcome, {
    mutationFn: (vars: DecideOutcomeVars) =>
      guardSession(vars, async () => {
        const undo = vars.undo;
        // A persisted write from an older build has no undo: it keeps the 3-key call.
        const result = await recordDecideOutcome(
          await writeClient(),
          vars.checkId,
          vars.decision,
          undo
            ? {
                id: undo.stepId,
                label_key: undo.labelKey,
                label_params: undo.labelName ? { name: undo.labelName.slice(0, 80) } : {},
              }
            : undefined
        );
        // 05.3-78: remember the versions the server wrote, so a delete queued before any refetch resolves past them.
        if (result.checkVersion !== null && vars.baseVersion !== undefined) {
          recordWrittenVersion('decide_checks', vars.checkId, [vars.baseVersion, vars.baseVersion + 1], result.checkVersion);
        }
        if (result.goalVersion !== null && vars.decision.outcome === 'wait' && vars.decision.goal) {
          recordWrittenVersion('savings_goals', vars.decision.goal.id, [1], result.goalVersion);
        }
        return result;
      }),
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
          account_id: goal.account_id,
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
    onSettled: (_result: unknown, _err: unknown, vars: DecideOutcomeVars) => {
      inFlight.delete(vars.checkId);
    },
    onSuccess: (data: unknown, vars: DecideOutcomeVars) => {
      const result = data as DecideOutcomeResult | undefined;
      // 05.3-78: patch the cached rows to the written versions before the (un-awaited) refetch lands.
      if (result?.checkVersion != null) {
        const version = result.checkVersion;
        qc.setQueryData<CheckList>(queryKeys.decideChecks(vars.ownerId, vars.householdId), (old) =>
          old?.map((r) => (r.id === vars.checkId ? { ...r, version } : r))
        );
      }
      if (result?.goalVersion != null && vars.decision.outcome === 'wait' && vars.decision.goal) {
        const goalId = vars.decision.goal.id;
        const version = result.goalVersion;
        qc.setQueryData<SavingsGoalRow[]>(queryKeys.savingsGoals(vars.ownerId, vars.householdId), (old) =>
          old?.map((g) => (g.id === goalId ? { ...g, version } : g))
        );
      }
      void qc.invalidateQueries({ queryKey: queryKeys.decideChecks(vars.ownerId, vars.householdId) });
      void qc.invalidateQueries({ queryKey: queryKeys.undoLog(vars.ownerId) });
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

type CheckRef = Pick<DecideCheckRow, 'id' | 'created_by' | 'household_id' | 'name' | 'inputs'> & { version?: number };
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

type WaitSaveArgs = {
    check: CheckRef;
    verdict: VerdictState;
    currency: string;
    monthlyAmount: number;
    readyBy: string | null;
    today: string;
    goalTarget: number | null;
    coolingOff: boolean;
    /** 05.3-68: the everyday account the plan pot is linked to. */
    accountId?: string | null;
};
type WaitSaveResult = { reminder: 'set' | 'off' | 'none'; stepId: string; goalId: string | null };

function useWaitSaveCore(): { save(args: WaitSaveArgs): Promise<WaitSaveResult> } {
  const mutation = useOutcomeMutation();
  return {
    async save(args) {
      const { check } = args;
      const earlier = inFlight.get(check.id);
      if (earlier) return { reminder: 'none', stepId: earlier, goalId: null };
      const fallbackName = typeof check.inputs.name === 'string' ? check.inputs.name : '';
      const goal: DecideWaitGoal | null =
        args.goalTarget !== null && args.goalTarget > 0
          ? {
              id: Crypto.randomUUID(),
              name: check.name || fallbackName,
              currency: args.currency,
              target: args.goalTarget,
              account_id: args.accountId ?? null,
            }
          : null;
      const stepId = newStepId();
      inFlight.set(check.id, stepId);
      mutation.mutate({
        checkId: check.id,
        ownerId: check.created_by,
        householdId: check.household_id,
        baseVersion: check.version,
        decision: {
          outcome: 'wait',
          verdict: args.verdict,
          wait_monthly: args.monthlyAmount,
          ready_by: args.readyBy,
          cooling_off: args.coolingOff,
          goal,
        },
        undo: { stepId, labelKey: 'planSaved', labelName: check.name || fallbackName },
      });
      getAnalytics().track('decision_recorded', { decision: 'wait' });
      void scheduleCooling(check.id, args.coolingOff);
      const goalId = goal?.id ?? null;
      if (args.readyBy === null) return { reminder: 'none', stepId, goalId };
      try {
        const result = await reminders.scheduleWaitReminder(check.id, args.readyBy, args.today);
        return { reminder: result.scheduled ? 'set' : 'off', stepId, goalId };
      } catch {
        // A refused or failing scheduler still leaves the decision saved.
        return { reminder: 'off', stepId, goalId };
      }
    },
  };
}

export function useWaitAndSave(): {
  save(args: WaitSaveArgs): Promise<{ reminder: 'set' | 'off' | 'none'; stepId: string }>;
} {
  const core = useWaitSaveCore();
  return {
    async save(args) {
      const { reminder, stepId } = await core.save(args);
      return { reminder, stepId };
    },
  };
}

/**
 * 06.1 D-22: the whole amount of a cash check, or only the up-front part (dayOne, my share) of a plan. The server bounds the
 * target to the check's stored price (06.1-10), so a plan's up-front part can never exceed it. null when nothing is to be saved.
 */
export function saveForItTarget(check: CheckV2, evaluation: Evaluation): number | null {
  const purchase = evaluation.purchase;
  if (purchase === null) return null;
  const n = check.pay.mode === 'plan' ? purchase.dayOne : purchase.whole;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** The date the reminder fires: the engine's date, or the first of its month. */
function readyByOf(evaluation: Evaluation): string | null {
  const r = evaluation.result.readyBy;
  if (r === null) return null;
  return r.kind === 'date' ? r.date : `${r.month}-01`;
}

/**
 * 06.1 D-22: "Save for it" on a v3 check. One outcome call makes the locked goal linked to the check and moves the check to
 * waiting; the server records ONE undo step that reverses both. Returns the goal id for "See it in Grow".
 */
export function useSaveForIt(): {
  save(args: {
    check: CheckRef;
    v3: CheckV2;
    evaluation: Evaluation;
    /** What the user puts aside each month (minor units). */
    monthly: number;
    currency: string;
    today: string;
    coolingOff?: boolean;
    accountId?: string | null;
  }): Promise<{ reminder: 'set' | 'off' | 'none'; stepId: string; goalId: string | null }>;
} {
  const core = useWaitSaveCore();
  return {
    save(args) {
      return core.save({
        check: args.check,
        verdict: args.evaluation.result.legacyState,
        currency: args.currency,
        monthlyAmount: args.monthly,
        readyBy: readyByOf(args.evaluation),
        today: args.today,
        goalTarget: saveForItTarget(args.v3, args.evaluation),
        coolingOff: args.coolingOff ?? false,
        accountId: args.accountId ?? null,
      });
    },
  };
}

/** 06.1: "I'm not buying it" - the pass outcome with one Undo and the confirming toast. */
export function useNotBuying(): {
  pass(args: { check: CheckRef; evaluation: Evaluation; coolingOff?: boolean }): string | null;
} {
  const inner = usePass();
  return {
    pass(args) {
      const stepId = inner.pass({ check: args.check, verdict: args.evaluation.result.legacyState, coolingOff: args.coolingOff ?? false });
      if (stepId !== null) {
        showToast({
          kind: 'ordinary',
          text: { key: 'decide.screens.answerActions.notBuyingToast' },
          stepId,
        });
      }
      return stepId;
    },
  };
}

export function usePass(): {
  pass(args: { check: CheckRef; verdict: VerdictState; coolingOff: boolean }): string | null;
} {
  const mutation = useOutcomeMutation();
  return {
    pass(args) {
      const { check } = args;
      const earlier = inFlight.get(check.id);
      if (earlier) return earlier;
      const stepId = newStepId();
      inFlight.set(check.id, stepId);
      const fallbackName = typeof check.inputs.name === 'string' ? check.inputs.name : '';
      mutation.mutate({
        checkId: check.id,
        ownerId: check.created_by,
        householdId: check.household_id,
        baseVersion: check.version,
        decision: { outcome: 'pass', verdict: args.verdict, cooling_off: args.coolingOff },
        undo: { stepId, labelKey: 'notBuyingSaved', labelName: check.name || fallbackName },
      });
      getAnalytics().track('decision_recorded', { decision: 'pass' });
      void scheduleCooling(check.id, args.coolingOff);
      return stepId;
    },
  };
}
