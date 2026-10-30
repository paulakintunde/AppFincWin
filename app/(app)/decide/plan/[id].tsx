import { useLocalSearchParams } from 'expo-router';
import { oneParam } from '@/features/navigation/routeParams';
import { PlanRoute } from '@/shell/decide/v3/PlanRoute';

export default function PlanRouteFile() {
  const p = useLocalSearchParams<{ id: string }>();
  return <PlanRoute id={oneParam(p.id)} />;
}
