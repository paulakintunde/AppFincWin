import { useLocalSearchParams } from 'expo-router';
import { DebtExtraCalculator } from '@/features/grow/calculators/record/DebtExtraCalculator';

// 06-19 (D-18): thin route. The debt id comes from the link on debt detail or the Calculators page.
export default function DebtExtraCalculatorRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DebtExtraCalculator id={String(id)} />;
}
