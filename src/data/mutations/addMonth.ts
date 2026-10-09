// ACT-15, CONTEXT D-16: add the next month to Activity through the add_activity_month RPC.
// The RPC records its own undo step in the same transaction (like the series RPCs), so nothing
// here calls insertUndoStep: the step id is minted once, before mutate(), and rides in the
// persisted variables so a paused-mutation replay comes back 'already-applied' (D-29).
import * as Crypto from 'expo-crypto';
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { addableMonth } from '@/engine/activity';
import { addActivityMonth, MonthNotAddableError, type AddActivityMonthResult } from '@/db/recordReads';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import {
  classifySettledWriteError,
  settledWriteErrorCode,
  shouldRetryWrite,
  writeRetryDelay,
} from '@/data/sync/writeErrors';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { guardSession, markSession } from '@/data/sync/sessionEpoch';
import { showToast } from '@/state/undoToast';
import { undoLabelText } from '@/i18n/undoLabel';
import { writeClient } from './writeClient';

export interface AddMonthVars {
  householdId: string;
  ownerId: string;
  month: string;
  today: string;
  undo: { id: string; labelKey: 'monthAdded'; labelParams: { name: string } };
}

interface AddMonthContext {
  previousHorizon: string | null | undefined;
}

function invalidateMonthReads(qc: QueryClient, vars: AddMonthVars): void {
  // Not awaited: query-core holds WRITE_SCOPE while onSuccess/onError are awaited (WR-A15).
  void qc.invalidateQueries({ queryKey: queryKeys.householdHorizon(vars.householdId) });
  void qc.invalidateQueries({ queryKey: queryKeys.transactionMonths(vars.householdId) });
  void qc.invalidateQueries({ queryKey: queryKeys.transactionsMonth(vars.householdId, vars.month) });
  void qc.invalidateQueries({ queryKey: queryKeys.undoLog(vars.ownerId) });
}

export function registerAddMonthMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.addMonth, {
    mutationFn: (vars: AddMonthVars) =>
      guardSession(vars, async () =>
        addActivityMonth(await writeClient(), {
          householdId: vars.householdId,
          month: vars.month,
          today: vars.today,
          undo: vars.undo,
        })
      ),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: AddMonthVars): Promise<AddMonthContext> => {
      markSession(vars);
      const key = queryKeys.householdHorizon(vars.householdId);
      await qc.cancelQueries({ queryKey: key });
      const previousHorizon = qc.getQueryData<string | null>(key);
      // The month list shows the new month at once; the refetch confirms it.
      qc.setQueryData<string | null>(key, vars.month);
      return { previousHorizon };
    },
    onSuccess: (_result: AddActivityMonthResult, vars: AddMonthVars) => {
      invalidateMonthReads(qc, vars);
    },
    onError: async (err: unknown, vars: AddMonthVars, context: unknown) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found' && cls !== 'conflict') return;
      const key = queryKeys.householdHorizon(vars.householdId);
      const previous = (context as AddMonthContext | undefined)?.previousHorizon;
      if (previous !== undefined) qc.setQueryData<string | null>(key, previous);
      else void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: queryKeys.transactionMonths(vars.householdId) });
      // Ids and the month only (T-02.2-23-03).
      await recordFailedWrite({
        entity: 'households',
        entityId: vars.householdId,
        kind: cls,
        code: err instanceof MonthNotAddableError ? err.code : settledWriteErrorCode(err),
        attempted: { month: vars.month },
      });
      showToast({ kind: 'refusal', text: { key: 'undo.batchRefused' } });
    },
  });
}

export function useAddMonth(): {
  /** Returns the undo step id, minted once so a paused-mutation replay reuses it. */
  add(input: { householdId: string; ownerId: string; today: string; horizonMonth: string | null; monthLabel: string }): string;
} {
  const mutation = useMutation<AddActivityMonthResult, unknown, AddMonthVars, AddMonthContext>({
    mutationKey: mutationKeys.addMonth,
    scope: WRITE_SCOPE,
  });

  return {
    add(input): string {
      const month = addableMonth(input.today, input.horizonMonth);
      if (month === null) throw new RangeError('useAddMonth: no month can be added');
      const stepId = Crypto.randomUUID();
      mutation.mutate({
        householdId: input.householdId,
        ownerId: input.ownerId,
        month,
        today: input.today,
        undo: { id: stepId, labelKey: 'monthAdded', labelParams: { name: input.monthLabel } },
      });
      showToast({ kind: 'ordinary', text: undoLabelText('monthAdded', { name: input.monthLabel }), stepId });
      return stepId;
    },
  };
}
