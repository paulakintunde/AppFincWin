// 08-13 (HH-03, HH-10): member rows and the member RPC wrappers. The server owns every rule (version
// checks, colour uniqueness, weights adding to 100); these wrappers only carry the call and its answer.
// Refusals come back as { ok: false, reason } -- only a missing session raises.

import { toDbError } from './errors';
import type { DbClient } from './rows';

export const MEMBER_COLUMNS =
  'household_id, user_id, is_owner, role_label, weight, colour_key, display_name, name_hidden, version, created_at';

export interface HouseholdMemberRow {
  household_id: string;
  user_id: string;
  is_owner: boolean;
  role_label: string;
  /** Percent, 0 to 100. */
  weight: number;
  /** 0 to 5, an index into MEMBER_COLOUR_NAMES. */
  colour_key: number;
  display_name: string | null;
  name_hidden: boolean;
  version: number;
  created_at: string;
}

/** What every membership RPC returns: its own fields on success, a reason code on refusal. */
export type RpcResult<T = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; reason: string; [k: string]: unknown };

/** Members in join order (the order weights re-split in). */
export async function fetchHouseholdMembers(client: DbClient, householdId: string): Promise<HouseholdMemberRow[]> {
  const { data, error, status } = await client
    .from('household_members')
    .select(MEMBER_COLUMNS)
    .eq('household_id', householdId)
    .order('created_at', { ascending: true });

  if (error) throw toDbError(error, status);
  return (data as HouseholdMemberRow[] | null) ?? [];
}

async function callRpc<T>(client: DbClient, name: string, args?: Record<string, unknown>): Promise<RpcResult<T>> {
  const { data, error, status } = await client.rpc(name, args);
  if (error) throw toDbError(error, status);
  return data as RpcResult<T>;
}

export interface SetMyDisplayArgs {
  expectedVersion: number;
  colourKey: number;
  nameHidden: boolean;
  displayName: string | null;
}

/** Refusals: not_member, version_conflict (current_version, updated_by), invalid_name, colour_taken. */
export function setMyMemberDisplay(client: DbClient, a: SetMyDisplayArgs) {
  return callRpc(client, 'set_my_member_display', {
    p_expected_version: a.expectedVersion,
    p_colour_key: a.colourKey,
    p_name_hidden: a.nameHidden,
    p_display_name: a.displayName,
  });
}

/** Refusals: not_member, not_allowed, owner_label_fixed, invalid_role, version_conflict (current_version, updated_by). */
export function setMemberRole(client: DbClient, userId: string, roleLabel: string, expectedVersion: number) {
  return callRpc(client, 'set_member_role', { p_user_id: userId, p_role_label: roleLabel, p_expected_version: expectedVersion });
}

/**
 * `weights` maps user id to percent; `expectedVersions` maps user id to the member row version the screen was showing.
 * Success returns `before` (the old weights, for Undo) and `versions` (the new row versions).
 * Refusals: not_member, members_mismatch, invalid_weight, all_zero, not_100, version_conflict (current_versions,
 * updated_by: who saved last, or null).
 */
export function setMemberWeights(client: DbClient, weights: Record<string, number>, expectedVersions: Record<string, number>) {
  return callRpc<{ before?: Record<string, number>; versions?: Record<string, number> }>(client, 'set_member_weights', {
    p_weights: weights,
    p_expected_versions: expectedVersions,
  });
}

/** Refusals: not_owner, invalid_name, version_conflict (current_version). */
export function renameHousehold(client: DbClient, name: string, expectedVersion: number) {
  return callRpc<{ version?: number }>(client, 'rename_household', { p_name: name, p_expected_version: expectedVersion });
}

/** Refusals: not_owner, unknown_currency. */
export function setHouseholdCurrency(client: DbClient, code: string) {
  return callRpc(client, 'set_household_currency', { p_code: code });
}
