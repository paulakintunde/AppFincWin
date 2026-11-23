// 07 D-32: the partner categories on shared lines and whose they are, for the Everyday sections. Names go through
// useMemberLabel (D-32 of Phase 8: the only way a user id becomes words), so a hidden name reads as the member's colour.
import { useMemo } from 'react';
import type { CategorySourceIds, PartnerCategoryRef } from '@/data/sharedCategories';
import { useMemberLabel } from '@/features/household/useMemberLabel';
import type { CategoryNaming } from './model/categoryNaming';

export function useCategoryNaming(
  householdId: string | null,
  partners: readonly PartnerCategoryRef[] | undefined,
  sourceIds: CategorySourceIds | undefined
): CategoryNaming {
  const label = useMemberLabel(householdId);
  return useMemo(
    () => ({ partners: new Map((partners ?? []).map((p) => [p.id, p] as const)), sourceIds, partnerName: (ownerId: string) => label(ownerId) }),
    [partners, sourceIds, label]
  );
}
