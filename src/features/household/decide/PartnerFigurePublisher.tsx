// 08.1-07: mounts the figure publisher only for a viewer who has an opt-in (or a shared safety net) on, so nobody else pays for the month picture here.
import { useOwnNetShares, usePartnerOptins } from '@/data/queries/partnerMoney';
import { useHouseholdId } from '@/data/queries/household';
import { useAuth } from '@/features/auth/AuthProvider';
import { usePublishPartnerFigure } from './usePublishPartnerFigure';

function Publisher(): null {
  usePublishPartnerFigure();
  return null;
}

export function PartnerFigurePublisher({ householdId }: { householdId: string | null | undefined }) {
  const { user } = useAuth();
  const userId = user?.id;
  const { data } = usePartnerOptins(userId, householdId);
  const { data: shares } = useOwnNetShares(userId, householdId);
  // 08.1-10: also while a shared safety net is on, so its saved amount reaches the partner.
  const on = (data ?? []).some((o) => o.owner_id === userId && o.enabled) || (shares ?? []).some((x) => x.enabled);
  return on ? <Publisher /> : null;
}

/** 08.1-10: the same publisher for the signed-in shell, so it does not wait for Household home to be open. */
export function AppPartnerFigurePublisher() {
  const { user } = useAuth();
  const householdId = useHouseholdId(user?.id).data ?? null;
  return <PartnerFigurePublisher householdId={householdId} />;
}
