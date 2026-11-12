import { useLocalSearchParams } from 'expo-router';
import { GoalCalculator } from '@/features/grow/calculators/record/GoalCalculator';

// 06-19 (D-17): thin route. The goal id comes from the link on goal detail or the Calculators page.
export default function GoalCalculatorRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GoalCalculator id={String(id)} />;
}
