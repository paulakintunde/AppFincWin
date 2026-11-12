// 06-12 (GRW-01..03): queued writes for Grow's goals and the safety net. Same shape as debts.ts: paused-mutation defaults
// registered once at start (so a restored queue has code to run), optimistic cache, ONE undo step per action, a version
// conflict parked in the failed-writes list. Variables are plain JSON; failed-write records carry ids and field names only,
// never a goal name or an amount (privacy).
//
//   useSaveGoalPlan            make a goal (or change its plan) with its optional monthly record: save_goal_plan, one step
//   useEditGoal                patch fields of a goal (and remove one): direct version-conditional update, one step
//   useMoveGoalMoney           Add money / Take some out: both transfer legs in ONE batch insert, one step
//   useConfirmGoalContribution an Expected goal line becomes real: confirm_goal_contribution, one step
//   useConfirmSafetyNet        D-07 "Looks right" stamp on the migrated net, one step
//   useSetSafetyNet            D-29 "Use as my safety net": atomic swap, the server builds the one step
import * as Crypto from 'expo-crypto';
import { useMutation, useMutationState } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { localDateIn, monthOf } from '@/engine/time';
import { buildTransferLegs } from '@/engine/transfer';
import { buildStep, inverseOfInserts, inverseOfPatches, type PatchValue } from '@/engine/undo';
import { VersionConflictError } from '@/db/errors';
import {
  confirmGoalContribution,
  removeGoal,
  saveGoalPlan,
  setSafetyNet,
  type GoalPlanGoal,
  type GoalPlanSeries,
} from '@/db/goalPlan';
import type { NewTransaction, TransactionRow } from '@/db/rows';
import { updateSavingsGoal, type SavingsGoalPatch, type SavingsGoalRow } from '@/db/savingsGoals';
import { fetchTransactionVersions, insertTransactionsBatch } from '@/db/transactions';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import type { WithPending } from '@/data/types';
import { classifySettledWriteError, settledWriteErrorCode, shouldRetryWrite, writeRetryDelay } from '@/data/sync/writeErrors';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { guardSession, markSession } from '@/data/sync/sessionEpoch';
import { recordWrittenVersion, resolveExpectedVersion } from '@/data/sync/versionChain';
import { goalSaved, type GoalLineSource, type ToHome } from '@/features/grow/connect';
import { getDeviceTimeZone } from '@/services/locale/deviceLocale';
import { writeClient } from './writeClient';
import { optimisticTransactionRow } from './batchInsert';
import { acceptIfAlreadyApplied, upsertRow } from './cacheRows';
import { invalidateDerivedReads, patchMonthCacheIfLoaded, placeRowInMonth } from './transactionCache';
import { newStepId, recordUndoStepSafely } from './undoCapture';

/** 06 review: remove_goal. Kept here, not in keys.ts, so the persisted-cache shape hash (check:cache-version) is unchanged. */
export const REMOVE_GOAL_KEY = ['savings-goals', 'remove-grow'] as const;

type GoalList = WithPending<SavingsGoalRow>[];
type TransactionList = WithPending<TransactionRow>[];

const MAX_MINOR = 10_000_000_000_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface GoalCacheKey {
  userId: string;
  householdId: string;
}

function patchGoals(qc: QueryClient, cache: GoalCacheKey, updater: (rows: GoalList) => GoalList): void {
  qc.setQueryData<GoalList>(queryKeys.savingsGoals(cache.userId, cache.householdId), (old) => updater(old ?? []));
}

function invalidateGoals(qc: QueryClient, cache: GoalCacheKey): void {
  void qc.invalidateQueries({ queryKey: queryKeys.savingsGoals(cache.userId, cache.householdId) });
}

/**
 * Refresh everything a goal action can change: the goals, the lines that count toward them, the monthly records and the
 * undo list. Call it after Undo of a Grow step too: undoing a step stored with system keys (set_safety_net, or a new
 * safety net made by save_goal_plan) does NOT bump row versions, so the screens refetch rather than assume version + 1.
 */
export function refreshGoalReads(qc: QueryClient, cache: GoalCacheKey): void {
  invalidateGoals(qc, cache);
  void qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(cache.householdId) });
  void qc.invalidateQueries({ queryKey: queryKeys.recurringSeries(cache.householdId) });
  void qc.invalidateQueries({ queryKey: queryKeys.undoLog(cache.userId) });
  invalidateDerivedReads(qc, cache.householdId);
}

/**
 * 06 review P4-WR-05: patch every loaded goal-lines query (queryKeys.goalLines) that covers `goalId`, or every one when
 * goalId is null. The goal screens take the saved figure and the history from these queries, not the month caches.
 */
async function patchGoalLines(
  qc: QueryClient,
  householdId: string,
  goalId: string | null,
  updater: (list: TransactionList) => TransactionList
): Promise<void> {
  const prefix = queryKeys.goalLines(householdId, '').slice(0, 3);
  await qc.cancelQueries({ queryKey: prefix });
  for (const [key, data] of qc.getQueriesData<TransactionList>({ queryKey: prefix })) {
    if (data === undefined) continue;
    const ids = typeof key[3] === 'string' ? key[3].split(',') : [];
    if (goalId !== null && !ids.includes(goalId)) continue;
    qc.setQueryData<TransactionList>(key, updater(data));
  }
}

function validName(name: string): boolean {
  const n = name.trim();
  return n.length >= 1 && n.length <= 80;
}
function validMinor(n: number): boolean {
  return Number.isSafeInteger(n) && n >= 0 && n <= MAX_MINOR;
}
function validPositive(n: number): boolean {
  return validMinor(n) && n >= 1;
}

