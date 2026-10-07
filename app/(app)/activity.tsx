import { router } from 'expo-router';
import { ActivityScreen } from '@/features/record/activity/ActivityScreen';

export default function ActivityRoute() {
  return (
    <ActivityScreen
      onOpenAccounts={() => router.push('/accounts')}
      onOpenHistory={() => router.push('/history')}
      onOpenYou={() => router.push('/you')}
    />
  );
}
