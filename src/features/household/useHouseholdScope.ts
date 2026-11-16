// 08-17: what every Household screen reads first -- who is looking, which household, whether they own it, and whether
// there is a connection. Owner actions are hidden from members here; the server refuses them anyway (T-08-62).
import { useHousehold, useHouseholdId, useHouseholdMembers } from '@/data/queries/household';
import { useSyncStatus } from '@/data/sync/useSyncStatus';
import type { HouseholdMemberRow } from '@/db/householdMembers';
import type { HouseholdRow } from '@/db/household';
import { useAuth } from '@/features/auth/AuthProvider';
import { useT } from '@/i18n';

export interface HouseholdScope {
  userId: string | null;
  householdId: string | null;
  household: HouseholdRow | null;
  /** The household name, or a plain fallback while it has none. */
  name: string;
  members: HouseholdMemberRow[];
  isOwner: boolean;
  online: boolean;
}

export function useHouseholdScope(): HouseholdScope {
  const t = useT();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const householdId = useHouseholdId(userId ?? undefined).data ?? null;
  const household = useHousehold(householdId).data ?? null;
  const members = useHouseholdMembers(householdId).data ?? [];
  const { isOnline } = useSyncStatus();
  const isOwner = userId !== null && members.some((m) => m.user_id === userId && m.is_owner);
  return {
    userId,
    householdId,
    household,
    name: household?.name?.trim() ? household.name : t('household.home.unnamed'),
    members,
    isOwner,
    online: isOnline,
  };
}
