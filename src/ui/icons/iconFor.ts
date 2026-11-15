/**
 * 06.2 D-03 / D-07: which icon a category or an account type shows.
 *
 * iconForCategory takes the category row shape directly: a built-in category maps by its seed key; a custom one uses
 * its picked `icon_key` when that names an icon in our set. Anything else returns null, and the caller shows the
 * first-letter fallback (IconTile with icon={null}).
 */
import type { AccountRow } from '@/db/rows';
import { ICONS, type IconName } from './iconData';

const BY_BUILTIN_KEY: Readonly<Record<string, IconName>> = {
  Housing: 'housing',
  Utilities: 'utilities',
  Groceries: 'groceries',
  Transport: 'transport',
  Insurance: 'insurance',
  Health: 'health',
  Subscriptions: 'subscriptions',
  Debt: 'debt',
  Savings: 'savings',
  Business: 'business',
  Tax: 'tax',
  Dining: 'dining',
  Income: 'income',
  Transfer: 'transfer',
  Settlement: 'settlement',
};

const isIconName = (key: string): key is IconName => Object.prototype.hasOwnProperty.call(ICONS, key);

export function iconForCategory(
  c: { builtin_key?: string | null; icon_key?: string | null } | null | undefined,
): IconName | null {
  if (c == null) return null;
  if (c.builtin_key != null && Object.prototype.hasOwnProperty.call(BY_BUILTIN_KEY, c.builtin_key)) {
    return BY_BUILTIN_KEY[c.builtin_key] ?? null;
  }
  if (c.icon_key != null && isIconName(c.icon_key)) return c.icon_key;
  return null;
}

const BY_ACCOUNT_KIND: Readonly<Record<AccountRow['kind'], IconName>> = {
  checking: 'acctCurrent',
  savings: 'acctSavings',
  credit: 'acctCard',
  cash: 'acctCash',
  loan: 'acctLoan',
  investment: 'acctInvestment',
  other: 'acctOther',
};

export function iconForAccountKind(kind: AccountRow['kind']): IconName {
  return BY_ACCOUNT_KIND[kind] ?? 'acctOther';
}

/** The icons a custom category may pick (D-07: our own set, never emoji). Categories first, then fitting actions; no state shapes. */
export const CUSTOM_CATEGORY_ICONS: readonly IconName[] = [
  'housing',
  'utilities',
  'groceries',
  'transport',
  'insurance',
  'health',
  'subscriptions',
  'debt',
  'savings',
  'business',
  'tax',
  'dining',
  'income',
  'settlement',
  'transfer',
  'acctPension',
  'acctInvestment',
  'acctCash',
  'acctCard',
  'payBills',
  'household',
  'calendar',
  'alerts',
  'profile',
  'headphones',
  'laptop',
  'camera',
];
