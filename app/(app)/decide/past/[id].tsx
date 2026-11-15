import { useLocalSearchParams } from 'expo-router';
import { DecisionDetailScreen } from '@/features/decide/screens/past/DecisionDetailScreen';
import { uuidParam } from '@/features/navigation/routeParams';
import { GoalTagEditProvider } from '@/shell/decide/GoalTagEditProvider';

// The id comes from the URL, so it is checked before it reaches the screen; anything else reads as "not here".
export default function DecisionDetailRoute() {
  const p = useLocalSearchParams<{ id: string }>();
  return (
    <GoalTagEditProvider>
      <DecisionDetailScreen id={uuidParam(p.id)} />
    </GoalTagEditProvider>
  );
}
