// 08.1-23 (owner 2026-11-21, Q5 addition): this month's shared money for the set-shares editor's money hint, in minor units of the
// household's Decide currency. Built from plan 22's reads: the viewer's own personal-only figure (the same one the partner figure
// publishes, before rounding), each partner's shared figure and the joint accounts' true balances. Null when there is no figure.
import { useMemo } from 'react';
import { useDecideV3 } from '@/data/queries/decideV3';
import { useJointAccountFacts } from '@/data/queries/jointAccounts';
import { usePartnerMoneyTotals } from '@/data/queries/partnerMoney';
import { monthPicture } from '@/engine/month';
import { jointSourcesOf } from '../decide/scopeSource';
import { personalPrepared } from '../decide/usePublishPartnerFigure';
import { sharedMoneyTotal } from './spendRuleView';
import { useToday } from './useSpendRule';

export interface SharedMoney {
  readonly total: number | null;
  readonly currency: string | null;
}

export function useSharedMoney(householdId: string | null | undefined, viewerId: string | null | undefined, otherIds: readonly string[]): SharedMoney {
  const today = useToday();
  const { prepared } = useDecideV3();
  const totals = usePartnerMoneyTotals(viewerId ?? undefined, otherIds, otherIds.length > 0);
  const facts = useJointAccountFacts(householdId, today).data;
  const totalsKey = totals.map((q) => `${q.dataUpdatedAt}:${q.status}`).join(',');
  return useMemo(() => {
    if (prepared === null) return { total: null, currency: null };
    const currency = prepared.inputs.currency as string;
    const own = Number(monthPicture(personalPrepared(prepared)).leftAfterPlans);
    const partners = totals.flatMap((q) => (q.data !== undefined && q.data.ok ? [{ left: q.data.rounded_left, currency: q.data.currency }] : []));
    return { total: sharedMoneyTotal({ own, partners, joint: jointSourcesOf(facts), currency }), currency };
    // totals is rebuilt each render; totalsKey stands for its data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepared, totalsKey, facts]);
}
