// 05.2-14 (DSU-08, DSU-09, DSU-21; D-03, D-04, D-05): account use, mixed-account placement and the emergency fund
// as atomic batches. Each save is ONE `apply_patches` call that also records its own undo step in the same server
// transaction (the useBulkPatch pattern), so a refused row refuses the whole batch and Undo reverses all of it.
// Account use is stored on the account (one source, D-03); a mixed account's envelopes are savings_goals.account_id;
// the emergency fund is decide_settings reserve / reserve_account_id / reserve_goal. Variables are plain JSON; the
// step id is minted once before mutate() and is the server's replay key. Failed-write records carry ids, counts
// and column names only, never a name or an amount.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { buildStep, planBulkPatch, type BulkPatchItem, type PatchValue, type UndoConflict } from '@/engine/undo';
import type { AccountUse } from '@/engine/decide/v3';
import { VersionConflictError, type WriteEntity } from '@/db/errors';
import { applyPatches } from '@/db/patches';
import type { AccountRow } from '@/db/rows';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import {
  EMPTY_DECIDE_SETTINGS,
  upsertDecideSettings,
  type DecideSettingsPatch,
  type DecideSettingsRow,
} from '@/db/decideSettings';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import type { WithPending } from '@/data/types';
import {
  classifySettledWriteError,
  settledWriteErrorCode,
  shouldRetryWrite,
  writeRetryDelay,
} from '@/data/sync/writeErrors';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { guardSession, markSession } from '@/data/sync/sessionEpoch';
import { recordWrittenVersion, resolveExpectedVersion } from '@/data/sync/versionChain';
import { showToast } from '@/state/undoToast';
import { stampSettingsPatch } from '@/features/decide/home/settingsPatch';
import { writeClient } from './writeClient';
import { newStepId } from './undoCapture';
import { changedSettingsKeys, toPatchValue, type SettingsPatch } from './decideSetup';
import { accountUsePatch, type AccountUseColumns } from './accountUseModel';

type BatchLabel = 'accountUseSaved' | 'emergencySaved' | 'emergencyRemoved';

interface SettingsOp {
  userId: string;
  patch: Record<string, PatchValue>;
  before: Record<string, PatchValue>;
  /** The cached row's id and version; null = no settings row yet, so an empty one is created at flush time. */
  row: { id: string; version: number } | null;
}

export interface AccountUseBatchVars {
  ownerId: string;
  householdId: string | null;
  stepId: string;
  labelKey: BatchLabel;
  /** accounts and savings_goals items (version-conditional, with their `before` values). */
  items: BulkPatchItem[];
  settings: SettingsOp | null;
}

type AccountList = WithPending<AccountRow>[];
type GoalList = WithPending<SavingsGoalRow>[];

const USE_KEYS = ['use', 'use_purpose', 'use_envelope_id', 'use_extra_set_aside'] as const;

function columnsOfAccount(a: AccountRow): AccountUseColumns {
  return {
    use: a.use ?? null,
    use_purpose: a.use_purpose ?? null,
    use_envelope_id: a.use_envelope_id ?? null,
    use_extra_set_aside: a.use_extra_set_aside ?? null,
  };
}

/** The account's use item, or null when its four columns already hold this use. */
function accountItem(account: AccountRow, use: AccountUse): BulkPatchItem | null {
  const patch = accountUsePatch(use);
  const before = columnsOfAccount(account);
  if (USE_KEYS.every((k) => patch[k] === before[k])) return null;
  return {
    entity: 'accounts',
    id: account.id,
    expectedVersion: account.version,
    before: { ...before },
    patch: { ...patch },
  };
}

function itemCount(vars: AccountUseBatchVars): number {
  return vars.items.length + (vars.settings ? 1 : 0);
}

