import { router, useLocalSearchParams } from 'expo-router';
import { AccountDetailScreen } from '@/features/record/accounts/AccountDetailScreen';

export default function AccountDetailRoute() {
  const { id, edit } = useLocalSearchParams<{ id: string; edit?: string }>();
  return (
    <AccountDetailScreen
      accountId={id}
      openEditor={edit === '1'}
      onImport={(accountId) => router.push({ pathname: '/import', params: { entry: 'account', accountId } })}
    />
  );
}
