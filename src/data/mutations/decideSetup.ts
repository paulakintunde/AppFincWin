// 05.2-13 (DSU-04/07/10/12/13/18/19/21): the settings write path for every setup step, Reset, the refine
// timestamps and the unexplained-money answer. Forward half: the unconditional decide_settings upsert (like
// decideSettings.ts). Undo half: one undo step on entity 'decide_settings' carrying the previous values of
// exactly the columns that changed, at the version the server just returned (apply_patches refuses on a
// mismatch). A save that changes nothing writes nothing. Variables are plain JSON; failed-write records carry
// the user id and column names only, never a figure.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { buildStep, type PatchValue, type UndoLabelKey } from '@/engine/undo';
import {
  DECIDE_SETTINGS_PATCH_KEYS,
  EMPTY_DECIDE_SETTINGS,
  upsertDecideSettings,
  type DecideSettingsPatch,
  type DecideSettingsRow,
} from '@/db/decideSettings';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import {
  classifySettledWriteError,
  settledWriteErrorCode,
  shouldRetryWrite,
  writeRetryDelay,
} from '@/data/sync/writeErrors';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { guardSession, markSession } from '@/data/sync/sessionEpoch';
import { registerWipeHandler } from '@/services/storage/wipe';
import { stampSettingsPatch } from '@/features/decide/home/settingsPatch';
import { writeClient } from './writeClient';
import { newStepId, recordUndoStepSafely } from './undoCapture';

export type SettingsPatch = Partial<Record<(typeof DECIDE_SETTINGS_PATCH_KEYS)[number], unknown>>;

export interface SaveSetupStepVars {
  userId: string;
  stepId: string;
  labelKey: UndoLabelKey;
  stepTitle: string | null;
  patch: SettingsPatch;
  before: Record<string, PatchValue>;
  /** System stamps (the refine "shown" time) are not user answers: no undo step. */
  noUndo?: boolean;
}

interface SettingsContext {
  previous: DecideSettingsRow | null | undefined;
}

/** The setup answers Reset clears. Account use, series, debts, envelopes, the rough_* onboarding figures and the refine timestamps stay. */
export const RESET_COLUMNS: readonly string[] = [
  'income_types',
  'income_pattern',
  'income_pattern_confirmed',
  'variable_method',
  'steady_amount',
  'spread_months',
  'hold_months',
  'share_pct',
  'detail',
  'remind_plan',
  'remind_unspent',
  'setup_done_at',
  'everyday_override',
  'everyday_override_at',
  'month_marks',
  'unspent_anchor',
  'unspent_anchor_at',
  'reserve',
  'reserve_account_id',
  'reserve_goal',
  'unexplained_amount',
  'unexplained_use',
  'unexplained_at',
];

const ARRAY_COLUMNS: ReadonlySet<string> = new Set(['income_types']);
const JSON_COLUMNS: ReadonlySet<string> = new Set(['month_marks']);

