// ACT-16, CONTEXT D-24: delete an empty account as one soft delete through apply_patches
// (deleted_at '$now') with its inverse step recorded in the same server transaction. A used
// account is refused by the server guard trigger (23514); the client rolls back and says so.
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { NOW_SENTINEL, buildStep, planBulkPatch } from '@/engine/undo';
import { applyPatches } from '@/db/patches';
import type { AccountRow } from '@/db/rows';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import type { WithPending } from '@/data/types';
import {
  classifySettledWriteError,
  settledWriteErrorCode,
  shouldRetryWrite,
  writeRetryDelay,
} from '@/data/sync/writeErrors';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { guardSession, markSession } from '@/data/sync/sessionEpoch';
import { recordWrittenVersion, resolveExpectedVersion } from '@/data/sync/versionChain';
import { showToast } from '@/state/undoToast';
import { undoLabelText } from '@/i18n/undoLabel';
import { writeClient } from './writeClient';
import { newStepId } from './undoCapture';

export interface DeleteAccountVars {
  householdId: string;
  ownerId: string;
  id: string;
  name: string;
  expectedVersion: number;
  stepId: string;
}

type AccountList = WithPending<AccountRow>[];

interface DeleteContext {
  previous: AccountList | undefined;
}

export function registerAccountDeleteMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.deleteAccount, {
    mutationFn: (vars: DeleteAccountVars) =>
      guardSession(vars, async () => {
        const client = await writeClient();
        const expected = resolveExpectedVersion('accounts', vars.id, vars.expectedVersion);
        const { forward, inverse } = planBulkPatch([
          {
            entity: 'accounts',
            id: vars.id,
            expectedVersion: expected,
            before: { deleted_at: null },
            patch: { deleted_at: NOW_SENTINEL },
          },
        ]);
        const step = buildStep(vars.stepId, 'accountDeleted', { name: vars.name }, inverse);
        const rows = await applyPatches(client, forward, step);
        for (const row of rows) recordWrittenVersion('accounts', row.id, [vars.expectedVersion, expected], row.version);
        return rows;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: DeleteAccountVars): Promise<DeleteContext> => {
      markSession(vars);
      const key = queryKeys.accounts(vars.householdId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<AccountList>(key);
      qc.setQueryData<AccountList>(key, (old) => (old ?? []).filter((a) => a.id !== vars.id));
      return { previous };
    },
    onSuccess: (_rows: unknown, vars: DeleteAccountVars) => {
      // Not awaited: query-core holds WRITE_SCOPE while onSuccess is awaited (WR-A15).
      void qc.invalidateQueries({ queryKey: queryKeys.accounts(vars.householdId) });
      void qc.invalidateQueries({ queryKey: queryKeys.accountBalances(vars.householdId) });
      void qc.invalidateQueries({ queryKey: queryKeys.undoLog(vars.ownerId) });
    },
    onError: async (err: unknown, vars: DeleteAccountVars, context: unknown) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found' && cls !== 'conflict') return;
      const previous = (context as DeleteContext | undefined)?.previous;
      if (previous) qc.setQueryData<AccountList>(queryKeys.accounts(vars.householdId), previous);
      void qc.invalidateQueries({ queryKey: queryKeys.accounts(vars.householdId) });
      await recordFailedWrite({
        entity: 'accounts',
        entityId: vars.id,
        kind: cls,
        code: settledWriteErrorCode(err),
        attempted: { deleted: true },
      });
      showToast({ kind: 'refusal', text: { key: 'undo.batchRefused' } });
    },
  });
}

export function useDeleteAccount(): {
  /** Returns the undo step id, minted once so a paused-mutation replay reuses it. */
  remove(account: Pick<AccountRow, 'id' | 'name' | 'version'>, ctx: { ownerId: string; householdId: string }): string;
} {
  const mutation = useMutation<unknown, unknown, DeleteAccountVars, DeleteContext>({
    mutationKey: mutationKeys.deleteAccount,
    scope: WRITE_SCOPE,
  });

  return {
    remove(account, ctx): string {
      const stepId = newStepId();
      mutation.mutate({
        householdId: ctx.householdId,
        ownerId: ctx.ownerId,
        id: account.id,
        name: account.name,
        expectedVersion: account.version,
        stepId,
      });
      showToast({ kind: 'destructive', text: undoLabelText('accountDeleted', { name: account.name }), stepId });
      return stepId;
    },
  };
}
