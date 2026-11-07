// 06-12: client side of save_goal_plan, confirm_goal_contribution and set_safety_net (06-06, migration 20261106000200).
// JSON-only payloads: every money field is an integer minor-unit number.
//
// save_goal_plan(p_goal, p_expected_version, p_series, p_undo_step)
//   -> { status: 'applied' | 'already-applied' | 'conflict', goal_id, goal_version, series_id, series_version, undo_step_id }
//   p_expected_version null inserts; p_series null STOPS the goal's live monthly record, an object starts or updates it.
//   The series amount is a positive monthly figure (the server stores it as money out of the paid-from account).
// confirm_goal_contribution(p_transaction_id, p_expected_version, p_in_leg, p_undo_step)
//   -> { status: 'applied' | 'already-applied' | 'conflict', ... }
// set_safety_net(p_goal_id, p_expected_versions, p_undo_step)
//   -> { status: 'applied' | 'already-applied' | 'unchanged' | 'conflict', ... } (the undo step is built server-side)
//
// All three RPCs build their undo step's ops on the server from what they wrote (06-06 follow-up): p_undo_step is only
// { id, label_key, label_params: { name } }. So Undo of a new goal also removes its monthly record and Expected lines,
// and Undo of a confirmation matches the branch the server took (paired or single line).

import { DbError, VersionConflictError, toDbError, type WriteEntity } from './errors';
import { BAD_RESPONSE } from './recurringSeries';
import type { DbClient } from './rows';
import type { NewGoal, SavingsGoalRow } from './savingsGoals';

/** The goal fields save_goal_plan reads. An insert carries the whole NewGoal; an edit names only what changes (and the id). */
export type GoalPlanGoal = Pick<NewGoal, 'id'> &
  Partial<Omit<NewGoal, 'id' | 'kind'>> & { color_key?: SavingsGoalRow['color_key'] };

const GOAL_PLAN_GOAL_KEYS = [
  'id',
  'household_id',
  'name',
  'currency',
  'target',
  'ready_by',
  'monthly_amount',
  'opening_saved',
  'account_id',
  'locked',
  'icon',
  'color_key',
  'is_safety_net',
  'up_front_only',
  'check_id',
  'protect',
] as const satisfies readonly (keyof GoalPlanGoal)[];

/** The monthly record of a goal. `amount` is the positive monthly figure. */
export interface GoalPlanSeries {
  id: string;
  account_id: string;
  amount: number;
  anchor_date: string;
  time_zone: string;
  name: string;
  category_id: string | null;
}

/** The labels save_goal_plan accepts: goalMade (insert), safetyNetSizeSaved (insert of the net), goalPlanChanged (edit). */
export type GoalPlanLabel = 'goalMade' | 'safetyNetSizeSaved' | 'goalPlanChanged';

export interface SaveGoalPlanInput {
  goal: GoalPlanGoal;
  /** null inserts the goal; otherwise the version the edit was made against. */
  expectedVersion: number | null;
  /** null stops the live monthly record; an object starts or changes it. */
  series: GoalPlanSeries | null;
  /** The server builds the step's ops; the client names the step, its label and the label parameter. */
  undoStep: { id: string; labelKey: GoalPlanLabel; name: string };
}

export interface SaveGoalPlanResult {
  status: 'applied' | 'already-applied';
  goalId: string | null;
  goalVersion: number | null;
  seriesId: string | null;
  seriesVersion: number | null;
  undoStepId: string;
}

function rec(data: unknown, fn: string): Record<string, unknown> {
  if (typeof data !== 'object' || data === null) throw new DbError(`${fn} response: not an object`, BAD_RESPONSE, null);
  return data as Record<string, unknown>;
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) ? v : null;
}
function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function undoIdOf(r: Record<string, unknown>, fn: string): string {
  const id = r.undo_step_id;
  if (typeof id !== 'string' || id.length === 0) throw new DbError(`${fn} response: no undo step id`, BAD_RESPONSE, null);
  return id;
}

function conflict(entity: WriteEntity, id: string): VersionConflictError {
  // The RPC reports a bare 'conflict' (no server row): the caller refetches.
  return new VersionConflictError(entity, id, null);
}

