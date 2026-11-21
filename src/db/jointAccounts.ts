// 08.1-22 (CMP-F19, UX-21): what Decide reads about the household's joint accounts: the purpose the group set, the true balance and this
// month's totals. Totals only: a partner's lines never cross (T-08.1-66). The purpose is written only through the RPC; refusals:
// not_member, not_joint, invalid_purpose, version_conflict (current_version).
import { toDbError } from './errors';
import { callRpc } from './householdMembers';
import type { DbClient } from './rows';

export type JointPurposeValue = 'bills' | 'savings' | 'everyday';

export interface JointPurposeRow {
  id: string;
  currency: string;
  opening_balance: number;
  joint_purpose: JointPurposeValue | null;
  joint_savings_spendable: boolean;
  /** 08.1-23 (Q10, migration 20261125000800): this joint savings account is the household's shared safety net */
  joint_safety_net: boolean;
  version: number;
}

export interface JointBalanceLeg {
  account_id: string;
  balance: number;
  currency: string;
}

export interface JointMonthRow {
  account_id: string;
  currency: string;
  money_in: number;
  money_out: number;
  /** member id -> what they paid in this month */
  paid_in_by: Record<string, number>;
}

/** The household's live joint accounts with their purpose. */
export async function fetchJointPurposes(client: DbClient, householdId: string): Promise<JointPurposeRow[]> {
  const { data, error, status } = await client
    .from('accounts')
    .select('id, currency, opening_balance, joint_purpose, joint_savings_spendable, joint_safety_net, version')
    .eq('household_id', householdId)
    .eq('is_shared', true)
    .is('deleted_at', null);
  if (error) throw toDbError(error, status);
  return (data as JointPurposeRow[] | null) ?? [];
}

/** Paid lines per joint account and currency (the true balance, partners' pay-ins included); the opening balance is added by the caller. */
export async function fetchJointBalances(client: DbClient, householdId: string): Promise<JointBalanceLeg[]> {
  const { data, error, status } = await client.rpc('joint_account_balances', { p_household_id: householdId });
  if (error) throw toDbError(error, status);
  return ((data as { account_id: string; balance: number | string; currency: string }[] | null) ?? []).map((r) => ({
    account_id: r.account_id,
    balance: Number(r.balance),
    currency: r.currency,
  }));
}

/** Money in, money out and each member's pay-ins between two dates (to is exclusive). */
export async function fetchJointAccountMonth(client: DbClient, householdId: string, from: string, to: string): Promise<JointMonthRow[]> {
  const { data, error, status } = await client.rpc('joint_account_month', { p_household_id: householdId, p_from: from, p_to: to });
  if (error) throw toDbError(error, status);
  return ((data as { account_id: string; currency: string; money_in: number | string; money_out: number | string; paid_in_by: Record<string, number | string> | null }[] | null) ?? []).map((r) => ({
    account_id: r.account_id,
    currency: r.currency,
    money_in: Number(r.money_in),
    money_out: Number(r.money_out),
    paid_in_by: Object.fromEntries(Object.entries(r.paid_in_by ?? {}).map(([k, v]) => [k, Number(v)])),
  }));
}

export interface SetJointPurposeArgs {
  accountId: string;
  purpose: JointPurposeValue | null;
  /** a savings account the group marks spendable; ignored for other purposes */
  spendable: boolean;
  /** 08.1-23 (Q10): a savings account the group marks as its shared safety net (never spendable); ignored for other purposes */
  safetyNet?: boolean;
  expectedVersion: number | null;
}

export function setJointAccountPurpose(client: DbClient, a: SetJointPurposeArgs) {
  return callRpc<{ version: number }>(client, 'set_joint_account_purpose', {
    p_account: a.accountId,
    p_purpose: a.purpose,
    p_spendable: a.spendable,
    p_expected_version: a.expectedVersion,
    p_safety_net: a.safetyNet === true,
  });
}
