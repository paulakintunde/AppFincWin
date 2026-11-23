import { useLocalSearchParams } from 'expo-router';
import { ExportScreen } from '@/features/export/ExportScreen';
import { parseMonthsParam } from '@/features/export/parseMonthsParam';

export default function ExportRoute() {
  const { months } = useLocalSearchParams<{ months?: string }>();
  const parsed = parseMonthsParam(months);
  return parsed ? <ExportScreen months={parsed} /> : <ExportScreen />;
}
