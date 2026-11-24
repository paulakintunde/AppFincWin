// 07-07 (D-18): the Just me / Household switch for Insights. Same rule as Home: shown only with 2+ members.
import { useHousehold, useHouseholdMembers } from '@/data/queries/household';
import type { FigureScope } from '@/data/queries/figureScope';
import { useFigureScope } from '@/features/home/useFigureScope';
import { useRecordContext } from '@/features/record/useRecordContext';

export interface InsightsScope {
  scope: FigureScope;
  setScope: (s: FigureScope) => void;
  showScope: boolean;
  /** The currency the figures are in: the household currency in Household scope, else home. */
  currency: string;
  /** The household reporting currency (what the Household prepared is built in). */
  householdCurrency: string;
  householdId: string | null;
  userId: string | null;
  today: string;
}

export function useInsightsScope(): InsightsScope {
  const rc = useRecordContext();
  const [chosen, setScope] = useFigureScope('insights');
  const members = useHouseholdMembers(rc.householdId).data;
  const showScope = (members?.length ?? 0) >= 2;
  const scope: FigureScope = showScope ? chosen : 'mine';
  const householdCurrency = useHousehold(rc.householdId).data?.reporting_currency ?? rc.homeCurrency;
  const currency = scope === 'household' ? householdCurrency : rc.homeCurrency;
  return { scope, setScope, showScope, currency, householdCurrency, householdId: rc.householdId, userId: rc.userId, today: rc.today };
}
