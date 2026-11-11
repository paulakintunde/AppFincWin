// 06.1-26 (N18): the Save for it route. Thin: the id is checked, then the screen.
import { useLocalSearchParams } from 'expo-router';
import { SaveForItRoute } from '@/shell/decide/ActionRoutes';
import { CheckNotFound } from '@/features/decide/check/CheckFlowScreen';
import { isUuid, oneParam } from '@/features/navigation/routeParams';

export default function SaveForItPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const checkId = oneParam(id);
  if (!isUuid(checkId)) return <CheckNotFound />;
  return <SaveForItRoute id={checkId} />;
}
