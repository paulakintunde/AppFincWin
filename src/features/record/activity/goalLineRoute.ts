// P5-CR-01: how a pending line is marked paid when it may belong to a goal.
//  - 'plain'    : not a goal line; the ordinary markPaid.
//  - 'goal'     : a goal line whose goal is on this device (live or done); it goes through the goal confirm
//                 (useGoalLinePay), so the goal grows once. While the goal list is still loading or refreshing the route is
//                 'goal' too, and the confirm path shows its "not loaded yet" hint without writing anything.
//  - 'goalGone' : the goal list has loaded and settled and the line's goal is not in it (the goal was removed). The confirm
//                 RPC refuses a removed goal, so the line is marked paid as a plain line instead: the money did leave the
//                 account, and nothing is added to a goal that no longer exists. The caller says so in the toast.
import { useCallback, useContext } from 'react';
import { QueryClientContext } from '@tanstack/react-query';
import { queryKeys } from '@/data/keys';
import { goalIdOfLine, type GoalLineFields } from '@/features/grow/goals/goalLine';

export type GoalLineRoute = { kind: 'plain' } | { kind: 'goal'; goalId: string } | { kind: 'goalGone' };

const PLAIN: GoalLineRoute = { kind: 'plain' };
const GONE: GoalLineRoute = { kind: 'goalGone' };

/**
 * `goals` is the household's not-deleted goals, or undefined while they are loading or refreshing (so a goal made on
 * another device is never mistaken for a removed one).
 */
export function goalLineRoute(
  row: GoalLineFields,
  seriesById: ReadonlyMap<string, { goal_id?: string | null }> | undefined,
  goals: readonly { id: string }[] | undefined
): GoalLineRoute {
  const goalId = goalIdOfLine(row, seriesById);
  if (goalId === null) return PLAIN;
  if (goals === undefined || goals.some((g) => g.id === goalId)) return { kind: 'goal', goalId };
  return GONE;
}

/**
 * The route with this household's goals read at tap time from the query cache that useGoalLinePay keeps (the same
 * savings-goals key). Only settled data counts: nothing cached, or a fetch in flight, routes to the goal confirm, which
 * shows its not-ready hint. Reading the cache, not a second query, keeps the data layer out of this module.
 */
export function useGoalLineRoute(
  ownerId: string | null,
  householdId: string | null
): (row: GoalLineFields, seriesById?: ReadonlyMap<string, { goal_id?: string | null }>) => GoalLineRoute {
  const client = useContext(QueryClientContext);
  return useCallback(
    (row, seriesById) => {
      let goals: readonly { id: string }[] | undefined;
      if (client !== undefined && ownerId !== null && householdId !== null) {
        const state = client.getQueryState<readonly { id: string }[]>(queryKeys.savingsGoals(ownerId, householdId));
        if (state !== undefined && state.status === 'success' && state.fetchStatus === 'idle') goals = state.data;
      }
      return goalLineRoute(row, seriesById, goals);
    },
    [client, ownerId, householdId]
  );
}
