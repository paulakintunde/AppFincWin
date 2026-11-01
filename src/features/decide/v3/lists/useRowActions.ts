/**
 * 05.3-49 (D-23): the row actions the old screens had. Delete is the old undoable soft delete (useRemoveDecision through
 * useDeleteDecision, one Undo step). Check again starts a NEW open check from the decision's inputs and opens it in the v3 check.
 * Neither action writes the stored answer_v3.
 */
import { useRef } from 'react';
import { useReopenCheck } from '@/data/mutations/decideChecks';
import { useDecideChecks, useSavingsGoals } from '@/data/queries/decide';
import type { DecideCheckRow } from '@/db/decideChecks';
import { useRecordContext } from '@/features/record/useRecordContext';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { showToast } from '@/state/undoToast';
import { cancelCheckReminders } from '../../notifications/waitReminder';
import { useDeleteDecision } from '../../past/useDeleteDecision';
import { purchaseHref } from '../nav/hrefs';

/** Delete with Undo for a saved plan or a past decision; a live goal of the check goes in the same step. */
export function useDeleteRow() {
  const rc = useRecordContext();
  const goals = useSavingsGoals(
    rc.userId ?? undefined,
    rc.householdId ?? undefined,
  ).data;
  const del = useDeleteDecision();
  return {
    confirmCopy: del.confirmCopy,
    remove: (row: DecideCheckRow): void => del.deleteDecision(row, goals),
  };
}

/** Check again: a press opens the copy still unfinished, or makes a new one when every copy is decided. */
export function useCheckAgain(): (row: DecideCheckRow) => void {
  const { reopen } = useReopenCheck();
  const rc = useRecordContext();
  const checks = useDecideChecks(
    rc.userId ?? undefined,
    rc.householdId ?? undefined,
  ).data;
  const opened = useRef(new Map<string, string>());
  return (row) => {
    // Reuse a copy only while it is still unfinished; a decided copy means the next press makes a new one.
    const list = checks ?? [];
    const copy = list.find((c) => c.reopened_from === row.id && c.deleted_at === null && c.status === 'open');
    const remembered = opened.current.get(row.id);
    const rememberedRow = remembered === undefined ? undefined : list.find((c) => c.id === remembered);
    const stillOpen = remembered !== undefined && (rememberedRow === undefined || (rememberedRow.status === 'open' && rememberedRow.deleted_at === null));
    const live = copy?.id ?? (stillOpen ? remembered : undefined);
    if (live !== undefined) {
      pushOnce(purchaseHref(live));
      return;
    }
    cancelCheckReminders(row.id).catch(() => {});
    const id = reopen(row);
    opened.current.set(row.id, id);
    showToast({ kind: 'ordinary', text: { key: 'decide.toast.reopened' } });
    pushOnce(purchaseHref(id));
  };
}