interface GoalFieldChecks {
  name?: string;
  target?: number | null;
  monthly_amount?: number | null;
  opening_saved?: number;
  ready_by?: string | null;
}
function assertGoalFields(f: GoalFieldChecks, where: string): void {
  if (f.name !== undefined && !validName(f.name)) throw new RangeError(`${where}: name must be 1-80 characters`);
  if (f.target != null && !validPositive(f.target)) throw new RangeError(`${where}: target out of range`);
  if (f.monthly_amount != null && !validMinor(f.monthly_amount)) throw new RangeError(`${where}: monthly amount out of range`);
  if (f.opening_saved !== undefined && !validMinor(f.opening_saved)) throw new RangeError(`${where}: opening amount out of range`);
  if (f.ready_by != null && !DATE_RE.test(f.ready_by)) throw new RangeError(`${where}: ready-by must be a date`);
}

function pickBefore(row: SavingsGoalRow, keys: readonly string[]): Record<string, PatchValue> {
  const before: Record<string, PatchValue> = {};
  for (const k of keys) before[k] = ((row as unknown as Record<string, PatchValue | undefined>)[k] ?? null) as PatchValue;
  return before;
}

/** Records a failed write: ids and field names only. */
async function parkFailure(
  entity: 'savings_goals' | 'transactions',
  entityId: string,
  err: unknown,
  attempted: Record<string, unknown>,
  onRefresh: () => void
): Promise<void> {
  const cls = classifySettledWriteError(err);
  if (cls !== 'conflict' && cls !== 'rejected' && cls !== 'not-found') return;
  onRefresh();
  await recordFailedWrite({
    entity,
    entityId,
    kind: cls,
    code: cls === 'conflict' ? 'version-conflict' : settledWriteErrorCode(err),
    attempted,
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Make a goal / change its plan (save_goal_plan)
// ---------------------------------------------------------------------------------------------------------------------

type SavePlanLabel = 'goalMade' | 'safetyNetSizeSaved' | 'goalPlanChanged';

export interface SaveGoalPlanVars {
  ownerId: string;
  cache: GoalCacheKey;
  goal: GoalPlanGoal;
  /** null inserts the goal; otherwise the version the edit was made against. */
  expectedVersion: number | null;
  series: GoalPlanSeries | null;
  labelKey: SavePlanLabel;
  name: string;
  stepId: string;
}

/** What a new goal is made of. `locked` is REQUIRED (D-23): the user answers "keep this money out of Decide's answers?" with no default. */
export interface NewGoalFields {
  name: string;
  currency: string;
  locked: boolean;
  target: number | null;
  ready_by: string | null;
  monthly_amount: number | null;
  opening_saved: number;
  account_id?: string | null;
  icon?: SavingsGoalRow['icon'];
  color_key?: SavingsGoalRow['color_key'];
  up_front_only?: boolean;
  /** Insert only. The Decide check this goal was made from (BO-07). */
  check_id?: string;
  protect?: boolean;
  /** Insert only. A safety net is always Locked, so true with locked false is refused. */
  is_safety_net?: boolean;
}

/** What an existing goal's plan may change here. The safety-net flag is never part of an edit (only set_safety_net flags a goal). */
export type EditGoalPlanFields = Partial<
  Pick<NewGoalFields, 'name' | 'target' | 'ready_by' | 'monthly_amount' | 'opening_saved' | 'account_id' | 'icon' | 'color_key' | 'up_front_only' | 'protect' | 'locked'>
>;
const EDIT_PLAN_KEYS = ['name', 'target', 'ready_by', 'monthly_amount', 'opening_saved', 'account_id', 'icon', 'color_key', 'up_front_only', 'protect', 'locked'] as const;

export type SaveGoalPlanInput =
  | { ownerId: string; householdId: string; existing?: undefined; fields: NewGoalFields; series: GoalPlanSeries | null }
  | { ownerId: string; householdId?: undefined; existing: SavingsGoalRow; fields: EditGoalPlanFields; series: GoalPlanSeries | null };

function assertSeries(series: GoalPlanSeries | null): void {
  if (series === null) return;
  if (!validPositive(series.amount)) throw new RangeError('save goal plan: monthly amount out of range');
  if (!DATE_RE.test(series.anchor_date)) throw new RangeError('save goal plan: anchor date must be a date');
}

export function registerGrowGoalMutations(qc: QueryClient): void {
  registerSavePlan(qc);
  registerPatchMutations(qc);
  registerRemoveGoal(qc);
  registerMoveMoney(qc);
  registerConfirmContribution(qc);
  registerSetSafetyNet(qc);
}

function registerSavePlan(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.saveGoalPlan, {
    mutationFn: (vars: SaveGoalPlanVars) =>
      guardSession(vars, async () => {
        const insert = vars.expectedVersion === null;
        const expected = insert ? null : resolveExpectedVersion('savings_goals', vars.goal.id, vars.expectedVersion as number);
        // The server builds the one Undo step from what it wrote (06-06 follow-up): the goal AND its monthly record with
        // its Expected lines, so Undo of a new goal leaves nothing behind and Undo of an edit puts the old record back.
        const client = await writeClient();
        const res = await saveGoalPlan(client, {
          goal: vars.goal,
          expectedVersion: expected,
          series: vars.series,
          undoStep: { id: vars.stepId, labelKey: vars.labelKey, name: vars.name },
        });
        if (expected !== null && res.goalVersion !== null) {
          recordWrittenVersion('savings_goals', vars.goal.id, [vars.expectedVersion as number, expected], res.goalVersion);
        }
        return res;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: SaveGoalPlanVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.savingsGoals(vars.cache.userId, vars.cache.householdId) });
      const g = vars.goal;
      if (vars.expectedVersion === null) {
        const now = new Date().toISOString();
        const flag = g.is_safety_net === true;
        const optimistic: WithPending<SavingsGoalRow> = {
          id: g.id,
          household_id: vars.cache.householdId,
          created_by: vars.ownerId,
          check_id: g.check_id ?? null,
          name: (g.name ?? '').trim(),
          currency: g.currency ?? '',
          target: g.target ?? null,
          monthly_amount: g.monthly_amount ?? null,
          ready_by: g.ready_by ?? null,
          opening_saved: g.opening_saved ?? 0,
          kind: 'pot',
          bucket: null,
          account_id: g.account_id ?? null,
          color_key: g.color_key ?? null,
          is_safety_net: flag,
          locked: g.locked === true || flag,
          protect: g.protect ?? true,
          up_front_only: g.up_front_only ?? false,
          icon: g.icon ?? null,
          // 06-32 (audit 4.2): a net the user makes here is confirmed from the start, so "We moved your safety net here"
          // never shows for it. Client half only: save_goal_plan keeps its own key list and does not store this column
          // yet, so the server row reads null after the refetch until the RPC sets it (see 06-32-SUMMARY, owner decision).
          net_confirmed_at: flag ? now : null,
          done_at: null,
          is_sample: false,
          deleted_at: null,
          version: 1,
          created_at: now,
          updated_at: now,
          pending: true,
        };
        patchGoals(qc, vars.cache, (rows) => upsertRow(rows, optimistic, 'end'));
      } else {
        const { id, ...changes } = g;
        patchGoals(qc, vars.cache, (rows) => rows.map((r) => (r.id === id ? ({ ...r, ...changes, pending: true } as WithPending<SavingsGoalRow>) : r)));
      }
    },
    onSuccess: (_res: unknown, vars: SaveGoalPlanVars) => {
      refreshGoalReads(qc, vars.cache);
    },
    onError: async (err: unknown, vars: SaveGoalPlanVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'conflict' && cls !== 'rejected' && cls !== 'not-found') return;
      // An insert leaves the cache; an edit is put right by the refetch. Either way the failure is parked.
      if (vars.expectedVersion === null) patchGoals(qc, vars.cache, (rows) => rows.filter((r) => r.id !== vars.goal.id));
      await parkFailure('savings_goals', vars.goal.id, err, { labelKey: vars.labelKey, fields: Object.keys(vars.goal).length }, () =>
        refreshGoalReads(qc, vars.cache)
      );
    },
  });
}

