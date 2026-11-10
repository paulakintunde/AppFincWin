// 06-32 (D-32, CRUD #5): a paid goal or safety-net history row opens the same transaction detail Activity uses, so a wrong
// "Add money" can be fixed or removed from Grow. The writes are Activity's own (useRowActions + useRowFlow): a transfer leg
// deletes through the delete-both confirm (both legs go, one Undo), a plain line with the scope prompt or at once with Undo.
// Nothing here writes by itself.
import React, { useCallback, useMemo } from 'react';
import type { ActivityRowView } from '@/data/queries/activity';
import { useTransferLegs } from '@/data/queries/activity';
import { useAccounts } from '@/data/queries/accounts';
import type { TransactionRow } from '@/db/rows';
import { monthOf } from '@/engine/time';
import { useT } from '@/i18n';
import { TransactionDetailSheet } from '@/features/record/activity/TransactionDetailSheet';
import { useRowFlow } from '@/features/record/activity/useActivityViewModel';
import { useRowActions } from '@/features/record/activity/useRowActions';
import { EditScopePrompt } from '@/features/record/entry/EditScopePrompt';
import { TransactionSheet } from '@/features/record/entry/TransactionSheet';
import { ConfirmSheet } from '@/ui/ConfirmSheet';

export interface GoalRecordDetail {
  /** The other leg of a transfer line, when it is loaded. */
  partnerOf(line: TransactionRow): TransactionRow | null;
  accountName(id: string | null): string | null;
  open(line: TransactionRow): void;
  element: React.ReactElement;
}

export function useGoalRecordDetail(args: {
  householdId: string | null;
  ownerId: string | null;
  today: string;
  /** The goal-tagged lines as read (only this goal's are used). */
  allLines: readonly TransactionRow[] | undefined;
  goalId: string | null;
}): GoalRecordDetail {
  const { householdId, ownerId, today, allLines, goalId } = args;
  const lines = useMemo(() => (goalId === null ? [] : (allLines ?? []).filter((l) => l.goal_id === goalId)), [allLines, goalId]);
  return useRecordLineDetail({ householdId, ownerId, today, lines });
}

/**
 * 06-36: the same detail for any set of lines the caller has already picked (a debt's payments). The goal hook above is this
 * with the goal's own lines.
 */
export function useRecordLineDetail(args: {
  householdId: string | null;
  ownerId: string | null;
  today: string;
  lines: readonly TransactionRow[];
}): GoalRecordDetail {
  const { householdId, ownerId, today, lines } = args;
  const t = useT();
  const accounts = useAccounts(householdId ?? undefined).data;
  const transferIds = useMemo(
    () => [...new Set(lines.map((l) => l.transfer_id).filter((x): x is string => x !== null))].sort(),
    [lines]
  );
  const { legs } = useTransferLegs(householdId, transferIds);

  const partnerOf = useCallback(
    (line: TransactionRow): TransactionRow | null =>
      line.transfer_id === null ? null : (legs.find((l) => l.transfer_id === line.transfer_id && l.id !== line.id) ?? null),
    [legs]
  );
  const accountName = useCallback(
    (id: string | null): string | null => (id === null ? null : ((accounts ?? []).find((a) => a.id === id)?.name ?? null)),
    [accounts]
  );
  const viewOf = useCallback(
    (row: TransactionRow): ActivityRowView => ({
      ...row,
      amountHome: row.home_amount ?? null,
      overdue: false,
      counterpartAccountId: row.transfer_id === null ? null : (partnerOf(row)?.account_id ?? null),
    }),
    [partnerOf]
  );
  // Both legs, so a transfer delete sends the partner's observed version too.
  const views = useMemo(() => {
    const byId = new Map<string, TransactionRow>();
    for (const l of [...lines, ...legs]) byId.set(l.id, l);
    return [...byId.values()].map(viewOf);
  }, [lines, legs, viewOf]);

  const nameOf = useCallback((id: string) => accountName(id) ?? '', [accountName]);
  const rowActions = useRowActions({ householdId, ownerId, today, selectionActive: false, rows: views, accountName: nameOf });
  const flow = useRowFlow(rowActions, monthOf(today));
  const { openDetail } = flow;
  const open = useCallback((line: TransactionRow) => openDetail(viewOf(line)), [openDetail, viewOf]);

  const element = (
    <>
      <TransactionDetailSheet {...flow.detail} today={today} />
      <EditScopePrompt
        visible={flow.pendingDelete?.prompt === 'scope'}
        onThisOne={() => flow.answerDelete('one')}
        onThisAndFuture={() => flow.answerDelete('future')}
        onCancel={() => flow.answerDelete('cancel')}
      />
      <ConfirmSheet
        visible={flow.pendingDelete?.prompt === 'transferDelete'}
        body={t('record.sheet.transferDeleteConfirm', {
          from: nameOf(flow.pendingDelete?.row.account_id ?? ''),
          to: nameOf(flow.pendingDelete?.row.counterpartAccountId ?? ''),
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
  return { partnerOf, accountName, open, element };
}
