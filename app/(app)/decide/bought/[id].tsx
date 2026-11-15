// 06.1-26 (N19): the I bought it route. Thin: the id is checked, then the screen.
import { useLocalSearchParams } from 'expo-router';
import { BoughtRoute } from '@/shell/decide/ActionRoutes';
import { CheckNotFound } from '@/features/decide/screens/ui/CheckNotFound';
import { isUuid, oneParam } from '@/features/navigation/routeParams';

export default function BoughtPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const checkId = oneParam(id);
  if (!isUuid(checkId)) return <CheckNotFound />;
  return <BoughtRoute id={checkId} />;
}
