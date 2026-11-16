import { useLocalSearchParams } from 'expo-router';
import { JoinScreen } from '@/features/household/join/JoinScreen';

export default function HouseholdJoinRoute() {
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const code = Array.isArray(params.code) ? params.code[0] : params.code;
  return <JoinScreen initialCode={code} />;
}
