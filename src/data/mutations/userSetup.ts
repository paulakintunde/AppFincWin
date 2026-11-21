// 09-13: writes for the person's private level, answers and feature switches. Same paused-mutation shape as accounts.ts.
// These tables are not lock-gated, so the writes go through while the household is locked (D-03).
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { replaceFeatureSwitches, upsertFeatureSwitch, upsertUserSetup } from '@/db/userSetup';
import type { UserSetup, UserSetupPatch } from '@/db/userSetup';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import { classifySettledWriteError, shouldRetryWrite, writeRetryDelay } from '@/data/sync/writeErrors';
import { guardSession, markSession } from '@/data/sync/sessionEpoch';
import { writeClient } from './writeClient';

export interface SaveUserSetupVars {
  userId: string;
  patch: UserSetupPatch;
  /** The cached version at call time; the write sends this plus one. */
  baseVersion: number;
}

export interface SetFeatureSwitchVars {
  userId: string;
  featureId: string;
  isOn: boolean;
}

export interface ReplaceFeatureSwitchesVars {
  userId: string;
  map: Record<string, boolean>;
}

export function registerUserSetupMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.saveUserSetup, {
    mutationFn: (vars: SaveUserSetupVars) =>
      guardSession(vars, async () => {
        const client = await writeClient();
        return upsertUserSetup(client, vars.userId, vars.patch, vars.baseVersion + 1);
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: SaveUserSetupVars) => {
      markSession(vars);
      const key = queryKeys.userSetup(vars.userId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<UserSetup | null>(key) ?? null;
      const base: UserSetup = {
        userId: vars.userId,
        level: null,
        levelSource: null,
        answers: {},
        resumeStep: null,
        completedAt: null,
        partnerVersion: false,
        existingCard: null,
        recordsAppliedAt: null,
        version: vars.baseVersion + 1,
      };
      const next: UserSetup = { ...base, ...(previous ?? {}) };
      for (const k of Object.keys(vars.patch) as (keyof UserSetupPatch)[]) {
        const v = vars.patch[k];
        if (v !== undefined) Object.assign(next, { [k]: v });
      }
      next.version = vars.baseVersion + 1;
      qc.setQueryData<UserSetup | null>(key, next);
      return { previous };
    },
    onSuccess: (row: UserSetup, vars: SaveUserSetupVars) => {
      qc.setQueryData<UserSetup | null>(queryKeys.userSetup(vars.userId), row);
    },
    onError: (err: unknown, vars: SaveUserSetupVars, context: unknown) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found' && cls !== 'conflict') return;
      const previous = (context as { previous: UserSetup | null } | undefined)?.previous ?? null;
      qc.setQueryData<UserSetup | null>(queryKeys.userSetup(vars.userId), previous);
    },
  });

  qc.setMutationDefaults(mutationKeys.setFeatureSwitch, {
    mutationFn: (vars: SetFeatureSwitchVars) =>
      guardSession(vars, async () => {
        const client = await writeClient();
        await upsertFeatureSwitch(client, vars.userId, vars.featureId, vars.isOn);
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: SetFeatureSwitchVars) => {
      markSession(vars);
      const key = queryKeys.featureSwitches(vars.userId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Record<string, boolean>>(key);
      qc.setQueryData<Record<string, boolean>>(key, { ...(previous ?? {}), [vars.featureId]: vars.isOn });
      return { previous };
    },
    onError: (err: unknown, vars: SetFeatureSwitchVars, context: unknown) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found' && cls !== 'conflict') return;
      const previous = (context as { previous: Record<string, boolean> | undefined } | undefined)?.previous;
      qc.setQueryData(queryKeys.featureSwitches(vars.userId), previous ?? {});
    },
  });

  qc.setMutationDefaults(mutationKeys.replaceFeatureSwitches, {
    mutationFn: (vars: ReplaceFeatureSwitchesVars) =>
      guardSession(vars, async () => {
        const client = await writeClient();
        await replaceFeatureSwitches(client, vars.userId, vars.map);
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: ReplaceFeatureSwitchesVars) => {
      markSession(vars);
      const key = queryKeys.featureSwitches(vars.userId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Record<string, boolean>>(key);
      qc.setQueryData<Record<string, boolean>>(key, { ...vars.map });
      return { previous };
    },
    onError: (err: unknown, vars: ReplaceFeatureSwitchesVars, context: unknown) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found' && cls !== 'conflict') return;
      const previous = (context as { previous: Record<string, boolean> | undefined } | undefined)?.previous;
      qc.setQueryData(queryKeys.featureSwitches(vars.userId), previous ?? {});
    },
  });
}

/** saveUserSetup(patch): optimistic, queued while offline. */
export function useSaveUserSetup(): { saveUserSetup(vars: SaveUserSetupVars): void } {
  const mutation = useMutation<UserSetup, unknown, SaveUserSetupVars>({
    mutationKey: mutationKeys.saveUserSetup,
    scope: WRITE_SCOPE,
  });
  return { saveUserSetup: (vars) => mutation.mutate(vars) };
}

/** setFeatureSwitch({ featureId, isOn }). */
export function useSetFeatureSwitch(): { setFeatureSwitch(vars: SetFeatureSwitchVars): void } {
  const mutation = useMutation<void, unknown, SetFeatureSwitchVars>({
    mutationKey: mutationKeys.setFeatureSwitch,
    scope: WRITE_SCOPE,
  });
  return { setFeatureSwitch: (vars) => mutation.mutate(vars) };
}

/** Onboarding Apply: replace every switch. */
export function useReplaceFeatureSwitches(): { replaceFeatureSwitches(vars: ReplaceFeatureSwitchesVars): void } {
  const mutation = useMutation<void, unknown, ReplaceFeatureSwitchesVars>({
    mutationKey: mutationKeys.replaceFeatureSwitches,
    scope: WRITE_SCOPE,
  });
  return { replaceFeatureSwitches: (vars) => mutation.mutate(vars) };
}
