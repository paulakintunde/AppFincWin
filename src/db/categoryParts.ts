// 10.1-11 (D-01..D-04, SPL-01): a line's category parts as stored (transactions.category_parts) and the version-checked write.
// The server owns every rule (the guard trigger and set_category_parts re-check the parts with the engine's rules); these
// wrappers carry the call and hand its answer back untouched. A refusal comes back as { ok: false, reason, ... }; only a
// missing session or a transport failure throws (through toDbError).

import type { Part } from '@/engine/parts';
import { callRpc, type RpcResult } from './householdMembers';
import type { DbClient } from './rows';

/** One part as stored: category id (null = Uncategorised), signed integer minor units, optional label. */
export interface StoredPart {
  c: string | null;
  a: number;
  l?: 'taxTip' | null;
}

/** What transactions.item_split holds (written only by set_split_by_item, 10.1-14). */
export interface StoredItemSplit {
  store: string | null;
  date: string | null;
  items: { name: string; price: number; discount: number; c: string | null; people: string[] }[];
  extras: { tax: number; tip: number; discounts: number };
  by: string | null;
  at: string | null;
}

export function toParts(raw: readonly StoredPart[] | null): Part[] | null {
  if (raw === null || raw === undefined) return null;
  return raw.map((p) => ({ categoryId: p.c, amount: p.a, label: p.l ?? null }));
}

export function fromParts(parts: readonly Part[]): StoredPart[] {
  return parts.map((p) => {
    const out: StoredPart = { c: p.categoryId, a: p.amount };
    if (p.label) out.l = p.label;
    return out;
  });
}

export interface SetCategoryPartsArgs {
  id: string;
  expectedVersion: number;
  /** Null removes the split; `keepAs` then names the category the line keeps. */
  parts: readonly Part[] | null;
  keepAs?: string | null;
}

/** What `set_category_parts` hands back so the caller can build Undo. */
export interface PartsSnapshot {
  parts: StoredPart[] | null;
  category_id: string | null;
}

/**
 * Success returns `before` (a PartsSnapshot, for Undo) and the new version. Any member who can see the line may call it.
 * Refusals: not_found, version_conflict (current_version, updated_by), line_locked, category_not_owned, parts_invalid (detail:
 * bad_shape, too_few, too_many, not_integer, zero_part, over_total, mixed_sign, not_total), transfer_part_on_transfer_line.
 */
export function setCategoryParts(
  client: DbClient,
  a: SetCategoryPartsArgs
): Promise<RpcResult<{ before?: PartsSnapshot; version?: number }>> {
  return callRpc<{ before?: PartsSnapshot; version?: number }>(client, 'set_category_parts', {
    p_id: a.id,
    p_expected_version: a.expectedVersion,
    p_parts: a.parts === null ? null : fromParts(a.parts),
    p_keep_as: a.keepAs ?? null,
  });
}
