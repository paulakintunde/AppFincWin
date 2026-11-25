// 07 D-32, D-33, D-34 (WR-03): which category a shared line counts under for the viewer. Pure (no supabase, no React), so
// Insights and Decide's data layer read shared lines the same way and it is unit-tested on its own.
//
// Order (D-33): the viewer's own pick on that line (transaction_member_categories), then the viewer's own category with the
// same builtin_key as the partner's, then the partner's category itself. A partner category that stays is named
// "<name> (<partner>)" on screen (D-32); its money rule (monthly_cap) is never read (the RPC does not return it).

import type { StoredPart } from '@/db/rows';

export interface OwnCategoryRef {
  id: string;
  builtin_key: string | null;
}

export interface PartnerCategoryRef {
  id: string;
  owner_id: string;
  builtin_key: string | null;
  name: string | null;
  color_key: string | null;
  icon_key: string | null;
}

export interface LinePickRef {
  transaction_id: string;
  category_id: string;
}

export interface SharedCategoryResolution {
  /** A shared line's category for the viewer. */
  line(lineId: string, categoryId: string | null): string | null;
  /** A shared series' category for the viewer (no per-member pick exists for a series). */
  category(categoryId: string | null): string | null;
  /** Partner categories by id, as the RPC returned them. */
  partners: ReadonlyMap<string, PartnerCategoryRef>;
}

export function sharedCategoryResolution(
  own: readonly OwnCategoryRef[],
  partners: readonly PartnerCategoryRef[],
  picks: readonly LinePickRef[]
): SharedCategoryResolution {
  const ownIds = new Set(own.map((c) => c.id));
  const ownByBuiltin = new Map<string, string>();
  for (const c of own) if (c.builtin_key !== null && !ownByBuiltin.has(c.builtin_key)) ownByBuiltin.set(c.builtin_key, c.id);
  const partnerById = new Map(partners.filter((p) => !ownIds.has(p.id)).map((p) => [p.id, p] as const));
  const pickByLine = new Map(picks.map((p) => [p.transaction_id, p.category_id] as const));

  const category = (categoryId: string | null): string | null => {
    if (categoryId === null || ownIds.has(categoryId)) return categoryId;
    const p = partnerById.get(categoryId);
    if (p === undefined || p.builtin_key === null) return categoryId;
    return ownByBuiltin.get(p.builtin_key) ?? categoryId;
  };
  return {
    line: (lineId, categoryId) => pickByLine.get(lineId) ?? category(categoryId),
    category,
    partners: partnerById,
  };
}

type CategorisedRow = { id: string; category_id: string | null; is_shared?: boolean | null; category_parts?: readonly StoredPart[] | null };
type CategorisedSeries = { category_id: string | null };

/** Resolved category id → every stored category id that now counts under it (more than itself only). */
export type CategorySourceIds = Readonly<Record<string, readonly string[]>>;

function addSource(out: Map<string, Set<string>>, resolved: string, original: string | null): void {
  const set = out.get(resolved) ?? new Set<string>([resolved]);
  if (original !== null) set.add(original);
  out.set(resolved, set);
}

/**
 * Shared lines with the viewer's category, plus which stored ids each resolved id gathers (so a tap that opens Activity can
 * name every one). A list with nothing to change comes back as the same array, and an unchanged row as the same object.
 */
export function resolveSharedRows<R extends CategorisedRow>(
  rows: readonly R[],
  res: SharedCategoryResolution,
  sources?: Map<string, Set<string>>
): readonly R[] {
  let changed = false;
  const out = rows.map((r) => {
    if (r.is_shared !== true) return r;
    // 10.1-16: member overrides apply to unsplit shared lines; split lines show each part by builtin match (07 D-31..D-34).
    if (r.category_parts != null && r.category_parts.length >= 2) {
      const nextParts = r.category_parts.map((part) => ({ ...part, c: res.category(part.c) }));
      const nextCategory = res.category(r.category_id);
      const partsChanged = nextParts.some((part, i) => part.c !== (r.category_parts as readonly StoredPart[])[i]!.c);
      if (!partsChanged && nextCategory === r.category_id) return r;
      changed = true;
      if (sources !== undefined) {
        r.category_parts.forEach((part, i) => {
          const to = nextParts[i]!.c;
          if (to !== null && to !== part.c) addSource(sources, to, part.c);
        });
        if (nextCategory !== null && nextCategory !== r.category_id) addSource(sources, nextCategory, r.category_id);
      }
      return { ...r, category_id: nextCategory, category_parts: nextParts };
    }
    const next = res.line(r.id, r.category_id);
    if (next === r.category_id) return r;
    changed = true;
    if (next !== null && sources !== undefined) addSource(sources, next, r.category_id);
    return { ...r, category_id: next };
  });
  return changed ? out : rows;
}

/**
 * Series with the viewer's category (builtin match only; no per-member pick exists for a series). The series read carries no
 * is_shared column, so every series is passed through: only a partner category the RPC returned (one on a shared line or
 * series) ever changes, and the viewer's own ids never do. Same array back when nothing changes.
 */
export function resolveSharedSeries<S extends CategorisedSeries>(series: readonly S[], res: SharedCategoryResolution): readonly S[] {
  let changed = false;
  const out = series.map((s) => {
    const next = res.category(s.category_id);
    if (next === s.category_id) return s;
    changed = true;
    return { ...s, category_id: next };
  });
  return changed ? out : series;
}

export function sourceIdsOf(sources: ReadonlyMap<string, ReadonlySet<string>>): CategorySourceIds {
  const out: Record<string, readonly string[]> = {};
  for (const [id, set] of sources) if (set.size > 1) out[id] = [...set];
  return out;
}

export interface SharedCategoryParts<R extends CategorisedRow, S extends CategorisedSeries> {
  rows: readonly R[];
  upcomingRows: readonly R[];
  series: readonly S[];
  /** category id → builtin_key, the viewer's own. */
  categories: Readonly<Record<string, string | null>>;
}

/**
 * D-34: Decide's (and so Insights') reads with shared lines under the viewer's category. A partner category that stays is added
 * to the id → builtin_key map (a partner's shared Savings line with no own Savings to match still reads as saving); it gets no
 * money rule. Unchanged parts come back as the same objects.
 */
export function applySharedCategories<R extends CategorisedRow, S extends CategorisedSeries>(
  parts: SharedCategoryParts<R, S>,
  res: SharedCategoryResolution
): SharedCategoryParts<R, S> & { partnerCategories: readonly PartnerCategoryRef[]; categorySourceIds: CategorySourceIds } {
  const sources = new Map<string, Set<string>>();
  const rows = resolveSharedRows(parts.rows, res, sources);
  const upcomingRows = resolveSharedRows(parts.upcomingRows, res, sources);
  const series = resolveSharedSeries(parts.series, res);
  const partnerCategories = [...res.partners.values()];
  const missing = partnerCategories.filter((p) => parts.categories[p.id] === undefined);
  const categories = missing.length === 0 ? parts.categories : { ...parts.categories, ...Object.fromEntries(missing.map((p) => [p.id, p.builtin_key])) };
  return { rows, upcomingRows, series, categories, partnerCategories, categorySourceIds: sourceIdsOf(sources) };
}

/** Every stored category id a resolved id stands for (itself first). */
export function categoryIdsFor(id: string | null, sources: CategorySourceIds | undefined): (string | null)[] {
  if (id === null) return [null];
  return [...(sources?.[id] ?? [id])];
}
