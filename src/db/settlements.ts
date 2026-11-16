// 08-15 (HH-07, HH-08): settle-up reads and one wrapper per settlement RPC (08-11, 08-14). A settle-up records a payment
// between two people; FincWin holds and moves no money. The server recomputes the amount from the stored splits, so every
// proposal carries the amount the screen showed and a mismatch comes back as `lines_changed` with `server_amount`.
// Refusals come back as { ok: false, reason, ... }; only a transport failure or a missing session throws.

import { toDbError } from './errors';
import { callRpc } from './householdMembers';
import type { DbClient } from './rows';

export type SettlementStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled' | 'lapsed' | 'undone' | 'written_off';

export const SETTLEMENT_COLUMNS =
  'id, household_id, kind, payer_id, receiver_id, payer_former_key, receiver_former_key, amount, currency, status, created_by, payer_account_id, receiver_account_id, remind_at, expires_at, confirmed_at, resolved_at, version, created_at, updated_at';
export const SETTLEMENT_LINE_COLUMNS = 'settlement_id, transaction_id, household_id, amount, live';

export interface SettlementLineRow {
  settlement_id: string;
  transaction_id: string;
  household_id: string;
  /** This line's part of the settle-up, for traceability (D-23). */
  amount: number;
  live: boolean;
}