/**
 * Make a goal, or change an existing goal's plan, with its optional monthly record, as one queued save and one Undo.
 * New goals: `fields.locked` is required. `series` null STOPS the goal's live monthly record, so an edit that leaves the
 * record alone must pass the existing one back. Returns the goal id and the undo step id.
 */
export function useSaveGoalPlan(): { save(input: SaveGoalPlanInput): { id: string; stepId: string } } {
  const mutation = useMutation<unknown, unknown, SaveGoalPlanVars>({ mutationKey: mutationKeys.saveGoalPlan, scope: WRITE_SCOPE });
  return {
    save(input) {
      assertSeries(input.series);
      const stepId = newStepId();
      if (input.existing === undefined) {
        const f = input.fields;
        assertGoalFields(f, 'make goal');
        if (!/^[A-Z0-9]{2,4}$/.test(f.currency)) throw new RangeError('make goal: currency must be a code');
        if (f.is_safety_net === true && f.locked !== true) throw new RangeError('safety-net-must-be-locked');
        const id = Crypto.randomUUID();
        const flag = f.is_safety_net === true;
        const goal: GoalPlanGoal = {
          id,
          household_id: input.householdId,
          name: f.name.trim(),
          currency: f.currency,
          locked: f.locked,
          target: f.target,
          ready_by: f.ready_by,
          monthly_amount: f.monthly_amount,
          opening_saved: f.opening_saved,
          account_id: f.account_id ?? null,
          ...(f.icon !== undefined ? { icon: f.icon } : {}),
          ...(f.color_key !== undefined ? { color_key: f.color_key } : {}),
          ...(f.up_front_only !== undefined ? { up_front_only: f.up_front_only } : {}),
          ...(f.check_id !== undefined ? { check_id: f.check_id } : {}),
          ...(f.protect !== undefined || flag ? { protect: f.protect ?? true } : {}),
          ...(flag ? { is_safety_net: true } : {}),
        };
        mutation.mutate({
          ownerId: input.ownerId,
          cache: { userId: input.ownerId, householdId: input.householdId },
          goal,
          expectedVersion: null,
          series: input.series,
          labelKey: flag ? 'safetyNetSizeSaved' : 'goalMade',
          name: goal.name as string,
          stepId,
        });
        return { id, stepId };
      }
      const row = input.existing;
      const f = input.fields;
      const keys = Object.keys(f);
      for (const k of keys) {
        if (!(EDIT_PLAN_KEYS as readonly string[]).includes(k)) throw new RangeError(`edit goal plan: ${k} is not editable here`);
      }
      assertGoalFields(f, 'edit goal plan');
      if (row.is_safety_net === true && f.locked === false) throw new RangeError('safety-net-must-be-locked');
      const goal: GoalPlanGoal = { id: row.id, ...(f.name !== undefined ? { name: f.name.trim() } : {}), ...omitName(f) };
      mutation.mutate({
        ownerId: input.ownerId,
        cache: { userId: input.ownerId, householdId: row.household_id },
        goal,
        expectedVersion: row.version,
        series: input.series,
        labelKey: 'goalPlanChanged',
        name: f.name !== undefined ? f.name.trim() : row.name,
        stepId,
      });
      return { id: row.id, stepId };
    },
  };
}

function omitName(f: EditGoalPlanFields): Omit<EditGoalPlanFields, 'name'> {
  const { name: _name, ...rest } = f;
  void _name;
  return rest;
}

