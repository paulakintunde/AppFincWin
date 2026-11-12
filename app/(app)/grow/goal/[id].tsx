// 06-22 (G02): the goal detail route. Thin: the id param, then the screen.
import { useLocalSearchParams } from 'expo-router';
import { GoalDetailScreen } from '@/features/grow/goals/GoalDetailScreen';

export default function GoalDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GoalDetailScreen id={id} />;
}
