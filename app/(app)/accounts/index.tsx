import { router } from 'expo-router';
import { AccountsScreen } from '@/features/record/accounts/AccountsScreen';

export default function AccountsRoute() {
  return <AccountsScreen onOpenAccount={(id) => router.push(`/accounts/${id}`)} />;
}
