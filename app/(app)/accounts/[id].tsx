import { router, useLocalSearchParams } from 'expo-router';
import { AccountDetailScreen } from '@/features/record/accounts/AccountDetailScreen';

export default function AccountDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <AccountDetailScreen
      accountId={id}
      onImport={(accountId) => router.push({ pathname: '/import', params: { entry: 'account', accountId } })}
    />
  );
}
