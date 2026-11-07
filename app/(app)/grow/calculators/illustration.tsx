import { useLocalSearchParams } from 'expo-router';
import { GrowthIllustration } from '@/features/grow/calculators/record/GrowthIllustration';

// 06-19 (D-19): thin route. The investing screens link here with ?start=&rate=&monthly= (minor-unit digits and percent text);
// the component checks each one.
export default function GrowthIllustrationRoute() {
  const { start, rate, monthly } = useLocalSearchParams<{ start?: string; rate?: string; monthly?: string }>();
  return <GrowthIllustration start={start} rate={rate} monthly={monthly} />;
}
