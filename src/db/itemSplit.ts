// 10.1-26 (SCN-06, SCN-07; D-14..D-17): split a shared line by its receipt items. The server owns the maths
// (the split-by-item RPC recomputes every share from the items, people and extras; client shares are never sent, T-10.1-26-01),
// and keeps the line's split, parts and item list as they were so Undo can put them back through restore_line_split.
// A refusal comes back as { ok: false, reason, ... }; only a missing session or a transport failure throws.
import type { Part } from '@/engine/parts';
import { fromParts } from './categoryParts';
import { callRpc, type RpcResult } from './householdMembers';
import type { DbClient, StoredItemSplit, StoredPart } from './rows';
import type { SplitRule, SplitSnapshot } from './transactionSplits';

/** One receipt item as sent: price and discount in positive minor units, `c` its category, `people` who shares it. */
export interface ItemSplitItem {
  name: string;
  price: number;
  discount: number;
  c: string | null;
  people: string[];
}

export interface ItemSplitExtras {
  tax: number;
  tip: number;
  discounts: number;
}

/** What the split-by-item RPC hands back for Undo: the line's split, rule, hand-set flag, parts, category and item list. */
export interface ItemSplitBefore {
  split: SplitSnapshot;
  rule: SplitRule | null;
  manual: boolean;
  parts: StoredPart[] | null;
  category_id: string | null;
  item_split: StoredItemSplit | null;
}

export interface SetSplitByItemArgs {
  id: string;
  expectedVersion: number;
  items: readonly ItemSplitItem[];
  extras: ItemSplitExtras;
  /** The line's category parts (signed, as the line); null when the items come to one category. */
  parts: readonly Part[] | null;
  /** With null parts: the line's category. Null keeps the one it has. */
  category?: string | null;
  store?: string | null;
  date?: string | null;
}

export interface SetSplitByItemOk {
  before?: ItemSplitBefore;
  version?: number;
  /** Each person's total on the line (the server's own figures). */
  shares?: Record<string, number>;
}

/**
 * Refusals: not_found, not_shared, version_conflict (current_version, updated_by), line_locked, items_invalid (detail),
 * items_not_total (diff), no_items, parts_invalid (detail), category_not_owned, rate_unavailable,
 * transfer_part_on_transfer_line.
 */
export function setSplitByItem(client: DbClient, a: SetSplitByItemArgs): Promise<RpcResult<SetSplitByItemOk>> {
  return callRpc<SetSplitByItemOk>(client, 'set_split_by_item', {
    p_id: a.id,
    p_expected_version: a.expectedVersion,
    p_items: a.items.map((i) => ({ name: i.name, price: i.price, discount: i.discount, c: i.c, people: [...i.people] })),
    p_extras: { tax: a.extras.tax, tip: a.extras.tip, discounts: a.extras.discounts },
    p_parts: a.parts === null ? null : fromParts(a.parts),
    p_category: a.category ?? null,
    p_store: a.store ?? null,
    p_date: a.date ?? null,
  });
}

/** Refusals: not_found, not_shared, version_conflict, line_locked, before_invalid, parts_invalid, category_not_owned. */
export function restoreLineSplit(
  client: DbClient,
  id: string,
  expectedVersion: number,
  before: ItemSplitBefore
): Promise<RpcResult<{ version?: number }>> {
  return callRpc<{ version?: number }>(client, 'restore_line_split', {
    p_id: id,
    p_expected_version: expectedVersion,
    p_before: before,
  });
}