/** Optimistic: merge a patch into the cached rows it names. */
function mergeRows<T extends { id: string }>(rows: T[] | undefined, byId: Map<string, Record<string, PatchValue>>): T[] | undefined {
  if (rows === undefined) return rows;
  return rows.map((r) => {
    const patch = byId.get(r.id);
    return patch ? ({ ...r, ...patch, pending: true } as T) : r;
  });
}

function applyToCaches(
  qc: QueryClient,
  vars: AccountUseBatchVars,
  pick: (item: BulkPatchItem) => Record<string, PatchValue>,
  settingsPick: (s: SettingsOp) => Record<string, PatchValue>
): void {
  if (vars.householdId !== null) {
    const accounts = new Map<string, Record<string, PatchValue>>();
    const goals = new Map<string, Record<string, PatchValue>>();
    for (const item of vars.items) (item.entity === 'accounts' ? accounts : goals).set(item.id, pick(item));
    if (accounts.size > 0) {
      qc.setQueryData<AccountList>(queryKeys.accounts(vars.householdId), (old) => mergeRows(old, accounts));
    }
    if (goals.size > 0) {
      qc.setQueryData<GoalList>(queryKeys.savingsGoals(vars.ownerId, vars.householdId), (old) => mergeRows(old, goals));
    }
  }
  if (vars.settings) {
    const s = vars.settings;
    qc.setQueryData<DecideSettingsRow | null>(queryKeys.decideSettings(s.userId), (old) => ({
      ...EMPTY_DECIDE_SETTINGS,
      user_id: s.userId,
      ...(old ?? {}),
      ...(settingsPick(s) as unknown as DecideSettingsPatch),
    }));
  }
}

function invalidateAll(qc: QueryClient, vars: AccountUseBatchVars): void {
  // Not awaited: query-core holds WRITE_SCOPE while onSuccess/onError are awaited (WR-A15).
  if (vars.householdId !== null) {
    if (vars.items.some((i) => i.entity === 'accounts')) {
      void qc.invalidateQueries({ queryKey: queryKeys.accounts(vars.householdId) });
    }
    if (vars.items.some((i) => i.entity === 'savings_goals')) {
      void qc.invalidateQueries({ queryKey: queryKeys.savingsGoals(vars.ownerId, vars.householdId) });
    }
  }
  if (vars.settings) void qc.invalidateQueries({ queryKey: queryKeys.decideSettings(vars.settings.userId) });
  void qc.invalidateQueries({ queryKey: queryKeys.undoLog(vars.ownerId) });
}

async function runBatch(vars: AccountUseBatchVars) {
  const client = await writeClient();
  const all: BulkPatchItem[] = [...vars.items];
  const bases: number[][] = all.map((i) => [i.expectedVersion]);
  if (vars.settings) {
    const s = vars.settings;
    let id: string;
    let expected: number;
    if (s.row === null) {
      // No settings row yet: create an empty one so the batch has a row to version-check.
      const created = await upsertDecideSettings(client, s.userId, {});
      id = created.id;
      expected = created.version;
      bases.push([expected]);
    } else {
      id = s.row.id;
      expected = resolveExpectedVersion('decide_settings', id, s.row.version);
      bases.push([s.row.version]);
    }
    all.push({ entity: 'decide_settings', id, expectedVersion: expected, before: s.before, patch: s.patch });
  }
  const resolved = all.map((i, k) => {
    if (k >= vars.items.length) return i;
    return { ...i, expectedVersion: resolveExpectedVersion(i.entity as WriteEntity, i.id, i.expectedVersion) };
  });
  const { forward, inverse } = planBulkPatch(resolved);
  const step = buildStep(vars.stepId, vars.labelKey, {}, inverse);
  const rows = await applyPatches(client, forward, step);
  const byKey = new Map(all.map((i, k) => [`${i.entity}\u0000${i.id}`, [...bases[k]!, resolved[k]!.expectedVersion]] as const));
  for (const row of rows) {
    recordWrittenVersion(row.entity as WriteEntity, row.id, byKey.get(`${row.entity}\u0000${row.id}`) ?? [], row.version);
  }
  return rows;
}

