// Cached description-to-category rules and the user's categorised names (REC-27, D-27, D-07).
// Both persist like other Record reads; a failed read leaves data undefined and callers
// degrade to no rules / no learned names.
import { useQuery } from '@tanstack/react-query';
import { fetchCategoryRules } from '@/db/categoryRules';
import { fetchCategorisedNames } from '@/db/transactions';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';

export function useCategoryRules(userId?: string, householdId?: string) {
  return useQuery({
    queryKey: queryKeys.categoryRules(userId ?? '', householdId ?? ''),
    queryFn: () => fetchCategoryRules(supabase),
    enabled: Boolean(userId) && Boolean(householdId),
  });
}

export function useCategorisedNames(householdId?: string, userId?: string) {
  return useQuery({
    queryKey: queryKeys.categorisedNames(householdId ?? '', userId ?? ''),
    queryFn: () => fetchCategorisedNames(supabase, householdId as string, userId as string),
    enabled: Boolean(householdId) && Boolean(userId),
  });
}