// ---------------------------------------------------------------------------------------------------------------------
// Direct patches: edit / remove a goal, confirm the safety net ("Looks right")
// ---------------------------------------------------------------------------------------------------------------------

type PatchLabel = 'goalEdited' | 'goalRemoved' | 'safetyNetSizeSaved' | 'safetyNetConfirmed';

export interface PatchGoalVars {
  id: string;
  ownerId: string;
  cache: GoalCacheKey;
  expectedVersion: number;
  patch: SavingsGoalPatch;
  before: Record<string, PatchValue>;
  labelKey: PatchLabel;
  name: string;
  stepId: string;
}

export type EditableGoalPatch = Pick<SavingsGoalPatch, 'name' | 'target' | 'ready_by' | 'monthly_amount' | 'account_id' | 'locked' | 'icon' | 'protect' | 'up_front_only'>;
const EDITABLE_KEYS = ['name', 'target', 'ready_by', 'monthly_amount', 'account_id', 'locked', 'icon', 'protect', 'up_front_only'] as const;

function registerPatchMutations(qc: QueryClient): void {
  const defaults = {
    mutationFn: (vars: PatchGoalVars) =>
      guardSession(vars, async () => {
        const expected = resolveExpectedVersion('savings_goals', vars.id, vars.expectedVersion);
        const client = await writeClient();
        const row = await updateSavingsGoal(client, vars.id, expected, vars.patch).catch((err: unknown) =>
          acceptIfAlreadyApplied<SavingsGoalRow>(err, vars.patch)
        );
        recordWrittenVersion('savings_goals', vars.id, [vars.expectedVersion, expected], row.version);
        const step = buildStep(
          vars.stepId,
          vars.labelKey,
          { name: vars.name },
          inverseOfPatches('savings_goals', [{ id: row.id, before: vars.before, versionAfter: row.version }])
        );
        await recordUndoStepSafely(qc, client, step, vars.ownerId);
        return row;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: PatchGoalVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.savingsGoals(vars.cache.userId, vars.cache.householdId) });
      patchGoals(qc, vars.cache, (rows) =>
        vars.patch.deleted_at
          ? rows.filter((r) => r.id !== vars.id)
          : rows.map((r) => (r.id === vars.id ? { ...r, ...vars.patch, pending: true } : r))
      );
    },
    onSuccess: (row: SavingsGoalRow, vars: PatchGoalVars) => {
      patchGoals(qc, vars.cache, (rows) => (row.deleted_at ? rows.filter((r) => r.id !== row.id) : rows.map((r) => (r.id === row.id ? row : r))));
      refreshGoalReads(qc, vars.cache);
    },
    onError: async (err: unknown, vars: PatchGoalVars) => {
      const cls = classifySettledWriteError(err);
      if (cls === 'conflict' && err instanceof VersionConflictError) {
        const serverRow = err.serverRow as SavingsGoalRow | null;
        if (serverRow && typeof serverRow === 'object' && 'id' in serverRow) {
          patchGoals(qc, vars.cache, (rows) =>
            serverRow.deleted_at ? rows.filter((r) => r.id !== vars.id) : rows.map((r) => (r.id === vars.id ? serverRow : r))
          );
        }
      }
      await parkFailure('savings_goals', vars.id, err, { labelKey: vars.labelKey, fields: Object.keys(vars.patch) }, () =>
        invalidateGoals(qc, vars.cache)
      );
    },
  };
  qc.setMutationDefaults(mutationKeys.editGoal, defaults);
  qc.setMutationDefaults(mutationKeys.confirmSafetyNet, defaults);
}

/**
 * Edit fields of a goal, or remove it. A target below what is saved is refused ('target-below-saved'; `saved` is in the
 * goal's own currency). The safety net can never be unlocked. Returns the undo step id.
 */
