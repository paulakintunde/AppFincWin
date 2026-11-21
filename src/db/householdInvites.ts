// 08-13 (HH-01, HH-02): invite wrappers. Codes are 12 Crockford characters shown as XXXX-XXXX-XXXX.
// D-38: the share link uses the app's custom scheme only; there is no https link.

import { toDbError } from './errors';
import type { RpcResult } from './householdMembers';
import type { DbClient } from './rows';

export interface OpenInvite {
  invite_id: string;
  code: string;
  expires_at: string;
  created_at: string;
}

/** What a code shows before it is redeemed. */
export interface InvitePreview {
  household_name: string | null;
  inviter_display_name: string | null;
  inviter_colour_key: number;
  member_count: number;
  in_other_household: boolean;
  already_member: boolean;
  full: boolean;
  /** 09-04: the plan is covered and this person would be past its size, so the payer must approve first. */
  needs_approval?: boolean;
  plan_key?: string | null;
  seats?: number;
}

/** A join request row (plan_join_requests). The requester and the payer can read it; nobody writes it from the client. */
export interface JoinRequest {
  id: string;
  household_id: string;
  user_id: string;
  needed_plan_size: number;
  status: 'waiting' | 'admitted' | 'cancelled' | 'expired';
  created_at: string;
}

/** What redeem_invite returns on success. */
export interface RedeemOk {
  household_id: string;
  household_name?: string | null;
  already_member?: boolean;
}

async function callRpc<T>(client: DbClient, name: string, args?: Record<string, unknown>): Promise<RpcResult<T>> {
  const { data, error, status } = await client.rpc(name, args);
  if (error) throw toDbError(error, status);
  return data as RpcResult<T>;
}

/** Refusals: not_owner, full, try_again. */
export function createInvite(client: DbClient) {
  return callRpc<{ invite_id: string; code: string; expires_at: string }>(client, 'create_invite');
}

export async function fetchOpenInvites(client: DbClient): Promise<OpenInvite[]> {
  const result = await callRpc<{ invites: OpenInvite[] }>(client, 'my_open_invites');
  return result.ok ? (result.invites ?? []) : [];
}

/** Refusals: not_found, not_open. */
export function cancelInvite(client: DbClient, inviteId: string) {
  return callRpc(client, 'cancel_invite', { p_invite_id: inviteId });
}

/** Refusals: not_found, not_restorable, full. */
export function restoreInvite(client: DbClient, inviteId: string) {
  return callRpc(client, 'restore_invite', { p_invite_id: inviteId });
}

/** Refusals: slow_down, invalid. */
export function previewInvite(client: DbClient, code: string) {
  return callRpc<InvitePreview>(client, 'preview_invite', { p_code: code });
}

/**
 * Refusals: slow_down, invalid, in_other_household, full, needs_approval (request_id), switch_rule (open_from).
 * `storeCountry` is read once from the store, passed to the server for the switch rule and never kept (T-09-70).
 */
export function redeemInvite(client: DbClient, code: string, storeCountry: string | null = null) {
  return callRpc<RedeemOk>(client, 'redeem_invite', {
    p_code: code,
    p_store_country: storeCountry,
  });
}

/** The requester or the payer withdraws a waiting request. Refusals: not_found, not_allowed. */
export function cancelJoinRequest(client: DbClient, requestId: string) {
  return callRpc(client, 'cancel_join_request', { p_request: requestId });
}

/** Reads one request through RLS (requester or payer). Null when it is not visible or no longer exists. */
export async function fetchJoinRequest(client: DbClient, requestId: string): Promise<JoinRequest | null> {
  const { data, error, status } = await client
    .from('plan_join_requests')
    .select('id, household_id, user_id, needed_plan_size, status, created_at')
    .eq('id', requestId)
    .maybeSingle();
  if (error) throw toDbError(error, status);
  return (data as JoinRequest | null) ?? null;
}

const CODE_CHARS = /^[0-9A-HJKMNP-TV-Z]{12}$/;

/** Upper-cases, drops spaces and dashes, reads O as 0 and I or L as 1. Null unless 12 valid characters remain. */
export function normaliseInviteCode(input: string): string | null {
  const flat = input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (!CODE_CHARS.test(flat)) return null;
  return `${flat.slice(0, 4)}-${flat.slice(4, 8)}-${flat.slice(8, 12)}`;
}

export function inviteLink(code: string): string {
  return 'fincwin://invite?code=' + code;
}
