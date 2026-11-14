import { router, useLocalSearchParams, type Href } from 'expo-router';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { ActivityScreen } from '@/features/record/activity/ActivityScreen';
import { debtParamOf } from '@/features/record/activity/debtFilter';
import { decideBannerOf, monthParamOf } from '@/features/record/activity/monthFilter';

// The first-account gate lives in the tabs layout (D-38), so this route renders only with an account.
// 06-37 (D-38 of phase 6): `?debt=<id>` filters the list to one debt's lines; clearing its chip drops the parameter.
// 06.1-71 (FQ10): `?month=YYYY-MM&why=<code>` opens that month with a banner saying what Decide is missing; Clear drops both.
export default function ActivityRoute() {
  const { debt, month, why } = useLocalSearchParams<{ debt?: string; month?: string; why?: string }>();
  return (
    <ActivityScreen
      onOpenAccounts={() => pushOnce('/accounts' as Href)}
      onOpenHistory={() => pushOnce('/history' as Href)}
      initialMonth={monthParamOf(month) ?? undefined}
      debtId={debtParamOf(debt)}
      onClearDebt={() => router.setParams({ debt: undefined })}
      decideBanner={decideBannerOf(month, why)}
      onClearDecideBanner={() => router.setParams({ month: undefined, why: undefined })}
    />
  );
}
