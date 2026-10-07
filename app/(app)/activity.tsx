import { Redirect, router } from 'expo-router';
import { useAccounts } from '@/data/queries/accounts';
import { ActivityScreen } from '@/features/record/activity/ActivityScreen';
import { needsFirstAccount } from '@/features/record/setup/firstAccountGate';
import { useRecordContext } from '@/features/record/useRecordContext';

export default function ActivityRoute() {
  const rc = useRecordContext();
  const accounts = useAccounts(rc.householdId ?? undefined);
  // D-22: no active account yet -> create the first one before anything else. Waits for the
  // context and the read, and never fires on a read error (T-02-30-02).
  const gate = needsFirstAccount({
    loading: !rc.ready || accounts.isLoading,
    isError: accounts.isError,
    accounts: accounts.data,
  });
  if (gate) return <Redirect href="/setup/account" />;
  return (
    <ActivityScreen
      onOpenAccounts={() => router.push('/accounts')}
      onOpenHistory={() => router.push('/history')}
      onOpenYou={() => router.push('/you')}
    />
  );
}
