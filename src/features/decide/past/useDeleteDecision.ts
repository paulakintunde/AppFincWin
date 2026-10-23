// 05-73 (D-73, R3, R9): the one delete path for a decided check, shared by the Past decisions list and the detail
// sheet. Only the check row (and a Waiting decision's own goal) is soft-deleted, in one undo step. A line Go ahead wrote,
// or a transfer tagged to the goal, is never touched, and the confirm copy says so.
import { useRemoveDecision } from '@/data/mutations/decideChecks';
import type { DecideCheckRow } from '@/db/decideChecks';
import type { DecideLinkRow } from '@/db/decideLinks';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { useT } from '@/i18n';
import { showToast } from '@/state/undoToast';
import { cancelCheckReminders } from '../notifications/waitReminder';

export interface DeleteConfirmCopy {
  title: string;
  body: string;
}

/** The lines Go ahead wrote for a decision: its live links whose source is 'written'. */
export function writtenCount(links: readonly DecideLinkRow[] | undefined): number {
  return (links ?? []).filter((l) => l.source === 'written' && l.deleted_at === null).length;
}

export function useDeleteDecision() {
  const t = useT() as (key: string, params?: Record<string, string | number>) => string;
  const { remove } = useRemoveDecision();

  const confirmCopy = (decision: DecideCheckRow, written: number): DeleteConfirmCopy => {
    const title = t('decide.delete.decisionTitle');
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
    showToast({ kind: 'destructive', text: { key: 'decide.delete.toastDecision' }, stepId });
  };

  return { confirmCopy, deleteDecision };
}
