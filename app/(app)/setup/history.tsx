import { useLocalSearchParams } from 'expo-router';
import { SetupHistoryScreen } from '@/features/record/setup/SetupHistoryScreen';

export default function SetupHistoryRoute() {
  const params = useLocalSearchParams<{ accountId?: string }>();
  return <SetupHistoryScreen accountId={params.accountId ?? null} />;
}
