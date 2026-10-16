import { useLocalSearchParams } from 'expo-router';
import { RoughFiguresScreen } from '@/features/decide/onboarding/RoughFiguresScreen';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function SetupRoughRoute() {
  const params = useLocalSearchParams<{ accountId?: string }>();
  const id = typeof params.accountId === 'string' && UUID.test(params.accountId) ? params.accountId : null;
  return <RoughFiguresScreen accountId={id} />;
}
