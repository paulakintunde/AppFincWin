import { useLocalSearchParams } from 'expo-router';
import { CompoundCalculator } from '@/features/grow/calculators/typed/CompoundCalculator';

// 06-18 links here with ?start=&rate=&monthly= to open the growth calculator prefilled; the component checks each one.
export default function GrowthCalculatorRoute() {
  const { start, rate, monthly } = useLocalSearchParams<{ start?: string; rate?: string; monthly?: string }>();
  return <CompoundCalculator start={start} rate={rate} monthly={monthly} />;
}
