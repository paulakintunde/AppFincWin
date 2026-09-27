/**
 * The built-in category seed (D-34) and its colour pairs (D-35). This is the
 * single definition every consumer mirrors: plan 02-07's SQL seed, plan
 * 02-10's `categorySwatch` theme map, and the category guesser (plan 02-04).
 *
 * D-34: the prototype's Component.COL seed (FincWin United.dc.html line 3217). Tax is a plain label for
 * money already paid; it must never gain tax-specific behaviour (no flag, totals, reports or estimates).
 */
export const BUILTIN_CATEGORY_KEYS = [
  'Housing',
  'Utilities',
  'Groceries',
  'Transport',
  'Insurance',
  'Health',
  'Subscriptions',
  'Debt',
  'Savings',
  'Business',
  'Tax',
  'Dining',
  'Income',
] as const;

// System-owned, never editable -- the engine relies on these two existing.
export const SYSTEM_CATEGORY_KEYS = ['Transfer', 'Settlement'] as const;

export type BuiltinCategoryKey = (typeof BUILTIN_CATEGORY_KEYS)[number];
export type SystemCategoryKey = (typeof SYSTEM_CATEGORY_KEYS)[number];
export type SeedCategoryKey = BuiltinCategoryKey | SystemCategoryKey;

// D-35: the prototype's existing category swatch pairs (colour plus tint), 7 distinct pairs.
export const CATEGORY_COLOR_KEYS = ['green', 'slate', 'teal', 'blue', 'plum', 'rust', 'ochre'] as const;

export type CategoryColorKey = (typeof CATEGORY_COLOR_KEYS)[number];

export const BUILTIN_COLOR_KEY: Readonly<Record<SeedCategoryKey, CategoryColorKey>> = {
  Housing: 'green',
  Utilities: 'slate',
  Groceries: 'teal',
  Transport: 'slate',
  Insurance: 'blue',
  Health: 'teal',
  Subscriptions: 'plum',
  Debt: 'rust',
  Savings: 'green',
  Business: 'ochre',
  Tax: 'rust',
  Dining: 'ochre',
  Income: 'green',
  Transfer: 'slate',
  Settlement: 'slate',
};

export function isCategoryColorKey(s: string): s is CategoryColorKey {
  return (CATEGORY_COLOR_KEYS as readonly string[]).includes(s);
}
