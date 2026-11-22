// 08.1-10 (APP-22, D-02): the scope line of an answer: "Just you" for a Just me check, "Household · {name}" for a Household check. The
// household name is the household's own (a nameless one reads as the plain fallback); no member name is used here (D-32).
import { useHousehold, useHouseholdId } from '@/data/queries/household';
import { useAuth } from '@/features/auth/AuthProvider';
import { useT } from '@/i18n';

export function useHouseholdScopeLabel(scope: 'me' | 'household'): string {
  const t = useT();
  const { user } = useAuth();
  const householdId = useHouseholdId(user?.id).data ?? null;
  const household = useHousehold(householdId).data ?? null;
  if (scope === 'me') return t('decide.screens.answer.scope.justYou');
  const name = household?.name?.trim() ? household.name.trim() : t('household.home.unnamed');
  return t('decide.screens.answer.scope.household', { household: name });
}