export function useEditGoal(): {
  edit(goal: SavingsGoalRow, patch: EditableGoalPatch, ownerId: string, saved: number): string;
  remove(goal: SavingsGoalRow, ownerId: string): string;
} {
  const mutation = useMutation<SavingsGoalRow, unknown, PatchGoalVars>({ mutationKey: mutationKeys.editGoal, scope: WRITE_SCOPE });
  const removal = useMutation<unknown, unknown, RemoveGoalVars>({ mutationKey: REMOVE_GOAL_KEY, scope: WRITE_SCOPE });
  return {
    edit(goal, patch, ownerId, saved) {
      const keys = Object.keys(patch);
      if (keys.length === 0) throw new RangeError('edit goal: empty patch');
      for (const k of keys) {
        if (!(EDITABLE_KEYS as readonly string[]).includes(k)) throw new RangeError(`edit goal: ${k} is not editable here`);
      }
      assertGoalFields(patch, 'edit goal');
      if (patch.target != null && patch.target < saved) throw new RangeError('target-below-saved');
      if (goal.is_safety_net === true && patch.locked === false) throw new RangeError('safety-net-must-be-locked');
      const clean: EditableGoalPatch = patch.name !== undefined ? { ...patch, name: patch.name.trim() } : patch;
      const sizeOnly = goal.is_safety_net === true && keys.length === 1 && keys[0] === 'target';
      const stepId = newStepId();
      mutation.mutate({
        id: goal.id,
        ownerId,
        cache: { userId: ownerId, householdId: goal.household_id },
        expectedVersion: goal.version,
        patch: clean,
        before: pickBefore(goal, keys),
        labelKey: sizeOnly ? 'safetyNetSizeSaved' : 'goalEdited',
        name: clean.name ?? goal.name,
        stepId,
      });
      return stepId;
    },
    remove(goal, ownerId) {
      if (goal.deleted_at !== null) throw new RangeError('remove goal: already removed');
      const stepId = newStepId();
      // Owner decision 2026-11-10 (06 review P1-CR-03): one remove_goal call stops the monthly contribution and removes its
      // Expected lines with the goal, as one Undo. Paid lines stay.
      removal.mutate({
        id: goal.id,
        ownerId,
        cache: { userId: ownerId, householdId: goal.household_id },
        expectedVersion: goal.version,
        name: goal.name,
        stepId,
      });
      return stepId;
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Remove a goal (remove_goal): the goal, its monthly contribution and its unpaid Expected lines, one server-built step
// ---------------------------------------------------------------------------------------------------------------------

export interface RemoveGoalVars {
  id: string;
  ownerId: string;
  cache: GoalCacheKey;
  expectedVersion: number;
  name: string;
  stepId: string;
}

function registerRemoveGoal(qc: QueryClient): void {
  qc.setMutationDefaults(REMOVE_GOAL_KEY, {
    mutationFn: (vars: RemoveGoalVars) =>
      guardSession(vars, async () => {
        const expected = resolveExpectedVersion('savings_goals', vars.id, vars.expectedVersion);
        const client = await writeClient();
        const res = await removeGoal(client, { goalId: vars.id, expectedVersion: expected, undoStep: { id: vars.stepId, name: vars.name } });
        if (res.goalVersion !== null) recordWrittenVersion('savings_goals', vars.id, [vars.expectedVersion, expected], res.goalVersion);
        return res;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: RemoveGoalVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.savingsGoals(vars.cache.userId, vars.cache.householdId) });
      patchGoals(qc, vars.cache, (rows) => rows.filter((r) => r.id !== vars.id));
    },
    onSuccess: (_res: unknown, vars: RemoveGoalVars) => {
      // The series and its Expected lines changed on the server too.
      refreshGoalReads(qc, vars.cache);
    },
    onError: async (err: unknown, vars: RemoveGoalVars) => {
      await parkFailure('savings_goals', vars.id, err, { labelKey: 'goalRemoved', fields: ['deleted_at'] }, () => refreshGoalReads(qc, vars.cache));
    },
  });
}

/** D-07: the owner confirms the migrated safety net ("Looks right"). One step, 'safetyNetConfirmed'. Returns the step id. */
export function useConfirmSafetyNet(): { confirm(net: SavingsGoalRow, ownerId: string): string } {
  const mutation = useMutation<SavingsGoalRow, unknown, PatchGoalVars>({ mutationKey: mutationKeys.confirmSafetyNet, scope: WRITE_SCOPE });
  return {
    confirm(net, ownerId) {
      if (net.is_safety_net !== true) throw new RangeError('confirm safety net: not the safety net');
      const stepId = newStepId();
      mutation.mutate({
        id: net.id,
        ownerId,
        cache: { userId: ownerId, householdId: net.household_id },
        expectedVersion: net.version,
        patch: { net_confirmed_at: new Date().toISOString() },
        before: { net_confirmed_at: net.net_confirmed_at ?? null },
        labelKey: 'safetyNetConfirmed',
        name: net.name,
        stepId,
      });
      return stepId;
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Add money / Take some out
// ---------------------------------------------------------------------------------------------------------------------

export interface MoveGoalMoneyVars {
  householdId: string;
  ownerId: string;
  stepId: string;
  rows: NewTransaction[];
  goalId: string;
  labelName: string;
  homeCurrency: string;
}

type InsertedRow = Pick<TransactionRow, 'id' | 'local_date' | 'version' | 'rate_pending'>;

function registerMoveMoney(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.moveGoalMoney, {
    // Both legs in ONE upsert so the deferred pair check sees two rows at commit (D-50). The step follows, from the versions
    // the server returned; a replay of a landed insert returns no rows, so the legs are re-read and the step recorded once.
    mutationFn: (vars: MoveGoalMoneyVars) =>
      guardSession(vars, async () => {
        const client = await writeClient();
        let rows: InsertedRow[] = await insertTransactionsBatch(client, vars.rows);
        if (rows.length !== vars.rows.length) {
          const ids = vars.rows.map((r) => r.id);
          const current = await fetchTransactionVersions(client, vars.householdId, ids);
          const legs = ids.map((id) => current.find((r) => r.id === id));
          if (legs.every((l) => l !== undefined && l.version === 1 && l.deleted_at === null)) {
            rows = legs.map((l) => ({ id: l!.id, local_date: l!.local_date, version: l!.version, rate_pending: l!.rate_pending }));
          }
        }
        if (rows.length === vars.rows.length) {
          const step = buildStep(
            vars.stepId,
            'goalMoneyMoved',
            { name: vars.labelName },
            inverseOfInserts('transactions', rows.map((r) => ({ id: r.id, version: r.version })))
          );
          await recordUndoStepSafely(qc, client, step, vars.ownerId);
        }
        return rows;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: MoveGoalMoneyVars) => {
      markSession(vars);
      const now = new Date().toISOString();
      for (const tx of vars.rows) {
        await qc.cancelQueries({ queryKey: queryKeys.transactionsMonth(vars.householdId, monthOf(tx.local_date)) });
        placeRowInMonth(qc, vars.householdId, optimisticTransactionRow(qc, { ownerId: vars.ownerId, homeCurrency: vars.homeCurrency }, tx, now), []);
      }
      // 06 review P4-WR-05: the goal screens read the saved figure from the goal-lines queries, so the tagged leg goes there
      // too, at once and while offline; otherwise the user sees nothing move and adds the money twice.
      const tagged = vars.rows.filter((r) => r.goal_id === vars.goalId);
      await patchGoalLines(qc, vars.householdId, vars.goalId, (list) => [
        ...list.filter((r) => !tagged.some((t) => t.id === r.id)),
        ...tagged.map((tx) => optimisticTransactionRow(qc, { ownerId: vars.ownerId, homeCurrency: vars.homeCurrency }, tx, now)),
      ]);
    },
    onSuccess: (_rows: InsertedRow[], vars: MoveGoalMoneyVars) => {
      void qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(vars.householdId) });
      invalidateDerivedReads(qc, vars.householdId);
    },
    onError: async (err: unknown, vars: MoveGoalMoneyVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return;
      const ids = new Set(vars.rows.map((r) => r.id));
      for (const month of new Set(vars.rows.map((r) => monthOf(r.local_date)))) {
        patchMonthCacheIfLoaded(qc, vars.householdId, month, (list: TransactionList) => list.filter((r) => !ids.has(r.id)));
      }
      await patchGoalLines(qc, vars.householdId, vars.goalId, (list) => list.filter((r) => !ids.has(r.id)));
      invalidateDerivedReads(qc, vars.householdId);
      await recordFailedWrite({
        entity: 'transactions',
        entityId: `goal-money:${vars.goalId}`,
        kind: cls,
        code: settledWriteErrorCode(err),
        attempted: { goalId: vars.goalId, count: vars.rows.length },
      });
    },
  });
}

export interface MoveGoalMoneyInput {
  householdId: string;
  ownerId: string;
  homeCurrency: string;
  kind: 'add' | 'take';
  goal: Pick<SavingsGoalRow, 'id' | 'name' | 'currency' | 'target' | 'opening_saved'>;
  /** The account the goal sits in (goal.account_id), or null when the goal has none. */
  goalAccount: { id: string; currency: string } | null;
  /** The other account: where the money comes from (add) or goes to (take). */
  account: { id: string; currency: string };
  /** Goal-side minor units, above 0. */
  amount: number;
  /** The other account's amount when its currency differs; defaults to `amount`. */
  otherAmount?: number;
  /** The user's system Transfer category (required for a pair; may be null for a single line on a goal with no account). */
  categoryId: string | null;
  /** The goal's current paid lines and a converter, to tell whether this deposit reaches the target. */
  lines: readonly GoalLineSource[];
  toHome: ToHome;
  localDate?: string;
  timeZone?: string;
  note?: string | null;
}

/**
 * Add money / Take some out. A goal with an account gets two linked legs with the goal tag on the goal-side leg; a goal with
 * no account takes one line tagged to the goal (adding only). Both legs go in ONE write with ONE Undo. Returns the step id and
 * whether this deposit carried the goal to its target (for the success moment).
 */
export type MoveGoalMoneyRefusal = 'transfer-category-missing' | 'goal-has-no-account' | 'bad-amount' | 'invalid-transfer';

/** 06 review P4-CR-02: what tryMove hands back. A refusal queues nothing. */
export type MoveGoalMoneyResult =
  | { ok: true; stepId: string; transferId: string | null; reachedTarget: boolean }
  | { ok: false; reason: MoveGoalMoneyRefusal };

/** A move that cannot be queued, thrown by move() (tryMove returns it instead). */
export class MoveGoalMoneyRefused extends RangeError {
  constructor(readonly reason: MoveGoalMoneyRefusal) {
    super(reason);
    this.name = 'MoveGoalMoneyRefused';
  }
}

export function useMoveGoalMoney(): {
  move(input: MoveGoalMoneyInput): { stepId: string; transferId: string | null; reachedTarget: boolean };
  /** Same as move, but a refusal (for example the Transfer category not loaded yet) comes back as a typed result, never thrown. */
  tryMove(input: MoveGoalMoneyInput): MoveGoalMoneyResult;
} {
  const mutation = useMutation<InsertedRow[], unknown, MoveGoalMoneyVars>({ mutationKey: mutationKeys.moveGoalMoney, scope: WRITE_SCOPE });
  const api = {
    tryMove(input: MoveGoalMoneyInput): MoveGoalMoneyResult {
      try {
        return { ok: true, ...api.move(input) };
      } catch (err) {
        if (err instanceof MoveGoalMoneyRefused) return { ok: false, reason: err.reason };
        throw err;
      }
    },
    move(input: MoveGoalMoneyInput) {
      if (!validPositive(input.amount)) throw new MoveGoalMoneyRefused('bad-amount');
      if (input.otherAmount !== undefined && !validPositive(input.otherAmount)) throw new MoveGoalMoneyRefused('bad-amount');
      const timeZone = input.timeZone ?? getDeviceTimeZone();
      const localDate = input.localDate ?? localDateIn(new Date(), timeZone);
      const other = input.otherAmount ?? input.amount;
      const base = (id: string, account: { id: string; currency: string }, amount: number): NewTransaction => ({
        id,
        household_id: input.householdId,
        account_id: account.id,
        original_amount: amount,
        original_currency: account.currency,
        local_date: localDate,
        time_zone: timeZone,
        note: input.note ?? null,
        name: null,
        category_id: input.categoryId,
        payment_type: null,
        status: 'paid',
      });

      let rows: NewTransaction[];
      let transferId: string | null = null;
      if (input.goalAccount === null) {
        if (input.kind === 'take') throw new MoveGoalMoneyRefused('goal-has-no-account');
        rows = [{ ...base(Crypto.randomUUID(), input.account, -other), goal_id: input.goal.id }];
      } else {
        if (!input.categoryId) throw new MoveGoalMoneyRefused('transfer-category-missing');
        transferId = Crypto.randomUUID();
        const from = input.kind === 'add' ? input.account : input.goalAccount;
        const to = input.kind === 'add' ? input.goalAccount : input.account;
        const built = buildTransferLegs({
          transferId,
          outId: Crypto.randomUUID(),
          inId: Crypto.randomUUID(),
          from,
          to,
          amountOut: (input.kind === 'add' ? other : input.amount) as never,
          amountIn: (input.kind === 'add' ? input.amount : other) as never,
          localDate,
        });
        if (!built.ok) throw new MoveGoalMoneyRefused('invalid-transfer');
        const [outLeg, inLeg] = built.legs;
        const goalSideIsIn = input.kind === 'add';
        const toRow = (leg: typeof outLeg, tagged: boolean): NewTransaction => ({
          ...base(leg.id, { id: leg.accountId, currency: leg.currency }, leg.amount),
          transfer_id: leg.transferId,
          ...(tagged ? { goal_id: input.goal.id } : {}),
        });
        rows = [toRow(outLeg, !goalSideIsIn), toRow(inLeg, goalSideIsIn)];
      }

      const goalRow = {
        id: input.goal.id,
        name: input.goal.name,
        currency: input.goal.currency,
        target: input.goal.target,
        monthly_amount: null,
        ready_by: null,
        opening_saved: input.goal.opening_saved,
        kind: 'pot' as const,
        check_id: null,
        done_at: null,
        deleted_at: null,
      };
      const tagged = rows.find((r) => r.goal_id === input.goal.id) as NewTransaction;
      const before = goalSaved(goalRow, input.lines, input.toHome);
      const after = goalSaved(
        goalRow,
        [
          ...input.lines,
          {
            id: tagged.id,
            goal_id: input.goal.id,
            status: 'paid',
            deleted_at: null,
            transfer_id: tagged.transfer_id ?? null,
            original_amount: tagged.original_amount,
            original_currency: tagged.original_currency,
            local_date: tagged.local_date,
          },
        ],
        input.toHome
      );
      const target = input.goal.target === null ? null : input.toHome(input.goal.target, input.goal.currency);
      const reachedTarget = input.kind === 'add' && before !== null && after !== null && target !== null && before < target && after >= target;

      const stepId = newStepId();
      mutation.mutate({
        householdId: input.householdId,
        ownerId: input.ownerId,
        stepId,
        rows,
        goalId: input.goal.id,
        labelName: input.goal.name,
        homeCurrency: input.homeCurrency,
      });
      return { stepId, transferId, reachedTarget };
    },
  };
  return api;
}

// ---------------------------------------------------------------------------------------------------------------------
// Confirm an Expected contribution (confirm_goal_contribution)
// ---------------------------------------------------------------------------------------------------------------------

export interface ConfirmGoalContributionVars {
  ownerId: string;
  householdId: string;
  lineId: string;
  expectedVersion: number;
  month: string;
  inLeg: { id: string; transfer_id: string } | null;
  goalId: string;
  name: string;
  stepId: string;
}

function registerConfirmContribution(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.confirmGoalContribution, {
    mutationFn: (vars: ConfirmGoalContributionVars) =>
      guardSession(vars, async () => {
        const expected = resolveExpectedVersion('transactions', vars.lineId, vars.expectedVersion);
        // The server builds the one Undo step from the branch it took (06-06 follow-up): delete the in-leg, then put the line
        // back to Expected, unpaired, with its goal tag; or, for a single line, just back to Expected.
        const client = await writeClient();
        const res = await confirmGoalContribution(client, {
          transactionId: vars.lineId,
          expectedVersion: expected,
          inLeg: vars.inLeg,
          undoStep: { id: vars.stepId, name: vars.name },
        });
        if (res.transactionVersion !== null) {
          recordWrittenVersion('transactions', vars.lineId, [vars.expectedVersion, expected], res.transactionVersion);
        }
        return res;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: ConfirmGoalContributionVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.transactionsMonth(vars.householdId, vars.month) });
      patchMonthCacheIfLoaded(qc, vars.householdId, vars.month, (list: TransactionList) =>
        list.map((r) => (r.id === vars.lineId ? { ...r, status: 'paid' as const, pending: true } : r))
      );
      // 06 review P4-WR-05: the goal screens read the goal-lines queries; the line shows as confirmed there at once, so
      // Confirm is not offered (and sent) a second time while the server has not answered or the device is offline.
      await patchGoalLines(qc, vars.householdId, vars.goalId, (list) =>
        list.map((r) => (r.id === vars.lineId ? { ...r, status: 'paid' as const, pending: true } : r))
      );
    },
    onSuccess: (_res: unknown, vars: ConfirmGoalContributionVars) => {
      void qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(vars.householdId) });
      void qc.invalidateQueries({ queryKey: queryKeys.undoLog(vars.ownerId) });
      invalidateDerivedReads(qc, vars.householdId);
    },
    onError: async (err: unknown, vars: ConfirmGoalContributionVars) => {
      await parkFailure('transactions', vars.lineId, err, { labelKey: 'goalContributionConfirmed', fields: 1 }, () => {
        void qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(vars.householdId) });
        invalidateDerivedReads(qc, vars.householdId);
      });
    },
  });
}

