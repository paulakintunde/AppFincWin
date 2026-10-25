import { useLocalSearchParams } from 'expo-router';
import { uuidParam } from '@/features/navigation/routeParams';
import { FirstCheckScreen } from '@/features/decide/onboarding/FirstCheckScreen';

export default function SetupFirstCheckRoute() {
  const params = useLocalSearchParams<{ accountId?: string | string[] }>();
  // IN-D04: the same id check and array-param rule as every other route
  const id = uuidParam(params.accountId);
  return <FirstCheckScreen accountId={id} />;
}
