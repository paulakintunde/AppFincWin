import { useLocalSearchParams } from 'expo-router';
import { V3NotFound } from '@/features/decide/v3/nav/V3NotFound';
import { isUuid, oneParam } from '@/features/navigation/routeParams';
import { PurchaseRoute } from '@/shell/decide/v3/PurchaseRoute';

// T-05.3-24-01: the id and focus come from the URL or a deep link, so each is checked before it reaches the screen.
export default function PurchaseRouteScreen() {
  const p = useLocalSearchParams<{ id: string; focus?: string }>();
  const id = oneParam(p.id);
  if (!isUuid(id)) return <V3NotFound />;
  const focus = oneParam(p.focus) === 'price' ? 'price' : null;
  return <PurchaseRoute id={id} focus={focus} />;
}