export interface SettlementRow {
  id: string;
  household_id: string;
  kind: 'payment' | 'write_off';
  /** Null once the account was deleted; `payer_former_key` then names them (D-29). */
  payer_id: string | null;
  receiver_id: string | null;
  payer_former_key: string | null;
  receiver_former_key: string | null;
  /** Household currency minor units, always positive. */
  amount: number;
  currency: string;
  status: SettlementStatus;
  created_by: string | null;
  payer_account_id: string | null;
  receiver_account_id: string | null;
  remind_at: string | null;
  expires_at: string | null;
  confirmed_at: string | null;
  resolved_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface SettlementWithLines extends SettlementRow {
  lines: SettlementLineRow[];
}

/** A live settle-up line with the state of the settle-up it belongs to (what decides open, pending or settled). */
export interface LiveSettlementLine extends SettlementLineRow {
  settlement: Pick<SettlementRow, 'status' | 'expires_at' | 'payer_id' | 'receiver_id'> | null;
}

/** One person's balance with someone who left, as `my_departed_balances` reports it (08-14, 08-14 follow-up 11). */
export interface DepartedBalance {
  departure_id: string;
  household_id: string;
  household_name: string | null;
  kind: 'left' | 'removed';
  other_id: string;
  other_display_name: string | null;
  other_colour_key: number;
  /** Signed: positive means the leaver owes them, negative means they owe the leaver (hh_pair_net). */
  amount: number;
  /** The leaver's own "I paid" waiting for a Got it, if there is one. */
  pending_settlement_id: string | null;
  pending_amount: number | null;
}

const IN_CHUNK = 100;

/** Settle-ups the caller is a party to (RLS), newest first, each with its lines. */
export async function fetchMySettlements(client: DbClient, householdId: string): Promise<SettlementWithLines[]> {
  const { data, error, status } = await client
    .from('settlements')
    .select(`${SETTLEMENT_COLUMNS}, lines:settlement_lines(${SETTLEMENT_LINE_COLUMNS})`)
    .eq('household_id', householdId)
    .order('created_at', { ascending: false });
  if (error) throw toDbError(error, status);
  return (data as SettlementWithLines[] | null) ?? [];
}

/** The live settle-up line of each given transaction, with its settle-up's status and expiry. */
export async function fetchLiveSettlementLines(client: DbClient, lineIds: readonly string[]): Promise<LiveSettlementLine[]> {
  const rows: LiveSettlementLine[] = [];
  for (let i = 0; i < lineIds.length; i += IN_CHUNK) {
    const { data, error, status } = await client
      .from('settlement_lines')
      .select(`${SETTLEMENT_LINE_COLUMNS}, settlement:settlements(status, expires_at, payer_id, receiver_id)`)
      .eq('live', true)
      .in('transaction_id', lineIds.slice(i, i + IN_CHUNK));
    if (error) throw toDbError(error, status);
    rows.push(...((data as unknown as LiveSettlementLine[] | null) ?? []));
  }
  return rows;
}

export interface ProposeSettlementArgs {
  receiver: string;
  lineIds: readonly string[];
  payerAccount: string;
  expectedAmount: number;
}

/** Refusals: no_household, not_member, account_not_yours, nothing_owed, lines_changed (server_amount). Success: settlement_id, amount. */
export function proposeSettlement(client: DbClient, a: ProposeSettlementArgs) {
  return callRpc<{ settlement_id?: string; amount?: number }>(client, 'propose_settlement', {
    p_receiver: a.receiver,
    p_line_ids: a.lineIds,
    p_payer_account: a.payerAccount,
    p_expected_amount: a.expectedAmount,
  });
}

/** "Got it". Refusals: not_found, not_receiver, not_pending (status), lapsed, account_not_yours, payer_account_gone, rate_unavailable. */
export function confirmSettlement(client: DbClient, id: string, receiverAccount: string) {
  return callRpc(client, 'confirm_settlement', { p_id: id, p_receiver_account: receiverAccount });
}

export interface RecordReceivedArgs {
  /** A user id, or the former-member key of someone whose account was deleted. */
  payer: string;
  lineIds: readonly string[];
  receiverAccount: string;
  expectedAmount: number;
}

/** The receiver records a payment that already arrived (D-24). Success: settlement_id, amount. Refusals as proposeSettlement. */
export function recordReceived(client: DbClient, a: RecordReceivedArgs) {
  return callRpc<{ settlement_id?: string; amount?: number }>(client, 'record_received', {
    p_payer: a.payer,
    p_line_ids: a.lineIds,
    p_receiver_account: a.receiverAccount,
    p_expected_amount: a.expectedAmount,
  });
}

export interface RecordPaidArgs {
  /** A user id, or the former-member key of someone whose account was deleted. */
  other: string;
  lineIds: readonly string[];
  payerAccount: string;
  expectedAmount: number;
}

/** The person who stayed records what they paid someone who left (08-14). Refusals add member_still_here. */
export function recordPaid(client: DbClient, a: RecordPaidArgs) {
  return callRpc<{ settlement_id?: string; amount?: number }>(client, 'record_paid', {
    p_other: a.other,
    p_line_ids: a.lineIds,
    p_payer_account: a.payerAccount,
    p_expected_amount: a.expectedAmount,
  });
}

/** After a record-received with no payer account: the payer picks the account the money left. Refusals: not_payer, not_confirmed, already_set, account_not_yours. */
export function setSettlementPayerAccount(client: DbClient, id: string, account: string) {
  return callRpc(client, 'set_settlement_payer_account', { p_id: id, p_account: account });
}

/** "Not yet". Refusals: not_found, not_receiver, not_pending, lapsed. */
export function rejectSettlement(client: DbClient, id: string) {
  return callRpc(client, 'reject_settlement', { p_id: id });
}

/** The payer withdraws a waiting settle-up. Refusals: not_found, not_payer, not_pending, lapsed. */
export function cancelSettlement(client: DbClient, id: string) {
  return callRpc(client, 'cancel_settlement', { p_id: id });
}

/** Within 24 hours of Got it. Refusals: not_found, not_confirmed, undo_window_closed, party_left. */
export function undoSettlement(client: DbClient, id: string) {
  return callRpc(client, 'undo_settlement', { p_id: id });
}

/** Only for someone who is no longer a member (`other` may be their former-member key). Refusals add member_still_here. */
export function writeOffBalance(client: DbClient, other: string, lineIds: readonly string[]) {
  return callRpc<{ settlement_id?: string; amount?: number }>(client, 'write_off_balance', { p_other: other, p_line_ids: lineIds });
}

/** "Ask to settle up", once per 24 hours per pair. Refusals: no_household, not_member, too_soon (sent_at). */
export function askToSettle(client: DbClient, other: string) {
  return callRpc(client, 'ask_to_settle', { p_other: other });
}

export interface ProposeLeaverPaymentArgs {
  /** The household the caller left or was removed from. */
  household: string;
  /** The person who stayed. */
  receiver: string;
  lineIds: readonly string[];
  expectedAmount: number;
}

/**
 * The leaver's "I paid" (D-25, owner answer 11): a waiting settle-up the person who stayed confirms with the normal Got it.
 * Success: settlement_id, amount. Refusals: not_departed, not_member, nothing_owed, lines_changed (server_amount).
 */
export function proposeLeaverPayment(client: DbClient, a: ProposeLeaverPaymentArgs) {
  return callRpc<{ settlement_id?: string; amount?: number }>(client, 'propose_leaver_payment', {
    p_household: a.household,
    p_receiver: a.receiver,
    p_line_ids: a.lineIds,
    p_expected_amount: a.expectedAmount,
  });
}

/** What the caller is owed or owes in households they left or were removed from; rows carry any waiting "I paid". */
export function myDepartedBalances(client: DbClient) {
  return callRpc<{ balances?: DepartedBalance[] }>(client, 'my_departed_balances');
}
