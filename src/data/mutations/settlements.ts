// 08-15 (HH-07, HH-08, D-19, D-20): settle-up calls. These are online-only: they are plain mutations with no default
// registered for the offline queue, so a call made without a connection never waits and never replays later. A settle-up
// replayed after the lines changed could move money records on a stale amount, so the server recomputes the amount on every
// call and the person confirms it on screen while connected (T-08-59).
//
// Each hook refuses to run when the device is offline and resolves with { ok: false, reason: 'offline' } instead of
// throwing, so a screen can show its own words (household.reasons.offline). Any other refusal comes back as the server's
// { ok: false, reason } untouched (lines_changed carries server_amount); only a transport failure rejects.
import { onlineManager, useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import type { RpcResult } from '@/db/householdMembers';
import type { DbClient } from '@/db/rows';
import {
  askToSettle,
  cancelSettlement,
  confirmSettlement,
  proposeLeaverPayment,
  proposeSettlement,
  recordPaid,
  recordReceived,
  rejectSettlement,
  setSettlementPayerAccount,
  undoSettlement,
  writeOffBalance,
  type ProposeLeaverPaymentArgs,
  type ProposeSettlementArgs,
  type RecordPaidArgs,
  type RecordReceivedArgs,
} from '@/db/settlements';
import { queryKeys } from '@/data/keys';
import { writeClient } from './writeClient';

/** What a settle-up call resolves with when the device has no connection. */
export const OFFLINE_RESULT = { ok: false, reason: 'offline' } as const;

interface HouseholdVars {
  householdId: string;
}

export type ProposeSettlementVars = HouseholdVars & ProposeSettlementArgs;
export type RecordReceivedVars = HouseholdVars & RecordReceivedArgs;
export type RecordPaidVars = HouseholdVars & RecordPaidArgs;
export type ProposeLeaverPaymentVars = HouseholdVars & ProposeLeaverPaymentArgs;
export interface ConfirmSettlementVars extends HouseholdVars {
  id: string;
  receiverAccount: string;
}
export interface SettlementIdVars extends HouseholdVars {
  id: string;
}
export interface SetPayerAccountVars extends HouseholdVars {
  id: string;
  account: string;
}
export interface WriteOffVars extends HouseholdVars {
  other: string;
  lineIds: readonly string[];
}
export interface AskToSettleVars extends HouseholdVars {
  other: string;
}

/**
 * A settle-up changes balances, the two account balances it writes records to, and the notices. Refresh the household's
 * transactions (months, balances, pair lines), its settle-ups and its notices. Not awaited, like every post-write refresh.
 */
export function invalidateSettleReads(qc: QueryClient, householdId: string): void {
  void qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(householdId) });
  void qc.invalidateQueries({ queryKey: queryKeys.settlements(householdId) });
  void qc.invalidateQueries({ queryKey: queryKeys.householdEvents(householdId) });
}

/** One online-only call: offline answers 'offline' without a request, anything the server says refreshes the reads. */
function useOnlineCall<V extends HouseholdVars, T = unknown>(
  call: (client: DbClient, vars: V) => Promise<RpcResult<T>>
) {
  const qc = useQueryClient();
  return useMutation<RpcResult<T>, unknown, V>({
    // 'always': the default network mode would pause the call while offline and run it on reconnect, which is the queue
    // behaviour these calls must not have.
    networkMode: 'always',
    // 09-25 (A2-W): settlements are plan-locked server-side; the central guard stops these unkeyed calls too.
    meta: { planLocked: true },
    mutationFn: async (vars) => {
      if (!onlineManager.isOnline()) return OFFLINE_RESULT;
      const client = await writeClient();
      return call(client, vars);
    },
    // A refusal such as lines_changed means the lines moved, so the reads refresh on any server answer.
    onSuccess: (res, vars) => {
      if (res.ok || res.reason !== 'offline') invalidateSettleReads(qc, vars.householdId);
    },
  });
}

const propose = (c: DbClient, v: ProposeSettlementVars) => proposeSettlement(c, v);
const confirm = (c: DbClient, v: ConfirmSettlementVars) => confirmSettlement(c, v.id, v.receiverAccount);
const received = (c: DbClient, v: RecordReceivedVars) => recordReceived(c, v);
const paid = (c: DbClient, v: RecordPaidVars) => recordPaid(c, v);
const reject = (c: DbClient, v: SettlementIdVars) => rejectSettlement(c, v.id);
const cancel = (c: DbClient, v: SettlementIdVars) => cancelSettlement(c, v.id);
const undo = (c: DbClient, v: SettlementIdVars) => undoSettlement(c, v.id);
const writeOff = (c: DbClient, v: WriteOffVars) => writeOffBalance(c, v.other, v.lineIds);
const ask = (c: DbClient, v: AskToSettleVars) => askToSettle(c, v.other);
const payerAccount = (c: DbClient, v: SetPayerAccountVars) => setSettlementPayerAccount(c, v.id, v.account);
const leaverPays = (c: DbClient, v: ProposeLeaverPaymentVars) => proposeLeaverPayment(c, v);

/** The payer tells the receiver they paid (a waiting settle-up for exactly the ticked lines). */
export const useProposeSettlement = () => useOnlineCall<ProposeSettlementVars, { settlement_id?: string; amount?: number }>(propose);
/** "Got it": the receiver confirms, and the two settlement records are written. */
export const useConfirmSettlement = () => useOnlineCall<ConfirmSettlementVars>(confirm);
/** The receiver records a payment that already arrived. */
export const useRecordReceived = () => useOnlineCall<RecordReceivedVars, { settlement_id?: string; amount?: number }>(received);
/** The person who stayed records what they paid someone who left. */
export const useRecordPaid = () => useOnlineCall<RecordPaidVars, { settlement_id?: string; amount?: number }>(paid);
/** "Not yet". */
export const useRejectSettlement = () => useOnlineCall<SettlementIdVars>(reject);
/** The payer withdraws a waiting settle-up. */
export const useCancelSettlement = () => useOnlineCall<SettlementIdVars>(cancel);
/** Undo within 24 hours of Got it. */
export const useUndoSettlement = () => useOnlineCall<SettlementIdVars>(undo);
/** Write off a balance with someone who is no longer a member. */
export const useWriteOff = () => useOnlineCall<WriteOffVars, { settlement_id?: string; amount?: number }>(writeOff);
/** "Ask to settle up", once per 24 hours per pair. */
export const useAskToSettle = () => useOnlineCall<AskToSettleVars>(ask);
/** After a record-received with no payer account: the payer says which account the money left. */
export const useSetSettlementPayerAccount = () => useOnlineCall<SetPayerAccountVars>(payerAccount);
/** The leaver's "I paid": a waiting settle-up the person who stayed confirms. */
export const useProposeLeaverPayment = () => useOnlineCall<ProposeLeaverPaymentVars, { settlement_id?: string; amount?: number }>(leaverPays);
