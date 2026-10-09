// ACT-13, ACT-14 (CONTEXT D-15; UI-SPEC 4/5): every single-row action on Activity in one
// place -- the swipe actions and the detail sheet's Mark as / Clone / Delete. Only existing,
// RLS-guarded mutation hooks are called; nothing here writes by itself.
//  - A plain line is marked paid / unpaid and deleted with one undoable step.
//  - A transfer toggles Moved / Scheduled on BOTH legs in one bulk step, and deletes through
//    the delete-both confirm (two entries go).
//  - An occurrence of a repeating series asks "This one / This and future" before deleting.
// Row actions are off while bulk selection is active.
import { useCallback } from 'react';
import type { ActivityRowView } from '@/data/queries/activity';
import { useRecurringSeries } from '@/data/queries/recurringSeries';
import { useBulkMarkUnpaid, useBulkPatch } from '@/data/mutations/patches';
import { useEndSeries } from '@/data/mutations/recurringSeries';
import { useDeleteTransaction, useMarkPaid } from '@/data/mutations/transactions';
import { useDeleteTransfer, type TransferLegRow } from '@/data/mutations/transfers';
import { daysInMonth } from '@/engine/recurring';
import { monthOf } from '@/engine/time';
import type { EntryMode } from '@/features/record/entry/transactionForm';
import { undoLabelText } from '@/i18n/undoLabel';
import { showToast } from '@/state/undoToast';

export interface RowActionsContext {
  householdId: string | null;
  ownerId: string | null;
  today: string;
  selectionActive: boolean;
  /** The loaded rows, so a transfer leg can find its partner. */
  rows?: readonly ActivityRowView[];
  accountName?: (accountId: string) => string;
}

export type DeletePrompt = 'scope' | 'transferDelete';

