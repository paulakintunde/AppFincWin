import type { Href } from 'expo-router';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { AccountsScreen } from '@/features/record/accounts/AccountsScreen';

export default function AccountsRoute() {
  return <AccountsScreen onOpenAccount={(id) => pushOnce(`/accounts/${id}` as Href)} />;
}
