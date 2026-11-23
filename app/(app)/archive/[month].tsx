import { Redirect, useLocalSearchParams, type Href } from 'expo-router';
import { ArchivedMonthScreen } from '@/features/archive/ArchivedMonthScreen';
import { MONTH_PARAM } from '@/features/archive/monthLabel';

export default function ArchivedMonthRoute() {
  const { month } = useLocalSearchParams<{ month?: string }>();
  // T-10-24-04: only a real 'YYYY-MM' reaches the screen.
  if (typeof month !== 'string' || !MONTH_PARAM.test(month)) return <Redirect href={'/archive' as Href} />;
  return <ArchivedMonthScreen month={month} />;
}
