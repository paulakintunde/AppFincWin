// 05-73 (D-73, R3, R9): the one delete path for a decided check, shared by the Past decisions list and the detail
// sheet. Only the check row (and a Waiting decision's own goal) is soft-deleted, in one undo step. A line Go ahead wrote,
// or a transfer tagged to the goal, is never touched, and the confirm copy says so.
// 06.1-77 (DC-4, OQ-77-1 A): when the up-front amount "I bought it" added is known, the copy names it: "The $12 in your
// records stays." (and its planned payments, for a plan). The record is kept; the detail adds a link to it.
import { useRemoveDecision } from '@/data/mutations/decideChecks';
import type { DecideCheckRow } from '@/db/decideChecks';
import type { DecideLinkRow } from '@/db/decideLinks';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { useT } from '@/i18n';
import { showToast } from '@/state/undoToast';
import { cancelCheckReminders } from '@/features/decide/notifications/waitReminder';

export interface DeleteConfirmCopy {
  title: string;
  body: string;
}

/** 06.1-77: what stays in the records after Remove, when it is known: the formatted up-front amount, and whether payments were written too. */
export interface KeptRecord {
  amount: string;
  withPayments: boolean;
}

/** The lines Go ahead wrote for a decision: its live links whose source is 'written'. */
export function writtenCount(links: readonly DecideLinkRow[] | undefined): number {
  return (links ?? []).filter((l) => l.source === 'written' && l.deleted_at === null).length;
}

export function useDeleteDecision() {
  const t = useT() as (key: string, params?: Record<string, string | number>) => string;
  const { remove } = useRemoveDecision();

  const confirmCopy = (decision: DecideCheckRow, written: number, kept: KeptRecord | null = null): DeleteConfirmCopy => {
    const title = t('decide.delete.decisionTitle');
    if (decision.status === 'bought' && kept !== null) {
      const key = kept.withPayments ? 'decide.screens.past.remove.recordStaysPlan' : 'decide.screens.past.remove.recordStays';
      return { title, body: t(key, { amount: kept.amount }) };
    }
    if (decision.status === 'bought') {
      return { title, body: t('decide.delete.boughtBody', { count: written }) };
    }
    if (decision.status === 'waiting') return { title, body: t('decide.delete.waitingBody') };
    return { title, body: t('decide.delete.passedBody') };
  };

  const deleteDecision = (decision: DecideCheckRow, goals: readonly SavingsGoalRow[] | undefined): void => {
    const liveGoal = (goals ?? []).find((g) => g.check_id === decision.id && g.deleted_at === null) ?? null;
    const stepId = remove(decision, liveGoal);
    cancelCheckReminders(decision.id).catch(() => {});
    showToast({ kind: 'destructive', text: { key: 'decide.delete.toastDecision', params: { name: decision.name } }, stepId });
  };

  return { confirmCopy, deleteDecision };
}