/** An undo patch value: a text[] becomes a Postgres array literal, a jsonb column its JSON text, the rest as is. */
export function toPatchValue(column: string, value: unknown): PatchValue {
  if (value === null || value === undefined) return null;
  if (ARRAY_COLUMNS.has(column) && Array.isArray(value)) {
    const items = (value as unknown[]).map((v) => {
      const s = String(v);
      return /[\s,{}"\\]/.test(s) || s === '' ? `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : s;
    });
    return `{${items.join(',')}}`;
  }
  if (JSON_COLUMNS.has(column)) return JSON.stringify(value);
  return value as PatchValue;
}

function sameValue(a: unknown, b: unknown): boolean {
  const x = a === undefined ? null : a;
  const y = b === undefined ? null : b;
  if (x === y) return true;
  if (typeof x === 'object' && typeof y === 'object' && x !== null && y !== null) {
    return JSON.stringify(x) === JSON.stringify(y);
  }
  return false;
}

/** The patch's columns whose value differs from the cached row (a missing row reads as all null). */
export function changedSettingsKeys(patch: SettingsPatch, current: DecideSettingsRow | null): string[] {
  const row = (current ?? EMPTY_DECIDE_SETTINGS) as unknown as Record<string, unknown>;
  const keys: string[] = [];
  for (const key of Object.keys(patch)) {
    const next = patch[key as keyof SettingsPatch];
    if (next === undefined) continue;
    if (!sameValue(next, row[key])) keys.push(key);
  }
  return keys;
}

/** The last server-confirmed row per user, for rollback (same idea as decideSettings.ts). */
const confirmed = new Map<string, DecideSettingsRow | null>();
registerWipeHandler({
  id: 'decide-setup-confirmed',
  wipe: async () => {
    confirmed.clear();
  },
});

function pendingEdits(qc: QueryClient, userId: string): SaveSetupStepVars[] {
  return qc
    .getMutationCache()
    .findAll({ mutationKey: mutationKeys.updateDecideSetup, status: 'pending' })
    .map((m) => m.state.variables as SaveSetupStepVars | undefined)
    .filter((v): v is SaveSetupStepVars => v !== undefined && v.userId === userId);
}

export function registerDecideSetupMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.updateDecideSetup, {
    mutationFn: (vars: SaveSetupStepVars) =>
      guardSession(vars, async () => {
        const client = await writeClient();
        const row = await upsertDecideSettings(client, vars.userId, vars.patch as DecideSettingsPatch);
        if (!vars.noUndo) {
          const step = buildStep(vars.stepId, vars.labelKey, vars.stepTitle ? { name: vars.stepTitle } : {}, [
            { entity: 'decide_settings', id: row.id, expectedVersion: row.version, patch: vars.before },
          ]);
          await recordUndoStepSafely(qc, client, step, vars.userId);
        }
        return row;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: SaveSetupStepVars): Promise<SettingsContext> => {
      markSession(vars);
      const key = queryKeys.decideSettings(vars.userId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<DecideSettingsRow | null>(key);
      if (pendingEdits(qc, vars.userId)[0] === vars && previous !== undefined) confirmed.set(vars.userId, previous);
      qc.setQueryData<DecideSettingsRow | null>(key, (old) => ({
        ...EMPTY_DECIDE_SETTINGS,
        user_id: vars.userId,
        ...(old ?? {}),
        ...(vars.patch as DecideSettingsPatch),
      }));
      return { previous };
    },
    onSuccess: (row: DecideSettingsRow, vars: SaveSetupStepVars) => {
      confirmed.set(vars.userId, row);
      qc.setQueryData(queryKeys.decideSettings(vars.userId), row);
    },
    onError: async (err: unknown, vars: SaveSetupStepVars, context: unknown) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return;
      const key = queryKeys.decideSettings(vars.userId);
      const ctx = context as SettingsContext | undefined;
      const base = confirmed.has(vars.userId) ? confirmed.get(vars.userId) : ctx?.previous;
      if (base !== undefined) {
        const queued = pendingEdits(qc, vars.userId).filter((v) => v !== vars);
        qc.setQueryData<DecideSettingsRow | null>(key, () =>
          queued.length === 0
            ? base
            : queued.reduce<DecideSettingsRow>(
                (row, v) => ({ ...row, ...(v.patch as DecideSettingsPatch) }),
                { ...EMPTY_DECIDE_SETTINGS, user_id: vars.userId, ...(base ?? {}) }
              )
        );
      }
      void qc.invalidateQueries({ queryKey: key });
      await recordFailedWrite({
        entity: 'decide_settings',
        entityId: vars.userId,
        kind: cls,
        code: settledWriteErrorCode(err),
        attempted: { fields: Object.keys(vars.patch) },
      });
    },
  });
}

interface Submit {
  labelKey: UndoLabelKey;
  stepTitle: string | null;
  patch: SettingsPatch;
  noUndo?: boolean;
}

