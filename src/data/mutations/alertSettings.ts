// 10-03 (ALR-01..05): alert switches and delivery preferences. Same paused-mutation shape as userSetup.ts.
// These rows are the person's own settings, not lock-gated household records: the 09 plan lock does not apply.
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { DEFAULT_ALERT_PREFS, DEFAULT_ALERT_SETTINGS, ALERT_KINDS, upsertAlertPrefs, upsertAlertSetting } from '@/db/alerts';
import type { AlertPrefs, AlertSetting } from '@/db/alerts';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import { classifySettledWriteError, shouldRetryWrite, writeRetryDelay } from '@/data/sync/writeErrors';
import { guardSession, markSession } from '@/data/sync/sessionEpoch';
import { writeClient } from './writeClient';

export interface SaveAlertSettingVars {
  userId: string;
  /** The whole setting for one kind. */
  setting: Omit<AlertSetting, 'version'>;
  /** The cached version of this kind at call time; the write sends this plus one. */
  baseVersion: number;
}

export interface SaveAlertPrefsVars {
  userId: string;
  patch: Partial<Omit<AlertPrefs, 'version'>>;
  baseVersion: number;
}

function isRolledBack(err: unknown): boolean {
  const cls = classifySettledWriteError(err);
  return cls === 'rejected' || cls === 'not-found' || cls === 'conflict';
}

export function registerAlertMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.saveAlertSetting, {
    mutationFn: (vars: SaveAlertSettingVars) =>
      guardSession(vars, async () => {
        const client = await writeClient();
        return upsertAlertSetting(client, vars.userId, { ...vars.setting, version: vars.baseVersion }, vars.baseVersion + 1);
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: SaveAlertSettingVars) => {
      markSession(vars);
      const key = queryKeys.alertSettings(vars.userId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<AlertSetting[]>(key);
      const next: AlertSetting = { ...vars.setting, version: vars.baseVersion + 1 };
      const list = previous ?? ALERT_KINDS.map((k) => DEFAULT_ALERT_SETTINGS[k]);
      qc.setQueryData<AlertSetting[]>(
        key,
        list.map((s) => (s.kind === next.kind ? next : s))
      );
      return { previous };
    },
    onSuccess: (row: AlertSetting, vars: SaveAlertSettingVars) => {
      const key = queryKeys.alertSettings(vars.userId);
      const list = qc.getQueryData<AlertSetting[]>(key);
      if (list) qc.setQueryData<AlertSetting[]>(key, list.map((s) => (s.kind === row.kind ? row : s)));
    },
    onError: (err: unknown, vars: SaveAlertSettingVars, context: unknown) => {
      if (!isRolledBack(err)) return;
      const previous = (context as { previous: AlertSetting[] | undefined } | undefined)?.previous;
      if (previous) qc.setQueryData(queryKeys.alertSettings(vars.userId), previous);
      else qc.removeQueries({ queryKey: queryKeys.alertSettings(vars.userId), exact: true });
    },
  });

  qc.setMutationDefaults(mutationKeys.saveAlertPrefs, {
    mutationFn: (vars: SaveAlertPrefsVars) =>
      guardSession(vars, async () => {
        const client = await writeClient();
        // The merge base is the cached copy at send time (or the defaults), so a queued patch never drops a newer field.
        const cached = qc.getQueryData<AlertPrefs>(queryKeys.alertPrefs(vars.userId)) ?? DEFAULT_ALERT_PREFS;
        const merged: AlertPrefs = { ...cached, ...vars.patch, version: vars.baseVersion };
        return upsertAlertPrefs(client, vars.userId, merged, vars.baseVersion + 1);
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: SaveAlertPrefsVars) => {
      markSession(vars);
      const key = queryKeys.alertPrefs(vars.userId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<AlertPrefs>(key);
      qc.setQueryData<AlertPrefs>(key, { ...(previous ?? DEFAULT_ALERT_PREFS), ...vars.patch, version: vars.baseVersion + 1 });
      return { previous };
    },
    onSuccess: (row: AlertPrefs, vars: SaveAlertPrefsVars) => {
      qc.setQueryData<AlertPrefs>(queryKeys.alertPrefs(vars.userId), row);
    },
    onError: (err: unknown, vars: SaveAlertPrefsVars, context: unknown) => {
      if (!isRolledBack(err)) return;
      const previous = (context as { previous: AlertPrefs | undefined } | undefined)?.previous;
      if (previous) qc.setQueryData(queryKeys.alertPrefs(vars.userId), previous);
      else qc.removeQueries({ queryKey: queryKeys.alertPrefs(vars.userId), exact: true });
    },
  });
}

/** saveAlertSetting({ userId, setting, baseVersion }): optimistic, queued while offline. */
export function useSaveAlertSetting(): { saveAlertSetting(vars: SaveAlertSettingVars): void } {
  const mutation = useMutation<AlertSetting, unknown, SaveAlertSettingVars>({
    mutationKey: mutationKeys.saveAlertSetting,
    scope: WRITE_SCOPE,
  });
  return { saveAlertSetting: (vars) => mutation.mutate(vars) };
}

/** saveAlertPrefs({ userId, patch, baseVersion }): the patch merges into the cached prefs. */
export function useSaveAlertPrefs(): { saveAlertPrefs(vars: SaveAlertPrefsVars): void } {
  const mutation = useMutation<AlertPrefs, unknown, SaveAlertPrefsVars>({
    mutationKey: mutationKeys.saveAlertPrefs,
    scope: WRITE_SCOPE,
  });
  return { saveAlertPrefs: (vars) => mutation.mutate(vars) };
}
