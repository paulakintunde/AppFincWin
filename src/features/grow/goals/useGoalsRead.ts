// 06-12 (GRW-01..03): the goals read model. Built on the Grow connection points (goalPointsOf, safetyNetPointOf) so Grow and
// Decide show the same saved figures from the same rows. Derived numbers only; nothing here is stored in the cache.
import { useCallback, useMemo } from 'react';
import { convertLatest } from '@/data/queries/fxConvert';
import { useGoalLines, useSavingsGoalRows } from '@/data/queries/growGoals';
import type { TransactionRow } from '@/db/rows';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { usePastContext, type PastContext } from '@/features/decide/past/usePastDecisions';
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
}

export interface GoalsRead {
  status: GoalsStatus;
  model: GoalsModel;
  refetch: () => void;
  userId: string | null;
  householdId: string | null;
  today: string;
}

export const EMPTY_GOALS_MODEL: GoalsModel = { safetyNet: null, goals: [], totalSaved: 0, monthlyIntoGoals: 0, needsNetConfirm: false };

/** Pure: the model from the rows and the goal-tagged lines. A goal whose money cannot convert is left out (never guessed). */
export function buildGoalsModel(
  rows: readonly SavingsGoalRow[],
  lines: readonly TransactionRow[],
  toHome: ToHome,
  home: string
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
  return { safetyNet, goals, totalSaved, monthlyIntoGoals, needsNetConfirm };
}

function toHomeOf(ctx: PastContext): ToHome {
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
    () => (rows === undefined ? EMPTY_GOALS_MODEL : buildGoalsModel(rows, lines ?? [], toHomeOf(ctx), ctx.home)),
    [rows, lines, ctx]
  );
  const refetch = useCallback(() => {
    void query.refetch();
    if (ids.length > 0) void linesQuery.refetch();
  }, [query, linesQuery, ids.length]);

  const linesReady = ids.length === 0 || lines !== undefined;
  const status: GoalsStatus = query.isError || linesQuery.isError ? 'error' : rows !== undefined && linesReady ? 'ready' : 'loading';
  return { status, model, refetch, userId, householdId, today };
}
