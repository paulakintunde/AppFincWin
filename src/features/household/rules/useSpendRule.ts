// 08.1-23 (CMP-F19, owner 2026-11-21): one read of what the household spending-rule screens and lines need: the members, the saved
// rule, the bill split, the joint accounts (names from the account list, purposes from plan 22's joint facts) and the view worked out
// from them by spendRuleView. Read live, never saved on a check (22 Q12).
import { useMemo, useState } from 'react';
import { useAccounts } from '@/data/queries/accounts';
import { useHouseholdMembers } from '@/data/queries/household';
import { useSplitDefaults } from '@/data/queries/householdBalances';
import { useHouseholdSpendRule } from '@/data/queries/householdSpendRule';
import { useJointAccountFacts } from '@/data/queries/jointAccounts';
import type { HouseholdMemberRow } from '@/db/householdMembers';
import type { HouseholdSpendRuleRow } from '@/db/householdSpendRules';
import type { JointPurposeRow } from '@/db/jointAccounts';
import type { AccountRow } from '@/db/rows';
import type { SplitDefaultRow } from '@/db/transactionSplits';
import { localDateIn } from '@/engine/time';
import { holdsMoney } from '@/features/record/accounts/accountUseSuggest';
import { spendViewOf, type AccountFacts, type SpendView } from './spendRuleView';

/** The joint accounts a list may show: shared, live, and not a departed member's tombstone home. */
export function liveJointAccounts(accounts: readonly AccountRow[] | undefined): AccountRow[] {
  return (accounts ?? []).filter((a) => a.is_shared === true && !a.tombstone_of && !a.deleted_at && !a.archived_at); // C-CR-02: as Decide reads them
}

/** What inferSetup reads, from the viewer's visible accounts and the joint purposes. */
export function accountFactsOf(accounts: readonly AccountRow[] | undefined, purposes: readonly Pick<JointPurposeRow, 'id' | 'joint_purpose'>[] | undefined, viewerId: string | null | undefined): AccountFacts {
  const joint = liveJointAccounts(accounts);
  const purposeOf = new Map((purposes ?? []).map((p) => [p.id, p.joint_purpose]));
  return {
    hasJoint: joint.length > 0,
    hasPersonalCash: (accounts ?? []).some((a) => a.is_shared !== true && !a.deleted_at && !a.archived_at && !a.tombstone_of && a.created_by === viewerId && holdsMoney(a.kind)),
    hasJointCash: joint.some((a) => purposeOf.get(a.id) !== 'savings'),
  };
}

/** Today in the device's time zone, fixed when the screen opens (the joint facts are read for its month). */
export function useToday(): string {
  const [today] = useState(() => localDateIn(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone));
  return today;
}

export interface SpendRuleRead {
  readonly members: readonly HouseholdMemberRow[];
  readonly row: HouseholdSpendRuleRow | null;
  readonly rowReady: boolean;
  readonly defaults: readonly SplitDefaultRow[] | undefined;
  readonly jointAccounts: readonly AccountRow[];
  readonly purposes: readonly JointPurposeRow[] | undefined;
  readonly view: SpendView | null;
}

export function useSpendRule(householdId: string | null | undefined, viewerId: string | null | undefined): SpendRuleRead {
  const today = useToday();
  const members = useHouseholdMembers(householdId ?? undefined).data;
  const rule = useHouseholdSpendRule(householdId);
  const defaults = useSplitDefaults(householdId ?? undefined).data;
  const accounts = useAccounts(householdId ?? undefined).data;
  const purposes = useJointAccountFacts(householdId, today).data?.purposes;
  return useMemo(() => {
    const list = members ?? [];
    const row = rule.data ?? null;
    const rowReady = rule.data !== undefined;
    const view = list.length < 2 || !rowReady ? null : spendViewOf(row, list, defaults, viewerId, accountFactsOf(accounts, purposes, viewerId));
    return { members: list, row, rowReady, defaults, jointAccounts: liveJointAccounts(accounts), purposes, view };
  }, [members, rule.data, defaults, accounts, purposes, viewerId]);
}
