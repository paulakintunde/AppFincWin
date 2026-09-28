// D-34: a category renamed by the user shows that name; a still-default built-in or system
// category renders from its i18n key until the user renames it.
import type { TFunction } from 'i18next';
import type { CategoryRow } from '@/db/rows';

export function categoryName(row: Pick<CategoryRow, 'builtin_key' | 'name'>, t: TFunction): string {
  if (row.name !== null) return row.name;
  const builtinKey = row.builtin_key;
  if (builtinKey === null) return '';
  return t(`categories.builtin.${builtinKey}`);
}
