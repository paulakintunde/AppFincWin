import { useRecordLinks } from '@/features/grow/calculators/record/useRecordLinks';
import { CalculatorsScreen } from '@/features/grow/calculators/typed/CalculatorsScreen';

// 06-19: "With your records" links appear only for records that exist (first goal with a target, first debt with a rate, investing).
export default function CalculatorsRoute() {
  const recordLinks = useRecordLinks();
  return <CalculatorsScreen recordLinks={recordLinks} />;
}
