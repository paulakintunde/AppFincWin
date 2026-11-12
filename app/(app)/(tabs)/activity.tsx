import { router, useLocalSearchParams, type Href } from 'expo-router';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { ActivityScreen } from '@/features/record/activity/ActivityScreen';
import { debtParamOf } from '@/features/record/activity/debtFilter';

// The first-account gate lives in the tabs layout (D-38), so this route renders only with an account.
// 06-37 (D-38 of phase 6): `?debt=<id>` filters the list to one debt's lines; clearing its chip drops the parameter.
export default function ActivityRoute() {
  const { debt } = useLocalSearchParams<{ debt?: string }>();
  return (
    <ActivityScreen
      onOpenAccounts={() => pushOnce('/accounts' as Href)}
      onOpenHistory={() => pushOnce('/history' as Href)}
      debtId={debtParamOf(debt)}
      onClearDebt={() => router.setParams({ debt: undefined })}
    />
  );
}
