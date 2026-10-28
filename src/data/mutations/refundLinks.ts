// 05.2-16 (DSU-16, DSU-21; D-06..D-10): link a money-in row to the purchase it refunds, and unlink it. One apply_patches
// call per action that also records its undo step. Only refund_of (and is_refund on link) changes: balances and
// amounts never move. Any number of refunds may link to one purchase (D-08), so there is no client-side uniqueness;
// the database guard (05.2-02) refuses a link to a row the household does not own. Failed-write records hold ids
// and column names only.
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { buildStep, planBulkPatch, type BulkPatchItem, type PatchValue, type UndoConflict, type UndoLabelKey } from '@/engine/undo';
import { VersionConflictError, type WriteEntity } from '@/db/errors';
import { applyPatches } from '@/db/patches';
import type { TransactionRow } from '@/db/rows';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
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
import { writeClient } from './writeClient';
import { newStepId } from './undoCapture';
import { invalidateDerivedReads } from './transactionCache';
import { mergeIntoMonths } from './incomeTags';

export interface RefundLinkVars {
  ownerId: string;
  householdId: string;
  stepId: string;
  labelKey: UndoLabelKey;
  item: BulkPatchItem;
  month: string;
}

async function runRefund(vars: RefundLinkVars) {
  const client = await writeClient();
  const item = {
    ...vars.item,
    expectedVersion: resolveExpectedVersion(vars.item.entity as WriteEntity, vars.item.id, vars.item.expectedVersion),
  };
  const { forward, inverse } = planBulkPatch([item]);
  const step = buildStep(vars.stepId, vars.labelKey, {}, inverse);
  const rows = await applyPatches(client, forward, step);
  for (const row of rows) {
    recordWrittenVersion(row.entity as WriteEntity, row.id, [vars.item.expectedVersion, item.expectedVersion], row.version);
  }
  return rows;
}

function invalidateRefund(qc: QueryClient, vars: RefundLinkVars): void {
  // Not awaited: query-core holds WRITE_SCOPE while onSuccess/onError are awaited (WR-A15).
  void qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(vars.householdId) });
  void qc.invalidateQueries({ queryKey: queryKeys.undoLog(vars.ownerId) });
  invalidateDerivedReads(qc, vars.householdId);
}

export function registerRefundLinkMutations(qc: QueryClient): void {
  for (const key of [mutationKeys.linkRefund, mutationKeys.unlinkRefund]) {
    qc.setMutationDefaults(key, {
      mutationFn: (vars: RefundLinkVars) => guardSession(vars, () => runRefund(vars)),
      scope: WRITE_SCOPE,
      retry: shouldRetryWrite,
      retryDelay: writeRetryDelay,
      onMutate: async (vars: RefundLinkVars) => {
        markSession(vars);
        await qc.cancelQueries({ queryKey: queryKeys.transactionsRoot(vars.householdId) });
        mergeIntoMonths(qc, vars.householdId, [vars.month], new Map([[vars.item.id, vars.item.patch as Record<string, PatchValue>]]), true);
      },
      onSuccess: (_rows: unknown, vars: RefundLinkVars) => {
        invalidateRefund(qc, vars);
      },
      onError: async (err: unknown, vars: RefundLinkVars) => {
        const cls = classifySettledWriteError(err);
        if (cls !== 'conflict' && cls !== 'rejected' && cls !== 'not-found') return;
        const attempted = { labelKey: vars.labelKey, n: 1, fields: Object.keys(vars.item.patch) };
        if (err instanceof VersionConflictError) {
          invalidateRefund(qc, vars);
          const conflict = err.serverRow as UndoConflict;
          await recordFailedWrite({ entity: conflict.entity, entityId: conflict.id, kind: 'conflict', code: 'version-conflict', attempted });
          showToast({ kind: 'refusal', refusal: conflict });
          return;
        }
        mergeIntoMonths(qc, vars.householdId, [vars.month], new Map([[vars.item.id, vars.item.before as Record<string, PatchValue>]]), false);
        invalidateRefund(qc, vars);
        await recordFailedWrite({
          entity: 'transactions',
          entityId: vars.item.id,
          kind: cls,
          code: settledWriteErrorCode(err),
          attempted,
        });
      },
    });
  }
}

function submit(
  mutate: (vars: RefundLinkVars) => void,
  ownerId: string,
  householdId: string,
  labelKey: UndoLabelKey,
  refund: TransactionRow,
  patch: Record<string, PatchValue>,
  before: Record<string, PatchValue>
): { stepId: string } {
  const stepId = newStepId();
  mutate({
    ownerId,
    householdId,
    stepId,
    labelKey,
    month: refund.local_date.slice(0, 7),
    item: { entity: 'transactions', id: refund.id, expectedVersion: refund.version, before, patch },
  });
  return { stepId };
}

/** Link a money-in row to the purchase it refunds. Several refunds may link to one purchase. */
export function useLinkRefund(
  householdId: string,
  ownerId: string
): { link(refund: TransactionRow, purchase: TransactionRow): { stepId: string } } {
  const mutation = useMutation<unknown, unknown, RefundLinkVars>({ mutationKey: mutationKeys.linkRefund, scope: WRITE_SCOPE });
  return {
    link(refund, purchase) {
      return submit(
        mutation.mutate,
        ownerId,
        householdId,
        'refundLinked',
        refund,
        { refund_of: purchase.id, is_refund: true },
        { refund_of: refund.refund_of ?? null, is_refund: refund.is_refund }
      );
    },
  };
}

/** Clear the link. The row keeps is_refund: it is still money back, it just names no purchase. */
export function useUnlinkRefund(householdId: string, ownerId: string): { unlink(refund: TransactionRow): { stepId: string } } {
  const mutation = useMutation<unknown, unknown, RefundLinkVars>({ mutationKey: mutationKeys.unlinkRefund, scope: WRITE_SCOPE });
  return {
    unlink(refund) {
      return submit(mutation.mutate, ownerId, householdId, 'refundUnlinked', refund, { refund_of: null }, { refund_of: refund.refund_of ?? null });
    },
  };
}
