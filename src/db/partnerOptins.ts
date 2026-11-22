// 08.1-07 (CMP-F19, D-36, D-37): partner opt-in for Decide, the shared safety net and the dates-only last-shared-line read.
// The server owns every rule (both sides must say yes; only one rounded total ever crosses). These wrappers carry the call.
// Refusals come back as { ok: false, reason }; only a missing session raises.

import { toDbError } from './errors';
import { callRpc, type RpcResult } from './householdMembers';
import type { DbClient } from './rows';

export const OPTIN_COLUMNS = 'household_id, owner_id, partner_id, enabled, updated_at';
export const NET_SHARE_COLUMNS = 'household_id, goal_id, owner_id, enabled, rounded_saved, updated_at';

export interface PartnerOptinRow {
  household_id: string;
  owner_id: string;
  partner_id: string;
  enabled: boolean;
  updated_at: string;
}

export interface SafetyNetShareRow {
  household_id: string;
  goal_id: string;
  owner_id: string;
  enabled: boolean;
  rounded_saved: number | null;
  updated_at: string;
}

/**
 * Opt-ins the signed-in person owns or is named in (RLS limits the read to those two), in their current household only. 08.1 review
 * C-WR-01: the server ends opt-ins when a member leaves (20261125000900); the filter keeps a row from another household out regardless.
 */
export async function fetchOptins(client: DbClient, householdId: string): Promise<PartnerOptinRow[]> {
  const { data, error, status } = await client.from('decide_partner_optins').select(OPTIN_COLUMNS).eq('household_id', householdId);
  if (error) throw toDbError(error, status);
  return (data as PartnerOptinRow[] | null) ?? [];
}

/**
 * Net shares the signed-in person owns in their current household. 08.1 review C-CR-01: a share left in a household the person has
 * left must never drive the hourly publish (the server also refuses it and ends the share on leave, 20261125000900).
 */
export async function fetchOwnNetShares(client: DbClient, householdId: string): Promise<SafetyNetShareRow[]> {
  const { data, error, status } = await client.from('safety_net_shares').select(NET_SHARE_COLUMNS).eq('household_id', householdId);
  if (error) throw toDbError(error, status);
  return (data as SafetyNetShareRow[] | null) ?? [];
}

/** Refusals: not_signed_in, not_a_member. Turning off also removes the person's published figure. */
export function setPartnerOptin(client: DbClient, partnerId: string, enabled: boolean) {
  return callRpc<{ enabled: boolean }>(client, 'set_partner_optin', { p_partner: partnerId, p_enabled: enabled });
}

/** `roundedLeft` must be a multiple of 1000 minor units. Refusals: not_rounded, bad_currency, no_optin. */
export function publishPartnerFigure(client: DbClient, roundedLeft: number, currency: string) {
  return callRpc(client, 'publish_partner_figure', { p_rounded_left: roundedLeft, p_currency: currency });
}

/** 08.1-10: the owner's device sends what the shared safety net has saved, rounded down to a multiple of 1000. Refusals: not_signed_in, not_rounded, not_shared. */
export function publishSafetyNetSaved(client: DbClient, goalId: string, roundedSaved: number) {
  return callRpc(client, 'publish_safety_net_saved', { p_goal_id: goalId, p_rounded_saved: roundedSaved });
}

export type PartnerMoneyTotal = RpcResult<{ rounded_left: number; currency: string; as_of: string }>;

/** One rounded total, or a refusal: not_both_on, no_figure. */
export function partnerMoneyTotal(client: DbClient, partnerId: string): Promise<PartnerMoneyTotal> {
  return callRpc<{ rounded_left: number; currency: string; as_of: string }>(client, 'partner_money_total', { p_partner: partnerId });
}

/** Refusals: not_your_safety_net, no_partner. */
export function setSharedSafetyNet(client: DbClient, goalId: string, enabled: boolean) {
  return callRpc<{ enabled: boolean }>(client, 'set_shared_safety_net', { p_goal_id: goalId, p_enabled: enabled });
}

export type SharedSafetyNet = RpcResult<{ owner_id: string; size: number; saved: number; currency: string }>;

/** A net another member shared: size and saved only. Refusal: none_shared. */
export function sharedSafetyNet(client: DbClient): Promise<SharedSafetyNet> {
  return callRpc<{ owner_id: string; size: number; saved: number; currency: string }>(client, 'shared_safety_net');
}

export interface LastSharedLine {
  member_id: string;
  /** The latest day that member logged a shared line, or null when they never have. Dates only. */
  last_date: string | null;
}

export async function partnerLastSharedLine(client: DbClient): Promise<LastSharedLine[]> {
  const res = await callRpc<{ members: LastSharedLine[] }>(client, 'partner_last_shared_line');
  return res.ok ? res.members : [];
}
