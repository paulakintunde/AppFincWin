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
  return result.ok ? result.invites ?? [] : [];
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

/** Refusals: slow_down, invalid, in_other_household, full. Success: household_id, household_name?, already_member?. */
export function redeemInvite(client: DbClient, code: string) {
  return callRpc<{ household_id: string; household_name?: string | null; already_member?: boolean }>(client, 'redeem_invite', {
    p_code: code,
  });
}

const CODE_CHARS = /^[0-9A-HJKMNP-TV-Z]{12}$/;

/** Upper-cases, drops spaces and dashes, reads O as 0 and I or L as 1. Null unless 12 valid characters remain. */
export function normaliseInviteCode(input: string): string | null {
  const flat = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (!CODE_CHARS.test(flat)) return null;
  return `${flat.slice(0, 4)}-${flat.slice(4, 8)}-${flat.slice(8, 12)}`;
}

export function inviteLink(code: string): string {
  return 'fincwin://invite?code=' + code;
}