export function registerAccountUseMutations(qc: QueryClient): void {
  for (const key of [mutationKeys.saveAccountUses, mutationKeys.saveAccountUse, mutationKeys.saveEmergencyFund]) {
    qc.setMutationDefaults(key, {
      mutationFn: (vars: AccountUseBatchVars) => guardSession(vars, () => runBatch(vars)),
      scope: WRITE_SCOPE,
      retry: shouldRetryWrite,
      retryDelay: writeRetryDelay,
      onMutate: async (vars: AccountUseBatchVars) => {
        markSession(vars);
        const cancels: Promise<void>[] = [];
        if (vars.householdId !== null) {
          cancels.push(qc.cancelQueries({ queryKey: queryKeys.accounts(vars.householdId) }));
          cancels.push(qc.cancelQueries({ queryKey: queryKeys.savingsGoals(vars.ownerId, vars.householdId) }));
        }
        if (vars.settings) cancels.push(qc.cancelQueries({ queryKey: queryKeys.decideSettings(vars.settings.userId) }));
        await Promise.all(cancels);
        applyToCaches(qc, vars, (i) => i.patch, (s) => s.patch);
      },
      onSuccess: (_rows: unknown, vars: AccountUseBatchVars) => {
        invalidateAll(qc, vars);
      },
      onError: async (err: unknown, vars: AccountUseBatchVars) => {
        const cls = classifySettledWriteError(err);
        if (cls !== 'conflict' && cls !== 'rejected' && cls !== 'not-found') return;
        const fields = [...new Set([...vars.items.flatMap((i) => Object.keys(i.patch)), ...Object.keys(vars.settings?.patch ?? {})])];
        const attempted = { labelKey: vars.labelKey, n: itemCount(vars), fields };

        if (err instanceof VersionConflictError) {
          // The server refused the whole batch; refetch what it touched so the screen shows the other change.
          invalidateAll(qc, vars);
          const conflict = err.serverRow as UndoConflict;
          await recordFailedWrite({
            entity: conflict.entity,
            entityId: conflict.id,
            kind: 'conflict',
            code: 'version-conflict',
            attempted,
          });
          showToast({ kind: 'refusal', refusal: conflict });
          return;
        }

        // Rejected: put the optimistic values back, then refetch.
        applyToCaches(qc, vars, (i) => i.before, (s) => s.before);
        invalidateAll(qc, vars);
        await recordFailedWrite({
          entity: (vars.items[0]?.entity ?? 'decide_settings') as WriteEntity,
          entityId: `bulk:${vars.stepId}`,
          kind: cls,
          code: settledWriteErrorCode(err),
          attempted,
        });
      },
    });
  }
}

type Batch = Omit<AccountUseBatchVars, 'stepId' | 'ownerId'>;

function useBatch(key: readonly string[], ownerId: string): (batch: Batch) => { stepId: string } | null {
  const mutation = useMutation<unknown, unknown, AccountUseBatchVars>({ mutationKey: key, scope: WRITE_SCOPE });
  return (batch) => {
    if (batch.items.length === 0 && batch.settings === null) return null;
    const stepId = newStepId();
    mutation.mutate({ ...batch, ownerId, stepId });
    return { stepId };
  };
}

function dedupe<T extends { id: string }>(rows: readonly T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}

/** "These look right" and the account-use step: every account's use in one batch, one Undo. */
export function useSaveAccountUses(ownerId: string): {
  save(items: readonly { account: AccountRow; use: AccountUse }[]): { stepId: string } | null;
} {
  const submit = useBatch(mutationKeys.saveAccountUses, ownerId);
  return {
    save(items) {
      const unique = dedupe(items.map((i) => ({ ...i, id: i.account.id })));
      const ops = unique.flatMap((i) => accountItem(i.account, i.use) ?? []);
      if (ops.length === 0) return null;
      return submit({ labelKey: 'accountUseSaved', householdId: unique[0]!.account.household_id, items: ops, settings: null });
    },
  };
}

