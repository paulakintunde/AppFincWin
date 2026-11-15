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
  | 'weekStart'
  | 'homeCurrency'
  | 'region'
  | 'accent'
  | 'font'
  | 'haptics'
  | 'analytics'
  | 'connection'
  | 'signOut';

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
  weekStart: 'calendar',
  homeCurrency: 'accounts',
  region: 'view',
  accent: 'accent',
  font: 'font',
  haptics: 'haptics',
  analytics: 'privacy',
  connection: 'connected',
  signOut: 'signOut',
};
