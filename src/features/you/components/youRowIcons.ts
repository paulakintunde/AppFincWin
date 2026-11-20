/**
 * 06.2-15 (D-06, L04): one icon per You row, from the app's own set (L07). Group headers carry no icon.
 * Only rows that exist on this branch are listed: no Face ID, PIN lock, Alerts or Delete account row yet.
 */
import type { IconName } from '@/ui/icons/iconData';

export type YouRowId =
  | 'expense'
  | 'income'
  | 'transfer'
  | 'importStatement'
  | 'newCheck'
  | 'activity'
  | 'accounts'
  | 'categories'
  | 'history'
  | 'goals'
  | 'household'
  | 'weekStart'
  | 'homeCurrency'
  | 'region'
  | 'accent'
  | 'font'
  | 'haptics'
  | 'analytics'
  | 'connection'
  | 'signOut'
  | 'subscription'
  | 'features'
  | 'freeHelp'
  | 'export';

export const YOU_ROW_ICON: Record<YouRowId, IconName> = {
  expense: 'add',
  income: 'add',
  transfer: 'transfer',
  importStatement: 'import',
  newCheck: 'checkBuy',
  activity: 'view',
  accounts: 'accounts',
  categories: 'categories',
  history: 'history',
  goals: 'savings',
  household: 'household',
  weekStart: 'calendar',
  homeCurrency: 'accounts',
  region: 'view',
  accent: 'accent',
  font: 'font',
  haptics: 'haptics',
  analytics: 'privacy',
  connection: 'connected',
  signOut: 'signOut',
  // 09-15: Subscription, Features, Free help and Export your data (UI-SPEC Navigation and Entry Points).
  subscription: 'acctCard',
  features: 'categories',
  freeHelp: 'headphones',
  export: 'download',
};
