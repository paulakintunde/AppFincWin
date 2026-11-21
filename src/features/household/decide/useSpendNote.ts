// 08.1-23 (CMP-F19, owner 2026-11-21 Q6, Q12): the spending rule a check counts, read live from the group's saved rule, members and
// accounts (never saved on a check, 22 Q12). The words come from spendNote.ts (pure).
import { useHouseholdId } from '@/data/queries/household';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSpendRule } from '../rules/useSpendRule';
import { spendNoteOf, type SpendNote } from './spendNote';

export type { SpendNote } from './spendNote';

export function useSpendNote(): SpendNote | null {
  const { user } = useAuth();
  const userId = user?.id;
  const householdId = useHouseholdId(userId).data ?? undefined;
  const read = useSpendRule(householdId, userId);
  return spendNoteOf(read.view, read.jointAccounts);
}
