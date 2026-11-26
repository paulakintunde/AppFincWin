/**
 * 06.2-15 (D-06, L04): one icon per You row, from the app's own set (L07). Group headers carry no icon.
 * Only rows that exist on this branch are listed: Phase 10 adds security, alerts, archive, importCsv and diagnostic.
 */
import type { IconName } from '@/ui/icons/iconData';

export type YouRowId =
  | 'expense'
  | 'scanReceipt'
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
  | 'export'
  | 'security'
  | 'alerts'
  | 'archive'
  | 'importCsv'
  | 'diagnostic';

export const YOU_ROW_ICON: Record<YouRowId, IconName> = {
  expense: 'add',
  scanReceipt: 'scan', // 10.1-25
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
  // 10-04: Phase 10 rows (UI-SPEC Navigation and Entry Points).
  security: 'pinLock',
  alerts: 'alerts',
  archive: 'history',
  importCsv: 'import',
  diagnostic: 'info',
};
