// ACT-16, CONTEXT D-11, D-23: week start and the sample-prompt marker are the user's own
// settings on profiles, written unconditionally (no expected_version) like moneyPrefs.ts.
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { updateRecordPrefs, type RecordPrefsRow } from '@/db/recordPrefs';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import { DEFAULT_RECORD_PREFS } from '@/data/queries/recordPrefs';
import {
  classifySettledWriteError,
  settledWriteErrorCode,
  shouldRetryWrite,
  writeRetryDelay,
} from '@/data/sync/writeErrors';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { guardSession, markSession } from '@/data/sync/sessionEpoch';
import { writeClient } from './writeClient';

export interface UpdateRecordPrefsVars {
  userId: string;
  patch: Partial<RecordPrefsRow>;
}

interface PrefsContext {
  previous: RecordPrefsRow | undefined;
}

export function registerRecordPrefsMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.updateRecordPrefs, {
    mutationFn: (vars: UpdateRecordPrefsVars) =>
      guardSession(vars, async () => updateRecordPrefs(await writeClient(), vars.userId, vars.patch)),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: UpdateRecordPrefsVars): Promise<PrefsContext> => {
      markSession(vars);
      const key = queryKeys.recordPrefs(vars.userId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<RecordPrefsRow>(key);
      qc.setQueryData<RecordPrefsRow>(key, (old) => ({ ...(old ?? DEFAULT_RECORD_PREFS), ...vars.patch }));
      return { previous };
    },
    onSuccess: (row: RecordPrefsRow, vars: UpdateRecordPrefsVars) => {
      qc.setQueryData(queryKeys.recordPrefs(vars.userId), row);
    },
    onError: async (err: unknown, vars: UpdateRecordPrefsVars, context: unknown) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return; // unconditional, never conflicts
      const previous = (context as PrefsContext | undefined)?.previous;
      if (previous) qc.setQueryData(queryKeys.recordPrefs(vars.userId), previous);
      else void qc.invalidateQueries({ queryKey: queryKeys.recordPrefs(vars.userId) });
      await recordFailedWrite({
        entity: 'profiles',
        entityId: vars.userId,
        kind: cls,
        code: settledWriteErrorCode(err),
        attempted: { ...vars.patch },
      });
    },
  });
}

export function useUpdateRecordPrefs(userId: string): {
  setWeekStart(day: 0 | 1): void;
  markSamplePromptAnswered(): void;
} {
  const mutation = useMutation<RecordPrefsRow, unknown, UpdateRecordPrefsVars, PrefsContext>({
    mutationKey: mutationKeys.updateRecordPrefs,
    scope: WRITE_SCOPE,
  });

  return {
    setWeekStart(day: 0 | 1): void {
      mutation.mutate({ userId, patch: { week_start: day } });
    },
    markSamplePromptAnswered(): void {
      mutation.mutate({ userId, patch: { sample_prompt_answered_at: new Date().toISOString() } });
    },
  };
}