function useSubmit(userId: string): (s: Submit) => { stepId: string } | null {
  const qc = useQueryClient();
  const mutation = useMutation<DecideSettingsRow, unknown, SaveSetupStepVars, SettingsContext>({
    mutationKey: mutationKeys.updateDecideSetup,
    scope: WRITE_SCOPE,
  });
  return (s) => {
    const current = qc.getQueryData<DecideSettingsRow | null>(queryKeys.decideSettings(userId)) ?? null;
    const changed = changedSettingsKeys(s.patch, current);
    if (changed.length === 0) return null;
    const row = (current ?? EMPTY_DECIDE_SETTINGS) as unknown as Record<string, unknown>;
    const before: Record<string, PatchValue> = {};
    for (const k of changed) before[k] = toPatchValue(k, row[k]);
    const stepId = newStepId();
    mutation.mutate({
      userId,
      stepId,
      labelKey: s.labelKey,
      stepTitle: s.stepTitle,
      patch: s.patch,
      before,
      noUndo: s.noUndo,
    });
    return { stepId };
  };
}

function useStamped(userId: string): (patch: SettingsPatch) => SettingsPatch {
  const qc = useQueryClient();
  return (patch) => {
    const current = qc.getQueryData<DecideSettingsRow | null>(queryKeys.decideSettings(userId)) ?? null;
    const currency = (patch.currency as string | null | undefined) ?? current?.currency ?? null;
    // Stamped before the diff so a currency switch (which clears the other money columns) is part of Undo.
    return currency ? (stampSettingsPatch(patch as DecideSettingsPatch, current, currency) as SettingsPatch) : patch;
  };
}

export function useSaveSetupStep(userId: string): {
  save(input: { labelKey?: UndoLabelKey; stepTitle?: string; patch: SettingsPatch }): { stepId: string } | null;
} {
  const submit = useSubmit(userId);
  const stamp = useStamped(userId);
  return {
    save(input) {
      return submit({
        labelKey: input.labelKey ?? 'setupStepSaved',
        stepTitle: input.stepTitle ?? null,
        patch: stamp(input.patch),
      });
    },
  };
}

/** Clears the setup answers only. Returns null when every one is already empty. */
export function useResetDecideSetup(userId: string): { reset(): { stepId: string } | null } {
  const submit = useSubmit(userId);
  return {
    reset() {
      const patch: SettingsPatch = {};
      for (const c of RESET_COLUMNS) patch[c as keyof SettingsPatch] = null;
      return submit({ labelKey: 'setupReset', stepTitle: null, patch });
    },
  };
}

export function useStampRefine(userId: string): {
  markShown(atIso: string): void;
  snooze(untilIso: string): { stepId: string } | null;
} {
  const submit = useSubmit(userId);
  return {
    markShown(atIso) {
      submit({ labelKey: 'refineSnoozed', stepTitle: null, patch: { refine_last_at: atIso }, noUndo: true });
    },
    snooze(untilIso) {
      return submit({ labelKey: 'refineSnoozed', stepTitle: null, patch: { refine_snooze_until: untilIso } });
    },
  };
}

export function useSaveUnexplainedAnswer(userId: string): {
  save(a: {
    amount: number;
    use: 'spare' | 'envelope_or_goal' | 'set_aside_for_bill' | 'someone_elses';
    at: string;
  }): { stepId: string } | null;
} {
  const qc = useQueryClient();
  const submit = useSubmit(userId);
  const stamp = useStamped(userId);
  return {
    save(a) {
      // 05.1 D-59: asked again only when the figure changes, so an identical amount and use write nothing, the time aside.
      const current = qc.getQueryData<DecideSettingsRow | null>(queryKeys.decideSettings(userId)) ?? null;
      if (changedSettingsKeys({ unexplained_amount: a.amount, unexplained_use: a.use }, current).length === 0) return null;
      return submit({
        labelKey: 'answerSaved',
        stepTitle: null,
        patch: stamp({ unexplained_amount: a.amount, unexplained_use: a.use, unexplained_at: a.at }),
      });
    },
  };
}
