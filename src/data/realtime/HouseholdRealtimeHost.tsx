// 08-23 (HH-11): one live channel for the signed-in household; the (app) layout mounts this after the consent redirect.
// Its own module so layout wiring tests can stand it in without the data layer.
import { useAuth } from '@/features/auth/AuthProvider';
import { useHouseholdId } from '@/data/queries/household';
import { useHouseholdRealtime } from './useHouseholdRealtime';

export function HouseholdRealtimeHost() {
  const { user } = useAuth();
  const { data: householdId } = useHouseholdId(user?.id);
  useHouseholdRealtime(householdId, user?.id);
  return null;
}
