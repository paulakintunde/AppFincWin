import { useLocalSearchParams } from 'expo-router';
import { ApprovePlanScreen } from '@/features/household/approve/ApprovePlanScreen';

// 09-20 (UI-SPEC 8b): the payer's approval screen, opened from the push or the notice with ?request=<id>.
export default function HouseholdApproveRoute() {
  const params = useLocalSearchParams<{ request?: string | string[]; name?: string | string[] }>();
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return <ApprovePlanScreen requestId={one(params.request) ?? ''} name={one(params.name)} />;
}