export interface ConfirmContributionInput {
  ownerId: string;
  line: Pick<TransactionRow, 'id' | 'household_id' | 'account_id' | 'original_amount' | 'original_currency' | 'local_date' | 'version'>;
  goal: Pick<SavingsGoalRow, 'id' | 'name' | 'currency' | 'account_id'>;
}

/**
 * An Expected contribution line becomes real (nothing moves by itself, D-25). Into a goal with its own account the server
 * writes the paired legs; otherwise the line just becomes paid. Replays are harmless. Returns the undo step id.
 */
export function useConfirmGoalContribution(): { confirm(input: ConfirmContributionInput): string } {
  const mutation = useMutation<unknown, unknown, ConfirmGoalContributionVars>({
    mutationKey: mutationKeys.confirmGoalContribution,
    scope: WRITE_SCOPE,
  });
  return {
    confirm({ ownerId, line, goal }) {
      const pair =
        goal.account_id != null && goal.account_id !== line.account_id && goal.currency === line.original_currency && line.original_amount < 0;
      const stepId = newStepId();
      mutation.mutate({
        ownerId,
        householdId: line.household_id,
        lineId: line.id,
        expectedVersion: line.version,
        month: monthOf(line.local_date),
        inLeg: pair ? { id: Crypto.randomUUID(), transfer_id: Crypto.randomUUID() } : null,
        goalId: goal.id,
        name: goal.name,
        stepId,
      });
      return stepId;
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Use as my safety net (set_safety_net, D-29)
// ---------------------------------------------------------------------------------------------------------------------

export interface SetSafetyNetVars {
  ownerId: string;
  cache: GoalCacheKey;
  goalId: string;
  /** The net being replaced, or null. */
  currentNetId: string | null;
  /** goal id -> the version the caller saw (the target, and the current net if any). */
  versions: Record<string, number>;
  /** The target's Locked and Protect before, to put back if the swap is refused. */
  targetBefore: { locked: boolean; protect: boolean };
  name: string;
  stepId: string;
}

function registerSetSafetyNet(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.setSafetyNet, {
    mutationFn: (vars: SetSafetyNetVars) =>
      guardSession(vars, async () => {
        const expectedVersions: Record<string, number> = {};
        for (const [id, v] of Object.entries(vars.versions)) expectedVersions[id] = resolveExpectedVersion('savings_goals', id, v);
        const client = await writeClient();
        const res = await setSafetyNet(client, { goalId: vars.goalId, expectedVersions, undoStep: { id: vars.stepId, name: vars.name } });
        if (res.status === 'applied') {
          if (res.goalVersion !== null) recordWrittenVersion('savings_goals', vars.goalId, [vars.versions[vars.goalId] as number, expectedVersions[vars.goalId] as number], res.goalVersion);
          if (res.previousGoalId !== null && res.previousVersion !== null) {
            recordWrittenVersion('savings_goals', res.previousGoalId, [vars.versions[res.previousGoalId] as number, expectedVersions[res.previousGoalId] as number], res.previousVersion);
          }
        }
        return res;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: SetSafetyNetVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.savingsGoals(vars.cache.userId, vars.cache.householdId) });
      // Exactly one flagged row at every moment: the target is flagged and every other row is not.
      patchGoals(qc, vars.cache, (rows) =>
        rows.map((r) => {
          if (r.id === vars.goalId) return { ...r, is_safety_net: true, locked: true, protect: true, pending: true };
          if (r.is_safety_net === true) return { ...r, is_safety_net: false, pending: true };
          return r;
        })
      );
    },
    onSuccess: (_res: unknown, vars: SetSafetyNetVars) => {
      // The step was stored by the server; row versions after a later Undo are not predictable, so refetch.
      refreshGoalReads(qc, vars.cache);
    },
    onError: async (err: unknown, vars: SetSafetyNetVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'conflict' && cls !== 'rejected' && cls !== 'not-found') return;
      // Both rows roll back together.
      patchGoals(qc, vars.cache, (rows) =>
        rows.map((r) => {
          if (r.id === vars.goalId) return { ...r, is_safety_net: false, locked: vars.targetBefore.locked, protect: vars.targetBefore.protect };
          if (r.id === vars.currentNetId) return { ...r, is_safety_net: true };
          return r;
        })
      );
      await parkFailure('savings_goals', vars.goalId, err, { labelKey: 'safetyNetChanged', fields: Object.keys(vars.versions).length }, () =>
        invalidateGoals(qc, vars.cache)
      );
    },
  });
}

