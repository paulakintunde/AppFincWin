// 08-15 (HH-04, HH-05, HH-06): stored splits, the household's split defaults, a member's own category on a shared line,
// and the wrappers for every 08-10 RPC. The server owns every rule (creator-only sharing, version checks, line locks,
// the largest-remainder split); these wrappers carry the call and hand its answer back untouched. A refusal comes back
// as { ok: false, reason, ... }; only a missing session or a transport failure throws (through toDbError).

import { toDbError } from './errors';
import { callRpc, type RpcResult } from './householdMembers';
import type { DbClient } from './rows';

export type SplitRule = 'even' | 'weight' | 'amount' | 'mine';

export const SPLIT_COLUMNS = 'transaction_id, member_id, former_member_key, position, share';
export const SPLIT_DEFAULT_COLUMNS = 'id, household_id, category_ref, rule, version, updated_by, created_at, updated_at';
export const MEMBER_CATEGORY_COLUMNS = 'transaction_id, user_id, household_id, category_id';

// What a balance or a pair sheet needs from a shared line, and no more.
export const SHARED_LINE_COLUMNS =
  'id, household_id, account_id, created_by, paid_by, paid_by_former_key, household_amount, household_currency, original_amount, original_currency, local_date, name, note, category_id, split_rule, split_manual, status, version';

/** One member's stored share of one line. `share` is signed like the line (an expense is negative). */
export interface SplitRow {
  transaction_id: string;
  /** Null once the member's account was deleted; `former_member_key` then names them (D-29). */
  member_id: string | null;
  former_member_key: string | null;
  position: number;
  share: number;
}

export interface SplitDefaultRow {
  id: string;
  household_id: string;
  /** Null is the household default; otherwise 'builtin:<key>' or 'custom:<category id>'. */
  category_ref: string | null;
  rule: 'even' | 'weight' | 'mine';
  version: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemberLineCategoryRow {
  transaction_id: string;
  user_id: string;
  household_id: string;
  category_id: string;
}

/** A shared line as the balances read it (see SHARED_LINE_COLUMNS). */
export interface SharedLineRow {
  id: string;
  household_id: string;
  account_id: string;
  created_by: string | null;
  paid_by: string | null;
  paid_by_former_key: string | null;
  household_amount: number | null;
  household_currency: string | null;
  original_amount: number;
  original_currency: string;
  local_date: string;
  name: string | null;
  note: string | null;
  category_id: string | null;
  split_rule: SplitRule | null;
  split_manual: boolean;
  status: 'pending' | 'paid' | 'skipped';
  version: number;
}

/** Rows per `in (...)` request: keeps the URL short for a household with a long history. */
const IN_CHUNK = 100;
/** Matches PostgREST's hosted max_rows; pages are read until one comes back short. */
const PAGE_SIZE = 1000;

function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += IN_CHUNK) out.push(items.slice(i, i + IN_CHUNK));
  return out;
}

export async function fetchSplitsForLines(client: DbClient, lineIds: readonly string[]): Promise<SplitRow[]> {
  const rows: SplitRow[] = [];
  for (const ids of chunks(lineIds)) {
    const { data, error, status } = await client.from('transaction_splits').select(SPLIT_COLUMNS).in('transaction_id', ids);
    if (error) throw toDbError(error, status);
    rows.push(...((data as SplitRow[] | null) ?? []));
  }
  return rows;
}

export async function fetchSplitDefaults(client: DbClient, householdId: string): Promise<SplitDefaultRow[]> {
  const { data, error, status } = await client.from('household_split_defaults').select(SPLIT_DEFAULT_COLUMNS).eq('household_id', householdId);
  if (error) throw toDbError(error, status);
  return (data as SplitDefaultRow[] | null) ?? [];
}

/**
 * Every live shared line of the household that is not a settle-up record (a settlement record is never split, D-22), oldest
 * first. RLS decides which lines the caller can see. Whether a settle-up already covers a line is read separately
 * (fetchLiveSettlementLines): this read does not guess.
 */
