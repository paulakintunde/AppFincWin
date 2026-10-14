import { router } from 'expo-router';
import { ActivityScreen } from '@/features/record/activity/ActivityScreen';

// The first-account gate lives in the tabs layout (D-38), so this route renders only with an account.
export default function ActivityRoute() {
  return (
    <ActivityScreen
      onOpenAccounts={() => router.push('/accounts')}
      onOpenHistory={() => router.push('/history')}
    />
  );
}