/**
 * "Use as my safety net" on an existing goal: any old net is swapped out in the same write (D-29). Nothing is sent when the
 * goal already is the net. Returns the undo step id (the server stores the step), or null when nothing was queued.
 */
export function useSetSafetyNet(): { set(goal: SavingsGoalRow, current: SavingsGoalRow | null, ownerId: string): string | null } {
  const mutation = useMutation<unknown, unknown, SetSafetyNetVars>({ mutationKey: mutationKeys.setSafetyNet, scope: WRITE_SCOPE });
  return {
    set(goal, current, ownerId) {
      if (goal.is_safety_net === true) return null;
      if (goal.deleted_at !== null || goal.kind !== 'pot' || (goal.bucket ?? null) !== null) {
        throw new RangeError('set safety net: that goal cannot be the safety net');
      }
      const net = current !== null && current.id !== goal.id ? current : null;
      const versions: Record<string, number> = { [goal.id]: goal.version };
      if (net !== null) versions[net.id] = net.version;
      const stepId = newStepId();
      mutation.mutate({
        ownerId,
        cache: { userId: ownerId, householdId: goal.household_id },
        goalId: goal.id,
        currentNetId: net === null ? null : net.id,
        versions,
        targetBefore: { locked: goal.locked !== false, protect: goal.protect !== false },
        name: goal.name,
        stepId,
      });
      return stepId;
    },
  };
}

/**
 * Device check 2026-11-11: true while a save of this goal is queued or running. A new goal's page opens before its
 * optimistic row reaches the cache (scoped writes run in turn, and a refetch can briefly hold the older list), so the
 * page shows its loading state, not "This goal was removed.", until the save settles.
 */
export function useGoalSaving(goalId: string): boolean {
  const ids = useMutationState({
    filters: { mutationKey: mutationKeys.saveGoalPlan, status: 'pending' },
    select: (m) => (m.state.variables as SaveGoalPlanVars | undefined)?.goal.id ?? '',
  });
  return ids.includes(goalId);
}