/** One account's use, plus (for 'A mix', D-05) which envelopes and goals sit in it, in the same batch. */
export function useSaveAccountUse(ownerId: string): {
  save(input: {
    account: AccountRow;
    use: AccountUse;
    placements?: readonly { goal: SavingsGoalRow; accountId: string | null }[];
  }): { stepId: string } | null;
} {
  const submit = useBatch(mutationKeys.saveAccountUse, ownerId);
  return {
    save({ account, use, placements }) {
      const items: BulkPatchItem[] = [];
      const own = accountItem(account, use);
      if (own) items.push(own);
      if (use.kind === 'mixed') {
        for (const p of dedupe((placements ?? []).map((x) => ({ ...x, id: x.goal.id })))) {
          if ((p.goal.account_id ?? null) === p.accountId) continue;
          items.push({
            entity: 'savings_goals',
            id: p.goal.id,
            expectedVersion: p.goal.version,
            before: { account_id: p.goal.account_id ?? null },
            patch: { account_id: p.accountId },
          });
        }
      }
      return submit({ labelKey: 'accountUseSaved', householdId: account.household_id, items, settings: null });
    },
  };
}

/** The emergency fund (amount, account, goal) and, when an account is chosen, that account's use (D-04). */
export function useSaveEmergencyFund(
  userId: string,
  ownerId: string
): {
  save(input: {
    amount: number | null;
    accountId: string | null;
    goal: number | null;
    linkUse: { account: AccountRow; use: AccountUse } | null;
  }): { stepId: string } | null;
  remove(): { stepId: string };
} {
  const qc = useQueryClient();
  const submit = useBatch(mutationKeys.saveEmergencyFund, ownerId);

  /** The changed columns of `patch` (or all of `force` when asked) as a settings op; null when nothing changes. */
  const settingsOp = (patch: SettingsPatch, current: DecideSettingsRow | null, force = false): SettingsOp | null => {
    const changed = changedSettingsKeys(patch, current);
    const keys = changed.length > 0 || !force ? changed : Object.keys(patch);
    if (keys.length === 0) return null;
    const row = (current ?? EMPTY_DECIDE_SETTINGS) as unknown as Record<string, unknown>;
    const out: Record<string, PatchValue> = {};
    const before: Record<string, PatchValue> = {};
    for (const k of keys) {
      out[k] = toPatchValue(k, patch[k as keyof SettingsPatch]);
      before[k] = toPatchValue(k, row[k]);
    }
    return { userId, patch: out, before, row: current ? { id: current.id, version: current.version } : null };
  };

  return {
    save({ amount, accountId, goal, linkUse }) {
      const current = qc.getQueryData<DecideSettingsRow | null>(queryKeys.decideSettings(userId)) ?? null;
      const currency = current?.currency ?? linkUse?.account.currency ?? null;
      const raw: SettingsPatch = { reserve: amount, reserve_account_id: accountId, reserve_goal: goal };
      // Stamped before the diff so a currency switch (which clears the other money columns) is part of Undo.
      const patch = currency ? (stampSettingsPatch(raw as DecideSettingsPatch, current, currency) as SettingsPatch) : raw;
      const link = linkUse ? accountItem(linkUse.account, linkUse.use) : null;
      return submit({
        labelKey: 'emergencySaved',
        householdId: linkUse?.account.household_id ?? null,
        items: link ? [link] : [],
        settings: settingsOp(patch, current),
      });
    },
    remove() {
      const current = qc.getQueryData<DecideSettingsRow | null>(queryKeys.decideSettings(userId)) ?? null;
      // The goal is kept and nothing moves in the bank. Written even when already empty so the caller always has a step id.
      const settings = settingsOp({ reserve: null, reserve_account_id: null }, current, true);
      return submit({ labelKey: 'emergencyRemoved', householdId: null, items: [], settings })!;
    },
  };
}
