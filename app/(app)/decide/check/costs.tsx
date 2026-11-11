import { useLocalSearchParams } from 'expo-router';
import { CostsStep } from '@/features/decide/screens/check/CostsStep';
import { CheckNotFound } from '@/features/decide/check/CheckFlowScreen';
import { isUuid, oneParam } from '@/features/navigation/routeParams';

// 06.1-19 (D-09): a static route, so it wins over check/[id]. The id comes from the URL, so it is checked before it reaches the screen.
export default function CostsStepRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const checkId = oneParam(id);
  if (!isUuid(checkId)) return <CheckNotFound />;
  return <CostsStep id={checkId} />;
}
