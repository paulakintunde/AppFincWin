// 08.1-10 / 08.1-22 (D-01..D-03, CMP-F19, UX-21): reads what a check needs about the household (members and weights, each other member's
// one shared figure, the settle-up facts, the group's spending rule and its joint accounts) and hands the builder one HouseholdScopeSource.
// Just me with no joint account: nothing is read beyond the cached member list and the source is absent. Just me with a joint account gets
// a source too (the viewer counts only their slice of joint money); the rule and the joint facts are read live, never saved on a check.
import { useMemo, useState } from 'react';
import { useHouseholdId, useHouseholdMembers } from '@/data/queries/household';
import { useHouseholdBalances, useSettlements, useSplitDefaults } from '@/data/queries/householdBalances';
import { useHouseholdSpendRule } from '@/data/queries/householdSpendRule';
import { useJointAccountFacts } from '@/data/queries/jointAccounts';
import { freshPartnerTotal, usePartnerMoneyTotals } from '@/data/queries/partnerMoney';
import type { ShareScope } from '@/engine/decide/v3';
import { localDateIn } from '@/engine/time';
import type { HouseholdScopeSource } from '@/features/decide/snapshot/v3/householdScope';
import { useAuth } from '@/features/auth/AuthProvider';
import { jointSourcesOf, scopeSourceOf, settleUpOf, shareScopeOf } from './scopeSource';
import { useSpendNote, type SpendNote } from './useSpendNote';

export interface HouseholdScopeRead {
  /** Absent for Just me with no joint account, and until the viewer's household is known. */
  readonly source: HouseholdScopeSource | undefined;
  /** True while the household's figures are still on their way: the answer waits rather than say a partner has not shared. */
  readonly pending: boolean;
  /**
   * 08.1 review A-CR-01: a household read (the household, its members, the spending rule or the joint facts) failed with nothing cached.
   * Absent when every read came back. A failed read is never taken as "no joint account": the caller fails closed (an error state)
   * instead of counting a joint balance it could not slice. `read` names the read for missingReads.
   */
  readonly failed?: HouseholdReadFailure;
}

export interface HouseholdReadFailure {
  readonly read: 'household' | 'householdMembers' | 'spendRule' | 'jointAccounts';
  readonly error: unknown;
  retry(): void;
}

interface ReadLike {
  readonly data: unknown;
  readonly isError?: boolean;
  readonly error?: unknown;
  refetch?: () => unknown;
}

/** The first of the household reads that failed with nothing cached, or undefined. */
export function householdReadFailure(reads: readonly (readonly [HouseholdReadFailure['read'], ReadLike])[]): HouseholdReadFailure | undefined {
  for (const [read, q] of reads) {
    if (q.data !== undefined || q.isError !== true) continue;
    const refetch = q.refetch;
    return { read, error: q.error, retry: () => void refetch?.() };
  }
  return undefined;
}

const NOT_ON: HouseholdScopeRead = { source: undefined, pending: false };

export function useHouseholdScopeSource(on: boolean): HouseholdScopeRead {
  const { user } = useAuth();
  const userId = user?.id;
  const householdRead = useHouseholdId(userId);
  const householdId = householdRead.data ?? undefined;
  const membersRead = useHouseholdMembers(householdId);
  const members = membersRead.data;
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
  const totalsKey = totals.map((q) => `${q.dataUpdatedAt}:${q.status}:${q.fetchStatus}`).join(',');
  // the answer waits for the rule and the joint facts too, so there is no flash of a different answer.
  // C-WR-02: it also waits while a partner figure is being read again (each check refetches it), so a figure the partner has since
  // stopped sharing is never counted while the fresh read is on its way.
  const waiting =
    householdId !== undefined &&
    (members === undefined || rule.isPending || jointRead.isPending || (on && (userId === undefined || totals.some((q) => q.isPending || q.fetchStatus === 'fetching'))));
  const source = useMemo(() => {
    if (!active || userId === undefined || members === undefined || rule.isPending || jointRead.isPending) return undefined;
    const settleUp = on ? settleUpOf(settlements ?? [], balances?.pairs ?? [], userId, now) : null;
    return (
      scopeSourceOf({
        viewerId: userId,
        members,
        // C-WR-02 (fail closed): a figure the server has not confirmed within PARTNER_MONEY_FRESH_MS of the check (offline, a failed
        // refetch, an old cached copy) is read as not shared. `now` is when the check opened.
        totals: on ? totals.map((q) => freshPartnerTotal(q, now)) : others.map(() => undefined),
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
  // A-CR-01: a failed read (nothing cached) is reported as failed, never as "no joint account" and never as still waiting.
  const failed = householdReadFailure([
    ['household', householdRead],
    ...(householdId === undefined
      ? []
      : ([
          ['householdMembers', membersRead],
          ['spendRule', rule],
          ['jointAccounts', jointRead],
        ] as const)),
  ]);
  if (failed !== undefined) return { source: undefined, pending: false, failed };
  if (!active && !waiting) return NOT_ON;
  return { source, pending: waiting };
}

/**
 * The share a new Household check is saved with (Who pays), or null when the viewer's household has fewer than 2 people. 08.1-23 (Q12):
 * `spend` says which spending rule a check counts, for the Who pays helper (absent until it is read).
 */
export function useHouseholdShare(): { readonly shareScope: ShareScope | null; readonly memberCount: number; readonly spend?: SpendNote | null } {
  const { user } = useAuth();
  const householdId = useHouseholdId(user?.id).data ?? undefined;
  const members = useHouseholdMembers(householdId).data;
  const defaults = useSplitDefaults(householdId).data;
  const spend = useSpendNote();
  const spendKey = spend === null ? '' : JSON.stringify(spend);
  return useMemo(
    () => ({ shareScope: members === undefined ? null : shareScopeOf(members, user?.id, defaults), memberCount: members?.length ?? 0, spend }),
    // spend is rebuilt each render; spendKey stands for its data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [members, defaults, user?.id, spendKey],
  );
}
