import { useLocalSearchParams } from 'expo-router';
import { RemoveMemberScreen } from '@/features/household/leave/RemoveMemberScreen';

export default function HouseholdRemoveRoute() {
  const params = useLocalSearchParams<{ userId?: string | string[] }>();
  const userId = Array.isArray(params.userId) ? params.userId[0] : params.userId;
  return <RemoveMemberScreen userId={userId ?? null} />;
}