export async function saveGoalPlan(client: DbClient, input: SaveGoalPlanInput): Promise<SaveGoalPlanResult> {
  const { goal, expectedVersion, series } = input;
  const keys = Object.keys(goal);
  for (const k of keys) {
    if (!(GOAL_PLAN_GOAL_KEYS as readonly string[]).includes(k)) throw new TypeError(`saveGoalPlan: "${k}" is not a goal plan field`);
  }
  if (series !== null && (!Number.isSafeInteger(series.amount) || series.amount < 1)) {
    throw new RangeError('saveGoalPlan: the monthly amount must be a positive integer');
  }
  const { data, error, status } = await client.rpc('save_goal_plan', {
    p_goal: goal,
    p_expected_version: expectedVersion,
    p_series: series,
    p_undo_step: { id: input.undoStep.id, label_key: input.undoStep.labelKey, label_params: { name: input.undoStep.name } },
  });
  if (error) throw toDbError(error, status);
  const r = rec(data, 'save_goal_plan');
  if (r.status === 'conflict') throw conflict('savings_goals', goal.id);
  if (r.status !== 'applied' && r.status !== 'already-applied') {
    throw new DbError(`save_goal_plan response: unrecognised ${JSON.stringify(r.status)}`, BAD_RESPONSE, null);
  }
  return {
    status: r.status,
    goalId: strOrNull(r.goal_id),
    goalVersion: numOrNull(r.goal_version),
    seriesId: strOrNull(r.series_id),
    seriesVersion: numOrNull(r.series_version),
    undoStepId: undoIdOf(r, 'save_goal_plan'),
  };
}

export interface ConfirmGoalContributionInput {
  transactionId: string;
  expectedVersion: number;
  /** The new goal-side leg (ids minted by the client so a replay never doubles it); null when the line just becomes paid. */
  inLeg: { id: string; transfer_id: string } | null;
  /** The server builds the step's ops from the branch it took; the client names the step and the label parameter. */
  undoStep: { id: string; name: string };
}

export interface ConfirmGoalContributionResult {
  status: 'applied' | 'already-applied';
  transactionVersion: number | null;
  inLegId: string | null;
  inLegVersion: number | null;
  undoStepId: string;
}

export async function confirmGoalContribution(client: DbClient, input: ConfirmGoalContributionInput): Promise<ConfirmGoalContributionResult> {
  const { data, error, status } = await client.rpc('confirm_goal_contribution', {
    p_transaction_id: input.transactionId,
    p_expected_version: input.expectedVersion,
    p_in_leg: input.inLeg,
    p_undo_step: { id: input.undoStep.id, label_key: 'goalContributionConfirmed', label_params: { name: input.undoStep.name } },
  });
  if (error) throw toDbError(error, status);
  const r = rec(data, 'confirm_goal_contribution');
  if (r.status === 'conflict') throw conflict('transactions', input.transactionId);
  if (r.status !== 'applied' && r.status !== 'already-applied') {
    throw new DbError(`confirm_goal_contribution response: unrecognised ${JSON.stringify(r.status)}`, BAD_RESPONSE, null);
  }
  return {
    status: r.status,
    transactionVersion: numOrNull(r.transaction_version),
    inLegId: strOrNull(r.in_leg_id),
    inLegVersion: numOrNull(r.in_leg_version),
    undoStepId: undoIdOf(r, 'confirm_goal_contribution'),
  };
}

export interface SetSafetyNetInput {
  goalId: string;
  /** goal id -> the version the caller saw, for the target and for the current net (if any). */
  expectedVersions: Readonly<Record<string, number>>;
  /** The server builds the step's ops; the client only names the step and the label parameter. */
  undoStep: { id: string; name: string };
}

export interface SetSafetyNetResult {
  status: 'applied' | 'already-applied' | 'unchanged';
  goalId: string | null;
  previousGoalId: string | null;
  goalVersion: number | null;
  previousVersion: number | null;
  undoStepId: string | null;
}

export async function setSafetyNet(client: DbClient, input: SetSafetyNetInput): Promise<SetSafetyNetResult> {
  const { data, error, status } = await client.rpc('set_safety_net', {
    p_goal_id: input.goalId,
    p_expected_versions: input.expectedVersions,
    p_undo_step: { id: input.undoStep.id, label_key: 'safetyNetChanged', label_params: { name: input.undoStep.name } },
  });
  if (error) throw toDbError(error, status);
  const r = rec(data, 'set_safety_net');
  if (r.status === 'conflict') throw conflict('savings_goals', input.goalId);
  if (r.status !== 'applied' && r.status !== 'already-applied' && r.status !== 'unchanged') {
    throw new DbError(`set_safety_net response: unrecognised ${JSON.stringify(r.status)}`, BAD_RESPONSE, null);
  }
  return {
    status: r.status,
    goalId: strOrNull(r.goal_id),
    previousGoalId: strOrNull(r.previous_goal_id),
    goalVersion: numOrNull(r.goal_version),
    previousVersion: numOrNull(r.previous_version),
    undoStepId: strOrNull(r.undo_step_id),
  };
}
