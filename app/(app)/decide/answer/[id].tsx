import { useLocalSearchParams } from 'expo-router';
import { V3NotFound } from '@/features/decide/v3/nav/V3NotFound';
import { isUuid, oneParam } from '@/features/navigation/routeParams';
import { AnswerRoute } from '@/shell/decide/v3/AnswerRoute';

// T-05.3-41-01: the id comes from the URL, a deep link or a notification, so it is checked before it reaches the screen.
export default function AnswerRouteScreen() {
  const p = useLocalSearchParams<{ id: string }>();
  const id = oneParam(p.id);
  if (!isUuid(id)) return <V3NotFound />;
  return <AnswerRoute id={id} />;
}
