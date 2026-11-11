import { useLocalSearchParams } from 'expo-router';
import { CheckNotFound } from '@/features/decide/check/CheckFlowScreen';
import { CompareContainer } from '@/features/decide/screens/answer/detail/CompareContainer';
import { isUuid, oneParam } from '@/features/navigation/routeParams';

// T-05-30-01: the id comes from the URL, so it is checked before it reaches the screen.
export default function CompareRoute() {
  const p = useLocalSearchParams<{ id: string }>();
  const id = oneParam(p.id);
  if (!isUuid(id)) return <CheckNotFound />;
  return <CompareContainer id={id} />;
}
