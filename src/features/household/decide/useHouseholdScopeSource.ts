// 08.1-10 (D-01..D-03): reads what a Household check needs (members and weights, each other member's one shared figure, the settle-up
// facts) and hands the builder one HouseholdScopeSource. Off (Just me): nothing is read beyond the cached member list and the source is absent.
import { useMemo, useState } from 'react';
import { useHouseholdId, useHouseholdMembers } from '@/data/queries/household';
import { useHouseholdBalances, useSettlements, useSplitDefaults } from '@/data/queries/householdBalances';
import { usePartnerMoneyTotals } from '@/data/queries/partnerMoney';
import type { ShareScope } from '@/engine/decide/v3';
import type { HouseholdScopeSource } from '@/features/decide/snapshot/v3/householdScope';
import { useAuth } from '@/features/auth/AuthProvider';
import { scopeSourceOf, settleUpOf, shareScopeOf } from './scopeSource';

export interface HouseholdScopeRead {
  /** Absent for Just me, and until the viewer's household is known. */
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
  const [now] = useState(() => Date.now()); // the settle-up reading is as of when the check opened
  const totalsKey = totals.map((q) => `${q.dataUpdatedAt}:${q.status}`).join(',');
  const waiting = on && (userId === undefined || householdId === undefined || members === undefined || totals.some((q) => q.isPending));
  const source = useMemo(() => {
    if (!on || userId === undefined || members === undefined) return undefined;
    const settleUp = settleUpOf(settlements ?? [], balances?.pairs ?? [], userId, now);
    return scopeSourceOf({ viewerId: userId, members, totals: totals.map((q) => q.data), settleUp }) ?? undefined;
    // totals is rebuilt each render; totalsKey stands for its data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, userId, members, settlements, balances, totalsKey, now]);
  if (!on) return NOT_ON;
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
