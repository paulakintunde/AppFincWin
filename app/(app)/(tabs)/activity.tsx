import type { Href } from 'expo-router';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { ActivityScreen } from '@/features/record/activity/ActivityScreen';

// The first-account gate lives in the tabs layout (D-38), so this route renders only with an account.
export default function ActivityRoute() {
  return (
    <ActivityScreen
      onOpenAccounts={() => pushOnce('/accounts' as Href)}
      onOpenHistory={() => pushOnce('/history' as Href)}
    />
  );
}
