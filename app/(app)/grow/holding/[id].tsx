import { useLocalSearchParams } from 'expo-router';
import { HoldingDetailScreen } from '@/features/grow/investing/HoldingDetailScreen';

// 06-18 (G09): one holding. The route registers itself; app/(app)/_layout.tsx is not edited.
export default function HoldingRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <HoldingDetailScreen id={String(id)} />;
}
