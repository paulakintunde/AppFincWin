// 07 D-32, D-33 (WR-03): the name and glyph Insights shows for a category id. Shared lines already carry the viewer's category
// (resolved before the builder, src/data/sharedCategories.ts); what is left is the viewer's own ids, a fellow member's own
// category on a shared line ("Pets (Sam)"), or no category. Pure apart from the translate function it is handed.
import type { TFunction } from 'i18next';
import type { CategoryRow } from '@/db/rows';
import { categoryIdsFor, type CategorySourceIds, type PartnerCategoryRef } from '@/data/sharedCategories';
import { categoryName } from '@/features/record/categoryName';

export interface CategoryNaming {
  partners: ReadonlyMap<string, PartnerCategoryRef>;
  sourceIds: CategorySourceIds | undefined;
  /** Who a partner category belongs to, as the viewer sees them; '' when unknown. */
  partnerName(ownerId: string): string;
}

export const NO_NAMING: CategoryNaming = { partners: new Map(), sourceIds: undefined, partnerName: () => '' };

export interface ShownCategory {
  name: string;
  /** What the glyph draws from; null draws nothing (no category). */
  glyph: { color_key: string | null; builtin_key: string | null; icon_key: string | null } | null;
}

export function shownCategory(id: string | null, own: ReadonlyMap<string, CategoryRow>, naming: CategoryNaming, t: TFunction): ShownCategory {
  const none: ShownCategory = { name: t('insights.categories.uncategorised'), glyph: null };
  if (id === null) return none;
  const mine = own.get(id);
  if (mine !== undefined) return { name: categoryName(mine, t) || none.name, glyph: { color_key: mine.color_key, builtin_key: mine.builtin_key, icon_key: mine.icon_key ?? null } };
  const p = naming.partners.get(id);
  if (p === undefined) return none;
  const base = categoryName({ name: p.name, builtin_key: p.builtin_key as CategoryRow['builtin_key'] }, t) || none.name;
  const who = naming.partnerName(p.owner_id);
  return {
    name: who === '' ? base : t('insights.categories.partnerCategory', { name: base, partner: who }),
    glyph: { color_key: p.color_key, builtin_key: p.builtin_key, icon_key: p.icon_key },
  };
}

/** Every stored category id an Insights row stands for, so a tap opens Activity on all of them. */
export function filterIdsOf(id: string | null, naming: CategoryNaming): (string | null)[] {
  return categoryIdsFor(id, naming.sourceIds);
}
