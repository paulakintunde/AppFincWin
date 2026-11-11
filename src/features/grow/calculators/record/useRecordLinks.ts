// 06-19: the "With your records" links on the Calculators page. A link exists only for a record that exists: the first goal with a
// target, the first open debt with a rate, and investing when there are holdings. With none, the list is empty and the page
// draws no section. Read-only; the figures are formatted, not worked out, here.
import type { Href } from 'expo-router';
import { useSavingsGoalRows } from '@/data/queries/growGoals';
import { useT } from '@/i18n';
import { useDebtFormat } from '@/features/grow/debts/debtScreenData';
import { useDebtsRead } from '@/features/grow/debts/useDebtsRead';
import { useGoalsRead } from '@/features/grow/goals/useGoalsRead';
import { useInvestingRead } from '@/features/grow/investing/useInvestingRead';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { useCalcFormat } from '../typed/CalcFields';
import type { RecordLink } from '../typed/CalculatorsScreen';

export function useRecordLinks(): RecordLink[] {
  const t = useT() as (key: string, params?: Record<string, string | number>) => string;
  const calc = useCalcFormat();
  const money = useDebtFormat();
  const goals = useGoalsRead();
  const debts = useDebtsRead();
  const investing = useInvestingRead();
  const goalRows = useSavingsGoalRows(goals.userId ?? undefined, goals.householdId ?? undefined).data;
  const links: RecordLink[] = [];

  // P3-WR-13: the goal calculator works in the home currency, so only a goal kept in it gets a link (never a dead one).
  const homeGoalIds = new Set((goalRows ?? []).filter((r) => r.deleted_at === null && r.currency === calc.currency).map((r) => r.id));
  const goal = goals.model.goals.find((g) => homeGoalIds.has(g.id) && g.target !== null && g.target > 0 && g.saved < g.target);
  if (goal !== undefined && goal.target !== null) {
    links.push({
      key: 'goal',
      glyph: 'calendar',
      label: t('grow.calc.page.recordGoal', { name: goal.name }),
      sublabel: t('grow.calc.page.recordGoalSub', {
        saved: money.money(goal.saved, calc.currency),
        target: money.money(goal.target, calc.currency),
        monthly: money.money(goal.monthlyAmount ?? 0, calc.currency),
      }),
      onPress: () => pushOnce(`/grow/calculators/goal/${goal.id}` as Href),
    });
  }

  const debt = debts.model.debts.find((d) => d.point.apr !== null && d.point.apr > 0n && d.point.balance > 0 && !d.point.paidInFull);
  if (debt !== undefined) {
    links.push({
      key: 'debt',
      glyph: 'debt',
      label: t('grow.calc.page.recordDebt', { name: debt.name }),
      sublabel: t('grow.calc.page.recordDebtSub', {
        owed: money.money(debt.point.balance, debt.currency),
        payment: money.money(debt.point.minimum, debt.currency),
      }),
      onPress: () => pushOnce(`/grow/calculators/debt/${debt.id}` as Href),
    });
  }

  if (investing.model.holdings.length > 0 && investing.model.totals.value > 0) {
    links.push({
      key: 'growth',
      glyph: 'invest',
      label: t('grow.calc.page.recordGrowth'),
      sublabel: t('grow.calc.page.recordGrowthSub', {
        value: money.money(investing.model.totals.value, calc.currency),
        monthly: money.money(investing.model.monthlyIn, calc.currency),
      }),
      onPress: () =>
        pushOnce({
          pathname: '/grow/calculators/illustration',
          params: { start: String(investing.model.totals.value), monthly: String(investing.model.monthlyIn) },
        } as Href),
    });
  }
  return links;
}
