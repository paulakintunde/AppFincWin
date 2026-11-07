// 06-12 (GRW-01..03): the goals read model. Built on the Grow connection points (goalPointsOf, safetyNetPointOf) so Grow and
// Decide show the same saved figures from the same rows. Derived numbers only; nothing here is stored in the cache.
import { useCallback, useMemo } from 'react';
import { convertLatest } from '@/data/queries/fxConvert';
import { useGoalLines, useSavingsGoalRows } from '@/data/queries/growGoals';
import type { TransactionRow } from '@/db/rows';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { usePastContext, type PastContext } from '@/features/decide/past/usePastDecisions';
import { planFromMonthly } from './goalPlanModel';
import { goalPointsOf, safetyNetPointOf, type GoalPoint, type SafetyNetPoint, type ToHome } from '../connect';

export type GoalsStatus = 'loading' | 'error' | 'ready';

export interface GoalsModel {
  /** The flagged goal, or null when the user has none. */
  safetyNet: SafetyNetPoint | null;
  /** Live goals (not the safety net), oldest first. */
  goals: GoalPoint[];
  /** Home-currency minor units: the safety net plus every goal. */
  totalSaved: number;
  /** Home-currency minor units a month the goals and the safety net are set to receive. */
  monthlyIntoGoals: number;
  /** D-07: the migrated net has not been confirmed yet and has something worth confirming (a size or a saved amount). */
  needsNetConfirm: boolean;
  /** D-32: Expected lines dated on or before today still waiting for a confirm, by goal id (the safety net included). */
  pendingByGoal?: Record<string, number>;
  /** Listed goals only (the safety net is not counted). */
  goalCount?: number;
  /** True when the safety net exists and its saved amount is inside totalSaved. */
  netCounted?: boolean;
  /** YYYY-MM-DD the net reaches its size at its monthly amount, or null when either is missing. */
  netReachesOn?: string | null;
}

export interface GoalsRead {
  status: GoalsStatus;
  model: GoalsModel;
  refetch: () => void;
  userId: string | null;
  householdId: string | null;
  today: string;
}

export const EMPTY_GOALS_MODEL: GoalsModel = { safetyNet: null, goals: [], totalSaved: 0, monthlyIntoGoals: 0, needsNetConfirm: false, pendingByGoal: {}, goalCount: 0, netCounted: false, netReachesOn: null };

/** Pure: the model from the rows and the goal-tagged lines. A goal whose money cannot convert is left out (never guessed). */
export function buildGoalsModel(
  rows: readonly SavingsGoalRow[],
  lines: readonly TransactionRow[],
  toHome: ToHome,
  home: string,
  today?: string
): GoalsModel {
  const safetyNet = safetyNetPointOf(rows, lines, toHome, home);
  const goals = goalPointsOf(rows, lines, toHome);
  let totalSaved = safetyNet === null ? 0 : safetyNet.saved;
  let monthlyIntoGoals = 0;
  for (const g of goals) {
    totalSaved += g.saved;
    monthlyIntoGoals += g.monthlyAmount ?? 0;
  }
  if (safetyNet !== null) {
    const net = rows.find((r) => r.id === safetyNet.goalId);
    if (net !== undefined && net.monthly_amount !== null) monthlyIntoGoals += toHome(net.monthly_amount, net.currency) ?? 0;
  }
  const needsNetConfirm = safetyNet !== null && safetyNet.confirmedAt === null && (safetyNet.size !== null || safetyNet.saved > 0);
  const pendingByGoal: Record<string, number> = {};
  for (const l of lines) {
    if (l.goal_id == null || l.status !== 'pending' || l.deleted_at !== null || (today !== undefined && l.local_date > today)) continue;
    pendingByGoal[l.goal_id] = (pendingByGoal[l.goal_id] ?? 0) + 1;
  }
  let netReachesOn: string | null = null;
  if (today !== undefined && safetyNet !== null && safetyNet.size !== null && safetyNet.size > 0) {
    const net = rows.find((r) => r.id === safetyNet.goalId);
    const monthly = net === undefined || net.monthly_amount === null ? 0 : (toHome(net.monthly_amount, net.currency) ?? 0);
    if (monthly > 0) netReachesOn = planFromMonthly({ saved: safetyNet.saved, target: safetyNet.size, monthly, today }).reachesOn;
  }
  return { safetyNet, goals, totalSaved, monthlyIntoGoals, needsNetConfirm, pendingByGoal, goalCount: goals.length, netCounted: safetyNet !== null, netReachesOn };
}

export function toHomeOf(ctx: PastContext): ToHome {
  return (amount, currency) => {
    if (amount === 0 || currency === ctx.home) return amount;
    return convertLatest(amount, currency, ctx.home, ctx.rates, ctx.customs, ctx.today)?.amount ?? null;
  };
}

export function useGoalsRead(): GoalsRead {
  const { userId, householdId, today, ctx } = usePastContext();
  const query = useSavingsGoalRows(userId ?? undefined, householdId ?? undefined);
  const rows = query.data;
  const ids = useMemo(() => (rows === undefined ? [] : rows.filter((r) => r.deleted_at === null).map((r) => r.id)), [rows]);
  const linesQuery = useGoalLines(householdId, ids);
  const lines = linesQuery.data;

  const model = useMemo(
    () => (rows === undefined ? EMPTY_GOALS_MODEL : buildGoalsModel(rows, lines ?? [], toHomeOf(ctx), ctx.home, today)),
    [rows, lines, ctx, today]
  );
  const refetch = useCallback(() => {
    void query.refetch();
    if (ids.length > 0) void linesQuery.refetch();
  }, [query, linesQuery, ids.length]);

  const linesReady = ids.length === 0 || lines !== undefined;
  const status: GoalsStatus = query.isError || linesQuery.isError ? 'error' : rows !== undefined && linesReady ? 'ready' : 'loading';
  return { status, model, refetch, userId, householdId, today };
}