export interface RowActions {
  enabled: boolean;
  pay(row: ActivityRowView): void;
  unpay(row: ActivityRowView): void;
  /** Deletes a plain line at once; returns the prompt the screen must show otherwise. */
  remove(row: ActivityRowView): { prompt: DeletePrompt } | null;
  /** Scope prompt answers and the delete-both confirm. */
  deleteThisOne(row: ActivityRowView): void;
  deleteThisAndFuture(row: ActivityRowView): void;
  deleteTransfer(row: ActivityRowView): void;
  cloneMode(row: ActivityRowView, viewedMonth: string): EntryMode;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function useRowActions(ctx: RowActionsContext): RowActions {
  const { householdId, ownerId, today, selectionActive, rows, accountName } = ctx;
  const enabled = !selectionActive && householdId !== null && ownerId !== null;
  const { markPaid } = useMarkPaid();
  const { markUnpaid } = useBulkMarkUnpaid();
  const { apply } = useBulkPatch();
  const { remove: removeTransaction } = useDeleteTransaction();
  const { remove: removeTransfer } = useDeleteTransfer();
  const { end } = useEndSeries();
  const series = useRecurringSeries(householdId ?? undefined).data;

  const partnerOf = useCallback(
    (row: ActivityRowView): ActivityRowView | undefined =>
      (rows ?? []).find((r) => r.transfer_id === row.transfer_id && r.id !== row.id),
    [rows]
  );

  const labelNameOf = useCallback(
    (row: ActivityRowView): string => (row.counterpartAccountId ? (accountName?.(row.counterpartAccountId) ?? '') : ''),
    [accountName]
  );

  const setTransferStatus = useCallback(
    (row: ActivityRowView, from: 'pending' | 'paid', to: 'pending' | 'paid') => {
      if (!householdId || !ownerId) return;
      const partner = partnerOf(row);
      if (!partner) {
        // A pair never splits status: without the other leg in hand nothing is written.
        showToast({ kind: 'info', text: { key: 'record.sheet.transferNeedsBothSides' } });
        return;
      }
      const legs = [row, partner];
      const stepId = apply({
        householdId,
        ownerId,
        items: legs.map((r) => ({
          entity: 'transactions' as const,
          id: r.id,
          expectedVersion: r.version,
          before: { status: from },
          patch: { status: to },
        })),
        months: [...new Set(legs.map((r) => monthOf(r.local_date)))],
        undo: { labelKey: 'transferEdited', labelParams: { name: labelNameOf(row) } },
      });
      showToast({ kind: 'ordinary', text: undoLabelText('transferEdited', { name: labelNameOf(row) }), stepId });
    },
    [householdId, ownerId, partnerOf, apply, labelNameOf]
  );

  const pay = useCallback(
    (row: ActivityRowView) => {
      if (!enabled || ownerId === null || row.status !== 'pending') return;
      if (row.transfer_id !== null) return setTransferStatus(row, 'pending', 'paid');
      const stepId = markPaid(row, ownerId, today);
      showToast({ kind: 'ordinary', text: undoLabelText('markedPaid', { name: row.name ?? undefined }), stepId });
    },
    [enabled, ownerId, today, markPaid, setTransferStatus]
  );

  const unpay = useCallback(
    (row: ActivityRowView) => {
      if (!enabled || householdId === null || ownerId === null || row.status !== 'paid') return;
      if (row.transfer_id !== null) return setTransferStatus(row, 'paid', 'pending');
      const stepId = markUnpaid([row], { householdId, ownerId });
      showToast({ kind: 'ordinary', text: undoLabelText('markedUnpaidMany', { n: 1 }), stepId });
    },
    [enabled, householdId, ownerId, markUnpaid, setTransferStatus]
  );

  const deleteLine = useCallback(
    (row: ActivityRowView) => {
      if (ownerId === null) return null;
      const stepId = removeTransaction(row, ownerId);
      showToast({ kind: 'destructive', text: undoLabelText('deleted', { name: row.name ?? undefined }), stepId });
      return stepId;
    },
    [ownerId, removeTransaction]
  );

  const remove = useCallback(
    (row: ActivityRowView): { prompt: DeletePrompt } | null => {
      if (!enabled) return null;
      if (row.transfer_id !== null) return { prompt: 'transferDelete' };
      if (row.recurring_series_id !== null) return { prompt: 'scope' };
      deleteLine(row);
      return null;
    },
    [enabled, deleteLine]
  );

  const deleteThisOne = useCallback(
    (row: ActivityRowView) => {
      if (enabled) deleteLine(row);
    },
    [enabled, deleteLine]
  );

  const deleteThisAndFuture = useCallback(
    (row: ActivityRowView) => {
      if (!enabled || householdId === null || ownerId === null) return;
      const s = row.recurring_series_id ? series?.find((x) => x.id === row.recurring_series_id) : undefined;
      // The series is not loaded: only this one can be sent (the prompt disables the other).
      if (!s) return void deleteLine(row);
      const stepId = end({
        id: s.id,
        householdId,
        expectedVersion: s.version,
        endDate: row.local_date,
        ownerId,
        name: s.name,
      });
      showToast({ kind: 'destructive', text: undoLabelText('seriesEnded', { name: s.name }), stepId });
      deleteLine(row);
    },
    [enabled, householdId, ownerId, series, end, deleteLine]
  );

  const deleteTransfer = useCallback(
    (row: ActivityRowView) => {
      if (!enabled || ownerId === null || row.transfer_id === null) return;
      const partner = partnerOf(row);
      const labelName = labelNameOf(row);
      const stepId = removeTransfer(
        row as unknown as TransferLegRow,
        { ownerId, labelName },
        partner ? (partner as unknown as TransferLegRow) : undefined
      );
      showToast({ kind: 'destructive', text: undoLabelText('transferDeleted', { name: labelName }), stepId });
    },
    [enabled, ownerId, partnerOf, labelNameOf, removeTransfer]
  );

  const cloneMode = useCallback(
    (row: ActivityRowView, viewedMonth: string): EntryMode => {
      const day = Number(row.local_date.slice(8, 10));
      const dim = daysInMonth(Number(viewedMonth.slice(0, 4)), Number(viewedMonth.slice(5, 7)));
      const localDate = viewedMonth === monthOf(today) ? today : `${viewedMonth}-${pad2(Math.min(day, dim))}`;
      return {
        kind: 'new',
        direction: row.is_refund || row.original_amount < 0 ? 'out' : 'in',
        localDate,
        prefill: {
          amountMinor: row.original_amount,
          currency: row.original_currency,
          name: row.name,
          categoryId: row.category_id,
          accountId: row.account_id,
          paymentType: row.payment_type,
          isRefund: row.is_refund,
          isAutomatic: row.is_automatic,
        },
      };
    },
    [today]
  );

  return { enabled, pay, unpay, remove, deleteThisOne, deleteThisAndFuture, deleteTransfer, cloneMode };
}
