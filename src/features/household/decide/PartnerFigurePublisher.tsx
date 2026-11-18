// 08.1-07: mounts the figure publisher only for a viewer who has an opt-in on, so nobody else pays for the month picture here.
import { usePartnerOptins } from '@/data/queries/partnerMoney';
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
  const on = (data ?? []).some((o) => o.owner_id === userId && o.enabled);
  return on ? <Publisher /> : null;
}
