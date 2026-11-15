import { useLocalSearchParams } from 'expo-router';
import { QuickEstimatesRoute } from '@/shell/decide/QuickEstimatesRoute';

export default function QuickEstimatesPage() {
  const p = useLocalSearchParams<{ returnTo?: string }>();
  return <QuickEstimatesRoute returnTo={p.returnTo} />;
}
