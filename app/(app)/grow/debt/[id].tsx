import { useLocalSearchParams } from 'expo-router';
import { DebtDetailScreen } from '@/features/grow/debts/DebtDetailScreen';

// 06-17 (G06): one debt. Expo Router lists this file-based route itself; app/(app)/_layout.tsx is not touched.
export default function GrowDebtRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DebtDetailScreen id={typeof id === 'string' ? id : ''} />;
}
