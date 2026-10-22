import { useLocalSearchParams } from 'expo-router';
import { uuidParam } from '@/features/navigation/routeParams';
import { RoughFiguresScreen } from '@/features/decide/onboarding/RoughFiguresScreen';

export default function SetupRoughRoute() {
  const params = useLocalSearchParams<{ accountId?: string | string[] }>();
  // IN-D04: the same id check and array-param rule as every other route
  const id = uuidParam(params.accountId);
  return <RoughFiguresScreen accountId={id} />;
}