export async function fetchOpenSharedLines(client: DbClient, householdId: string): Promise<SharedLineRow[]> {
  const rows: SharedLineRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error, status } = await client
      .from('transactions_active')
      .select(SHARED_LINE_COLUMNS)
      .eq('household_id', householdId)
      .eq('is_shared', true)
      .eq('is_settlement', false)
      .order('local_date', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw toDbError(error, status);
    const page = (data as SharedLineRow[] | null) ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

/** The caller's own category on shared lines (their own rows only, RLS). */
export async function fetchMyLineCategories(client: DbClient, userId: string, lineIds: readonly string[]): Promise<MemberLineCategoryRow[]> {
  const rows: MemberLineCategoryRow[] = [];
  for (const ids of chunks(lineIds)) {
    const { data, error, status } = await client
      .from('transaction_member_categories')
      .select(MEMBER_CATEGORY_COLUMNS)
      .eq('user_id', userId)
      .in('transaction_id', ids);
    if (error) throw toDbError(error, status);
    rows.push(...((data as MemberLineCategoryRow[] | null) ?? []));
  }
  return rows;
}

/** Sets the caller's own category on a shared line (D-33). The category must be the caller's own. */
export async function upsertMyLineCategory(client: DbClient, row: MemberLineCategoryRow): Promise<void> {
  const { error, status } = await client.from('transaction_member_categories').upsert(row, { onConflict: 'transaction_id,user_id' });
  if (error) throw toDbError(error, status);
}

export async function deleteMyLineCategory(client: DbClient, transactionId: string, userId: string): Promise<void> {
  const { error, status } = await client
    .from('transaction_member_categories')
    .delete()
    .eq('transaction_id', transactionId)
    .eq('user_id', userId);
  if (error) throw toDbError(error, status);
}

/** What `set_line_split` and a split Undo carry: the rule, who is in it, and each person's stored share. */
export interface SplitSnapshot {
  rule: SplitRule | null;
  participants: string[];
  shares: Record<string, number>;
}

export interface ShareTransactionArgs {
  id: string;
  expectedVersion: number;
  /** Omitted: the household's default for the line's category applies. Given: the split counts as set by hand. */
  rule?: SplitRule;
  participants?: string[];
  /** Per person, for rule 'amount' (the amounts add up to the line's household amount). */
  amounts?: Record<string, number>;
  seriesScope?: 'one' | 'series';
}

/**
 * Refusals: not_found, not_creator, already_shared, linked_line_personal, version_conflict (current_version, updated_by),
 * line_locked, no_household, invalid_scope, rate_unavailable, not_in_series, amount_rule_not_for_series, and the split
 * reasons invalid_rule, not_member, amounts_not_total, split_weights_zero, no_other_member.
 */
export function shareTransaction(client: DbClient, a: ShareTransactionArgs) {
  return callRpc<{ shared_count?: number; version?: number }>(client, 'share_transaction', {
    p_id: a.id,
    p_expected_version: a.expectedVersion,
    p_rule: a.rule ?? null,
    p_participants: a.participants ?? null,
    p_amounts: a.amounts ?? null,
    p_series_scope: a.seriesScope ?? 'one',
  });
}

/** Success: shared_count and skipped_count (debt and goal lines are skipped). Refusal: invalid_rule. */
export function bulkShareTransactions(client: DbClient, ids: readonly string[], rule?: SplitRule) {
  return callRpc<{ shared_count?: number; skipped_count?: number }>(client, 'bulk_share_transactions', {
    p_ids: ids,
    p_rule: rule ?? null,
  });
}

/** Refusals: not_found, not_creator, not_shared, version_conflict, line_locked, joint_account_line. */
export function makeLinePrivate(client: DbClient, id: string, expectedVersion: number) {
  return callRpc<{ version?: number }>(client, 'make_line_private', { p_id: id, p_expected_version: expectedVersion });
}

export interface SetLineSplitArgs {
  id: string;
  expectedVersion: number;
  rule: SplitRule;
  participants: string[];
  amounts?: Record<string, number>;
}

/** Success returns `before` (a SplitSnapshot, for Undo). Any member may call it. Refusals as shareTransaction, minus the sharing ones. */
export function setLineSplit(client: DbClient, a: SetLineSplitArgs) {
  return callRpc<{ before?: SplitSnapshot; version?: number }>(client, 'set_line_split', {
    p_id: a.id,
    p_expected_version: a.expectedVersion,
    p_rule: a.rule,
    p_participants: a.participants,
    p_amounts: a.amounts ?? null,
  });
}

/** Refusals: not_found, not_creator, not_shared, not_member, version_conflict, line_locked. */
export function setPaidBy(client: DbClient, id: string, expectedVersion: number, userId: string) {
  return callRpc<{ version?: number }>(client, 'set_paid_by', { p_id: id, p_expected_version: expectedVersion, p_user: userId });
}

/**
 * `categoryRef` null is the household default. A null `rule` on a category removes it ("Use household default").
 * Refusals: not_member, invalid_category, invalid_rule, version_conflict.
 */
export function setSplitDefault(client: DbClient, categoryRef: string | null, rule: 'even' | 'weight' | 'mine' | null, expectedVersion?: number) {
  return callRpc<{ before?: { rule: string | null } }>(client, 'set_split_default', {
    p_category_ref: categoryRef,
    p_rule: rule,
    p_expected_version: expectedVersion ?? null,
  });
}

/** How many unsettled lines "Also apply to the unsettled lines" would change (lines split by hand are not counted). */
export function countUnsettledForRule(client: DbClient, categoryRef: string | null) {
  return callRpc<{ count?: number }>(client, 'count_unsettled_for_rule', { p_category_ref: categoryRef });
}

export function applyRuleToUnsettled(client: DbClient, categoryRef: string | null) {
  return callRpc<{ changed_count?: number }>(client, 'apply_rule_to_unsettled', { p_category_ref: categoryRef });
}

export type { RpcResult };
