// 08.1-10 / 08.1-22 (D-01..D-03, CMP-F19, UX-21): reads what a check needs about the household (members and weights, each other member's
// one shared figure, the settle-up facts, the group's spending rule and its joint accounts) and hands the builder one HouseholdScopeSource.
// Just me with no joint account: nothing is read beyond the cached member list and the source is absent. Just me with a joint account gets
// a source too (the viewer counts only their slice of joint money); the rule and the joint facts are read live, never saved on a check.
import { useMemo, useState } from 'react';
import { useHouseholdId, useHouseholdMembers } from '@/data/queries/household';
import { useHouseholdBalances, useSettlements, useSplitDefaults } from '@/data/queries/householdBalances';
import { useHouseholdSpendRule } from '@/data/queries/householdSpendRule';
import { useJointAccountFacts } from '@/data/queries/jointAccounts';
import { usePartnerMoneyTotals } from '@/data/queries/partnerMoney';
import type { ShareScope } from '@/engine/decide/v3';
import { localDateIn } from '@/engine/time';
import type { HouseholdScopeSource } from '@/features/decide/snapshot/v3/householdScope';
import { useAuth } from '@/features/auth/AuthProvider';
import { jointSourcesOf, scopeSourceOf, settleUpOf, shareScopeOf } from './scopeSource';

export interface HouseholdScopeRead {
  /** Absent for Just me with no joint account, and until the viewer's household is known. */
  readonly source: HouseholdScopeSource | undefined;
  /** True while the household's figures are still on their way: the answer waits rather than say a partner has not shared. */
  readonly pending: boolean;
}

const NOT_ON: HouseholdScopeRead = { source: undefined, pending: false };

export function useHouseholdScopeSource(on: boolean): HouseholdScopeRead {
  const { user } = useAuth();
  const userId = user?.id;
  const householdId = useHouseholdId(userId).data ?? undefined;
  const members = useHouseholdMembers(householdId).data;
  const others = useMemo(() => (members ?? []).filter((m) => m.user_id !== userId), [members, userId]);
  const totals = usePartnerMoneyTotals(userId, on ? others.map((m) => m.user_id) : [], on);
  const settlements = useSettlements(on ? householdId : undefined).data;
  const balances = useHouseholdBalances(on ? householdId : undefined, userId).data;
  const defaults = useSplitDefaults(householdId).data;
  const rule = useHouseholdSpendRule(householdId);
  const [now] = useState(() => Date.now()); // the settle-up reading is as of when the check opened
  const jointRead = useJointAccountFacts(householdId, localDateIn(new Date(now), Intl.DateTimeFormat().resolvedOptions().timeZone));
  const hasJoint = (jointRead.data?.purposes.length ?? 0) > 0;
  const active = on || hasJoint;
  const totalsKey = totals.map((q) => `${q.dataUpdatedAt}:${q.status}`).join(',');
  // the answer waits for the rule and the joint facts too, so there is no flash of a different answer
  const waiting =
    householdId !== undefined && (members === undefined || rule.isPending || jointRead.isPending || (on && (userId === undefined || totals.some((q) => q.isPending))));
  const source = useMemo(() => {
    if (!active || userId === undefined || members === undefined || rule.isPending || jointRead.isPending) return undefined;
    const settleUp = on ? settleUpOf(settlements ?? [], balances?.pairs ?? [], userId, now) : null;
    return (
      scopeSourceOf({
        viewerId: userId,
        members,
        totals: on ? totals.map((q) => q.data) : others.map(() => undefined),
        settleUp,
        scope: on ? 'household' : 'me',
        spendRule: rule.data ?? null,
        defaults,
        joint: jointSourcesOf(jointRead.data),
      }) ?? undefined
    );
    // totals is rebuilt each render; totalsKey stands for its data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, on, userId, members, settlements, balances, totalsKey, now, rule.data, rule.isPending, defaults, jointRead.data, jointRead.isPending, others]);
  if (!active && !waiting) return NOT_ON;
  return { source, pending: waiting };
}

/** The share a new Household check is saved with (Who pays), or null when the viewer's household has fewer than 2 people. */
export function useHouseholdShare(): { readonly shareScope: ShareScope | null; readonly memberCount: number } {
  const { user } = useAuth();
  const householdId = useHouseholdId(user?.id).data ?? undefined;
  const members = useHouseholdMembers(householdId).data;
  const defaults = useSplitDefaults(householdId).data;
  return useMemo(
    () => ({ shareScope: members === undefined ? null : shareScopeOf(members, user?.id, defaults), memberCount: members?.length ?? 0 }),
    [members, defaults, user?.id],
  );
}
