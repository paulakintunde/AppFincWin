import { useLocalSearchParams } from 'expo-router';
import { V3NotFound } from '@/features/decide/v3/nav/V3NotFound';
import { isUuid, oneParam } from '@/features/navigation/routeParams';
import { InsteadRoute } from '@/shell/decide/v3/InsteadRoute';

// 05.3-29 (T-05.3-29-03): the id comes from the URL or a notification, so it is checked before it reaches the screen.
export default function InsteadRouteFile() {
  const p = useLocalSearchParams<{ id: string }>();
  const id = oneParam(p.id);
  if (!isUuid(id)) return <V3NotFound />;
  return <InsteadRoute id={id} />;
}
