// 08.1-25 (CMP-F19, owner one-earner fix 2026-11-21, Q1 A, Q3 A): which members' share of the joint money is $0 because of the group's
// SAVED rule, for the card on "How spending is shared". Every member sees it and it names the person (Q3 A). It reads only what the
// group already sees: the joint accounts' balances and this month's per-member pay-in totals (plan 22's joint facts). Private accounts
// are never read (Q1 A). The figures are the engine's (zeroShareMembers via spendRuleView zeroShareIdsOf), the same trigger the
// answer's share_zero_by_rule line uses.
import { useMemo } from 'react';
import { useDecideV3 } from '@/data/queries/decideV3';
import { useJointAccountFacts } from '@/data/queries/jointAccounts';
import type { HouseholdSetup } from '@/engine/household';
import { jointSourcesOf } from '../decide/scopeSource';
import { zeroShareIdsOf, type ZeroShareParts } from './spendRuleView';
import { useToday } from './useSpendRule';

export interface ZeroShare {
  readonly ids: readonly string[];
  /** the household's Decide currency; null = not known yet (the card waits) */
  readonly currency: string | null;
}

export function useZeroShare(
  householdId: string | null | undefined,
  members: ZeroShareParts['members'],
  row: ZeroShareParts['row'],
  defaults: ZeroShareParts['defaults'],
  setup: HouseholdSetup | null,
): ZeroShare {
  const today = useToday();
  const { prepared } = useDecideV3();
  const facts = useJointAccountFacts(householdId, today).data;
  const currency = prepared === null ? null : (prepared.inputs.currency as string);
  return useMemo(() => {
    if (setup === null) return { ids: [], currency };
    return { ids: zeroShareIdsOf({ sources: jointSourcesOf(facts), currency, members, row, defaults, setup }), currency };
  }, [facts, currency, members, row, defaults, setup]);
}
