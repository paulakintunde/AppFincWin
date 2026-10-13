// D-23: read-only in the import; the detail sheet's own actions are the user's ordinary edits.
// The extras (app lines in the statement period that are not on the statement) open the same
// detail flow Activity uses: detail sheet, delete scope prompt, transfer confirm, edit sheet.
import React, { useCallback } from 'react';
import type { ActivityRowView } from '@/data/queries/activity';
import type { TransactionRow } from '@/db/rows';
import { EditScopePrompt } from '@/features/record/entry/EditScopePrompt';
import { TransactionSheet } from '@/features/record/entry/TransactionSheet';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useRowActions } from '@/features/record/activity/useRowActions';
import { useRowFlow } from '@/features/record/activity/useActivityViewModel';
import { TransactionDetailSheet } from '@/features/record/activity/TransactionDetailSheet';
import { monthOf } from '@/engine/time';
import { useT } from '@/i18n';
import { ConfirmSheet } from '@/ui/ConfirmSheet';

export function useExtrasDetail(
  extraRows: ReadonlyMap<string, TransactionRow>,
  accountName: (id: string) => string
): { open: (id: string) => void; element: React.ReactElement } {
  const t = useT();
  const rc = useRecordContext();
  const rowActions = useRowActions({
    householdId: rc.householdId,
    ownerId: rc.userId,
    today: rc.today,
    selectionActive: false,
    accountName,
  });
  const flow = useRowFlow(rowActions, monthOf(rc.today));
  const { openDetail } = flow;

  const open = useCallback(
    (id: string) => {
      const row = extraRows.get(id);
      if (row === undefined) return;
      const view: ActivityRowView = { ...row, amountHome: row.home_amount, overdue: false, counterpartAccountId: null };
      openDetail(view);
    },
    [extraRows, openDetail]
  );

  const element = (
    <>
      <TransactionDetailSheet {...flow.detail} today={rc.today} />
      <EditScopePrompt
        visible={flow.pendingDelete?.prompt === 'scope'}
        onThisOne={() => flow.answerDelete('one')}
        onThisAndFuture={() => flow.answerDelete('future')}
        onCancel={() => flow.answerDelete('cancel')}
      />
      <ConfirmSheet
        visible={flow.pendingDelete?.prompt === 'transferDelete'}
        body={t('record.sheet.transferDeleteConfirm', {
          from: accountName(flow.pendingDelete?.row.account_id ?? ''),
          to: accountName(flow.pendingDelete?.row.counterpartAccountId ?? ''),
        })}
        cancelLabel={t('activity.bulkDeleteCancel')}
        confirmLabel={t('activity.bulkDeleteProceed')}
        destructive
        onConfirm={() => flow.answerDelete('transfer')}
        onCancel={() => flow.answerDelete('cancel')}
      />
      <TransactionSheet
        visible={flow.entryMode !== null}
        mode={flow.entryMode ?? { kind: 'new', direction: 'out' }}
        onClose={() => flow.setEntryMode(null)}
      />
    </>
  );
  return { open, element };
}
