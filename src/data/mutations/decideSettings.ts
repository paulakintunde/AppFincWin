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
import { writeClient } from './writeClient';

export interface UpdateDecideSettingsVars {
  userId: string;
  patch: DecideSettingsPatch;
}

interface SettingsContext {
  previous: DecideSettingsRow | null | undefined;
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
      qc.setQueryData<DecideSettingsRow | null>(key, (old) => ({
        ...EMPTY_DECIDE_SETTINGS,
        user_id: vars.userId,
        ...(old ?? {}),
        ...vars.patch,
      }));
      return { previous };
    },
    onSuccess: (row: DecideSettingsRow, vars: UpdateDecideSettingsVars) => {
      qc.setQueryData(queryKeys.decideSettings(vars.userId), row);
    },
    onError: async (err: unknown, vars: UpdateDecideSettingsVars, context: unknown) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return; // unconditional, never conflicts
      const ctx = context as SettingsContext | undefined;
      if (ctx && ctx.previous !== undefined) qc.setQueryData(queryKeys.decideSettings(vars.userId), ctx.previous);
      else void qc.invalidateQueries({ queryKey: queryKeys.decideSettings(vars.userId) });
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
