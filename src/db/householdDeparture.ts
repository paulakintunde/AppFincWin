// 08-24 (HH-13, D-25..D-28): the leave, remove and ownership RPC wrappers. The server owns every rule (owner powers, the
// data moves, cancelling waiting settle-ups, the notices); these wrappers only carry the call and its answer. Refusals come
// back as { ok: false, reason } -- only a missing session raises.

import { callRpc } from './householdMembers';
import type { DbClient } from './rows';

/** One open balance at the moment of leaving. `amount` is signed: positive = the leaver owes that person. */
export interface LeaveOpenBalance {
  other_id: string;
  amount: number;
}

/**
 * Leaves the caller's household. An owner passes the member who becomes owner.
 * Refusals: not_member, alone (a household of one), pick_new_owner (owner without a choice).
 */
export function leaveHousehold(client: DbClient, newOwnerId?: string | null) {
  return callRpc<{ new_household_id: string; open_balances: LeaveOpenBalance[] }>(client, 'leave_household', {
    p_new_owner: newOwnerId ?? null,
  });
}

/** Owner only. Refusals: not_owner, not_member. The departure id feeds the 24-hour reinvite (reinviteRemoved). */
export function removeMember(client: DbClient, userId: string) {
  return callRpc<{ departure_id: string }>(client, 'remove_member', { p_user: userId });
}

/** Owner only. Refusals: not_owner, not_member. */
export function transferOwnership(client: DbClient, userId: string) {
  return callRpc(client, 'transfer_ownership', { p_new_owner: userId });
}
