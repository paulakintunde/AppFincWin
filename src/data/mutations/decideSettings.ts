// 05-19 (D-14, D-03): the lines-you-will-not-cross limits and the rough figures save once per user on
// decide_settings, written unconditionally (no expected_version) like recordPrefs.ts. A blank line saves
// null, which means "use the engine default". Replay key: the user id (an upsert is idempotent). Failed-write
// records list field names only, never the figures.
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import {
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
import { writeClient } from './writeClient';

export interface UpdateDecideSettingsVars {
  userId: string;
  patch: DecideSettingsPatch;
}

interface SettingsContext {
  previous: DecideSettingsRow | null | undefined;
}

/**
 * WR-A07: the last settings row the server confirmed, per user, captured by the oldest queued edit's onMutate (it
 * reads the cache before any optimistic edit of the run) and on every success. A rejected edit rebuilds the cache from it
 * plus the edits still queued, instead of restoring its own `previous`, which may hold an earlier edit's value.
 * In memory only: after a restart a replayed edit falls back to `previous`, and the refetch below corrects it.
 */
const confirmed = new Map<string, DecideSettingsRow | null>();
registerWipeHandler({
  id: 'decide-settings-confirmed',
  wipe: async () => {
    confirmed.clear();
  },
});

function pendingSettingsEdits(qc: QueryClient, userId: string): UpdateDecideSettingsVars[] {
  return qc
    .getMutationCache()
    .findAll({ mutationKey: mutationKeys.updateDecideSettings, status: 'pending' })
    .map((m) => m.state.variables as UpdateDecideSettingsVars | undefined)
    .filter((v): v is UpdateDecideSettingsVars => v !== undefined && v.userId === userId);
}

export function registerDecideSettingsMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.updateDecideSettings, {
    mutationFn: (vars: UpdateDecideSettingsVars) =>
      guardSession(vars, async () => upsertDecideSettings(await writeClient(), vars.userId, vars.patch)),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: UpdateDecideSettingsVars): Promise<SettingsContext> => {
      markSession(vars);
      const key = queryKeys.decideSettings(vars.userId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<DecideSettingsRow | null>(key);
      // The oldest queued edit read the cache before any optimistic edit of this run, so its `previous` is the server's.
      if (pendingSettingsEdits(qc, vars.userId)[0] === vars && previous !== undefined) confirmed.set(vars.userId, previous);
      qc.setQueryData<DecideSettingsRow | null>(key, (old) => ({
        ...EMPTY_DECIDE_SETTINGS,
        user_id: vars.userId,
        ...(old ?? {}),
        ...vars.patch,
      }));
      return { previous };
    },
    onSuccess: (row: DecideSettingsRow, vars: UpdateDecideSettingsVars) => {
      confirmed.set(vars.userId, row);
      qc.setQueryData(queryKeys.decideSettings(vars.userId), row);
    },
    onError: async (err: unknown, vars: UpdateDecideSettingsVars, context: unknown) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return; // unconditional, never conflicts
      const key = queryKeys.decideSettings(vars.userId);
      const ctx = context as SettingsContext | undefined;
      const base = confirmed.has(vars.userId) ? confirmed.get(vars.userId) : ctx?.previous;
      if (base !== undefined) {
        // The server value plus every edit still queued (this one is still listed as pending while onError runs).
        const queued = pendingSettingsEdits(qc, vars.userId).filter((v) => v !== vars);
        qc.setQueryData<DecideSettingsRow | null>(key, () =>
          queued.length === 0
            ? base
            : queued.reduce<DecideSettingsRow>(
                (row, v) => ({ ...row, ...v.patch }),
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

export function useUpdateDecideSettings(userId: string): { update(patch: DecideSettingsPatch): void } {
  const mutation = useMutation<DecideSettingsRow, unknown, UpdateDecideSettingsVars, SettingsContext>({
    mutationKey: mutationKeys.updateDecideSettings,
    scope: WRITE_SCOPE,
  });
  return {
    update(patch) {
      mutation.mutate({ userId, patch });
    },
  };
}
