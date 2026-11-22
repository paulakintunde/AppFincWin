// 08.1-22 (CMP-F19): the household's spending rule and account setup. One row per household, written only through the RPC (any member,
// named in Notices). Refusals come back as { ok: false, reason }: not_member, too_few, invalid_rule, invalid_setup, members_mismatch,
// invalid_share, all_zero, not_100, version_conflict (current_version, updated_by). Only a missing session raises.
import { toDbError } from './errors';
import { callRpc } from './householdMembers';
import type { DbClient } from './rows';

export const SPEND_RULE_COLUMNS = 'household_id, rule, setup, shares, version, updated_by, updated_at';

export type SpendRuleValue = 'bring' | 'custom' | 'bill';
export type SpendSetupValue = 'separate' | 'joint' | 'mixed';

export interface HouseholdSpendRuleRow {
  household_id: string;
  rule: SpendRuleValue | null;
  setup: SpendSetupValue | null;
  shares: Record<string, number> | null;
  version: number;
  updated_by: string | null;
  updated_at: string;
}

/** The saved rule, or null when the household has not picked one (the setup default applies). */
export async function fetchHouseholdSpendRule(client: DbClient, householdId: string): Promise<HouseholdSpendRuleRow | null> {
  const { data, error, status } = await client.from('household_spend_rules').select(SPEND_RULE_COLUMNS).eq('household_id', householdId).maybeSingle();
  if (error) throw toDbError(error, status);
  return (data as HouseholdSpendRuleRow | null) ?? null;
}

export interface SetSpendRuleArgs {
  rule: SpendRuleValue | null;
  setup: SpendSetupValue | null;
  /** member id -> share, for the custom rule; null otherwise (the stored shares are kept) */
  shares: Record<string, number> | null;
  /** the version the caller read; null for the first save */
  expectedVersion: number | null;
}

export function setHouseholdSpendRule(client: DbClient, a: SetSpendRuleArgs) {
  return callRpc<{ version: number }>(client, 'set_household_spend_rule', {
    p_rule: a.rule,
    p_setup: a.setup,
    p_shares: a.shares,
    p_expected_version: a.expectedVersion,
  });
}
