import { useLocalSearchParams } from 'expo-router';
import { V3NotFound } from '@/features/decide/v3/nav/V3NotFound';
import { isUuid, oneParam } from '@/features/navigation/routeParams';
import { HelpRoute } from '@/shell/decide/v3/HelpRoute';

// 05.3-31: "Help me check this". The id comes from the URL, so it is checked before it reaches the screen (T-05-30-01).
export default function HelpRouteScreen() {
  const p = useLocalSearchParams<{ id: string }>();
  const id = oneParam(p.id);
  if (!isUuid(id)) return <V3NotFound />;
  return <HelpRoute id={id} />;
}
