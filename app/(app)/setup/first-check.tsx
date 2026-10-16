import { useLocalSearchParams } from 'expo-router';
import { FirstCheckScreen } from '@/features/decide/onboarding/FirstCheckScreen';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function SetupFirstCheckRoute() {
  const params = useLocalSearchParams<{ accountId?: string }>();
  const id = typeof params.accountId === 'string' && UUID.test(params.accountId) ? params.accountId : null;
  return <FirstCheckScreen accountId={id} />;
}
