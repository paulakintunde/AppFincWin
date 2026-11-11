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
import { confirmedSettings, isOldestQueued, queuedSettingsPatches, withQueued } from './decideSettingsQueue';

export interface UpdateDecideSettingsVars {
  userId: string;
  patch: DecideSettingsPatch;
}

interface SettingsContext {
  previous: DecideSettingsRow | null | undefined;
}

// WR-A07 / 05.3-117: the confirmed row and the queued edits are shared with decideSetup.ts (decideSettingsQueue.ts).

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
      // The oldest queued edit (of either kind) read the cache before any optimistic edit of this run, so its `previous` is the server's.
      if (isOldestQueued(qc, vars) && previous !== undefined) confirmedSettings.set(vars.userId, previous);
      qc.setQueryData<DecideSettingsRow | null>(key, (old) => ({
        ...EMPTY_DECIDE_SETTINGS,
        user_id: vars.userId,
        ...(old ?? {}),
        ...vars.patch,
      }));
      return { previous };
    },
    onSuccess: (row: DecideSettingsRow, vars: UpdateDecideSettingsVars) => {
      confirmedSettings.set(vars.userId, row);
      // 05.3-117: keep the edits still queued behind this one (either kind) on screen over the server row.
      qc.setQueryData(queryKeys.decideSettings(vars.userId), withQueued(row, queuedSettingsPatches(qc, vars.userId, vars)));
    },
    onError: async (err: unknown, vars: UpdateDecideSettingsVars, context: unknown) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return; // unconditional, never conflicts
      const key = queryKeys.decideSettings(vars.userId);
      const ctx = context as SettingsContext | undefined;
      const base = confirmedSettings.has(vars.userId) ? confirmedSettings.get(vars.userId) : ctx?.previous;
      if (base !== undefined) {
        // The server value plus every edit still queued, of either kind (this one is still pending while onError runs).
        const queued = queuedSettingsPatches(qc, vars.userId, vars);
        qc.setQueryData<DecideSettingsRow | null>(key, () =>
          queued.length === 0 ? base : withQueued({ ...EMPTY_DECIDE_SETTINGS, user_id: vars.userId, ...(base ?? {}) }, queued)
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

/**
 * 06 review P4-WR-07: the patch that puts back every column `forward` writes, from the row as it was before. A money figure
 * typed in another currency (stampSettingsPatch) clears every other money column and changes `currency` in the same
 * write, so an Undo that restores only the edited column would leave the user's other Decide figures wiped. Apply the
 * result as it is (do not stamp it again): it carries the old `currency` and every old figure. No row yet: every column
 * goes back to null.
 */
export function inverseSettingsPatch(forward: DecideSettingsPatch, settings: DecideSettingsRow | null): DecideSettingsPatch {
  const back: Record<string, unknown> = {};
  for (const key of Object.keys(forward) as (keyof DecideSettingsPatch)[]) {
    back[key] = settings === null ? null : (settings[key] ?? null);
  }
  return back as DecideSettingsPatch;
}
