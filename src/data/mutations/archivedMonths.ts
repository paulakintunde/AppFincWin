// 10-03 (DAT-01): archive and restore months. Same paused-mutation shape as userSetup.ts.
// These rows are the person's own settings, not lock-gated household records: the 09 plan lock does not apply.
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { deleteAllArchivedMonths, deleteArchivedMonth, insertArchivedMonth } from '@/db/archivedMonths';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import { classifySettledWriteError, shouldRetryWrite, writeRetryDelay } from '@/data/sync/writeErrors';
import { guardSession, markSession } from '@/data/sync/sessionEpoch';
import { writeClient } from './writeClient';

export interface ArchiveMonthVars {
  userId: string;
  /** 'YYYY-MM' */
  month: string;
}

export interface RestoreAllMonthsVars {
  userId: string;
}

type Previous = { previous: string[] | undefined };

function sortedDesc(months: string[]): string[] {
  return [...months].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

function rollbackOnRejected(qc: QueryClient, userId: string, err: unknown, context: unknown): void {
  const cls = classifySettledWriteError(err);
  if (cls !== 'rejected' && cls !== 'not-found' && cls !== 'conflict') return;
  qc.setQueryData(queryKeys.archivedMonths(userId), (context as Previous | undefined)?.previous ?? []);
}

export function registerArchivedMonthMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.archiveMonth, {
    mutationFn: (vars: ArchiveMonthVars) =>
      guardSession(vars, async () => {
        const client = await writeClient();
        await insertArchivedMonth(client, vars.userId, vars.month);
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: ArchiveMonthVars) => {
      markSession(vars);
      const key = queryKeys.archivedMonths(vars.userId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<string[]>(key);
      const list = previous ?? [];
      qc.setQueryData<string[]>(key, list.includes(vars.month) ? list : sortedDesc([...list, vars.month]));
      return { previous } satisfies Previous;
    },
    onError: (err: unknown, vars: ArchiveMonthVars, context: unknown) => rollbackOnRejected(qc, vars.userId, err, context),
  });

  qc.setMutationDefaults(mutationKeys.restoreMonth, {
    mutationFn: (vars: ArchiveMonthVars) =>
      guardSession(vars, async () => {
        const client = await writeClient();
        await deleteArchivedMonth(client, vars.userId, vars.month);
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: ArchiveMonthVars) => {
      markSession(vars);
      const key = queryKeys.archivedMonths(vars.userId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<string[]>(key);
      qc.setQueryData<string[]>(key, (previous ?? []).filter((m) => m !== vars.month));
      return { previous } satisfies Previous;
    },
    onError: (err: unknown, vars: ArchiveMonthVars, context: unknown) => rollbackOnRejected(qc, vars.userId, err, context),
  });

  qc.setMutationDefaults(mutationKeys.restoreAllMonths, {
    mutationFn: (vars: RestoreAllMonthsVars) =>
      guardSession(vars, async () => {
        const client = await writeClient();
        await deleteAllArchivedMonths(client, vars.userId);
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: RestoreAllMonthsVars) => {
      markSession(vars);
      const key = queryKeys.archivedMonths(vars.userId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<string[]>(key);
      qc.setQueryData<string[]>(key, []);
      return { previous } satisfies Previous;
    },
    onError: (err: unknown, vars: RestoreAllMonthsVars, context: unknown) => rollbackOnRejected(qc, vars.userId, err, context),
  });
}

/** archiveMonth({ userId, month }): optimistic, queued while offline. */
export function useArchiveMonth(): { archiveMonth(vars: ArchiveMonthVars): void } {
  const mutation = useMutation<void, unknown, ArchiveMonthVars>({ mutationKey: mutationKeys.archiveMonth, scope: WRITE_SCOPE });
  return { archiveMonth: (vars) => mutation.mutate(vars) };
}

export function useRestoreMonth(): { restoreMonth(vars: ArchiveMonthVars): void } {
  const mutation = useMutation<void, unknown, ArchiveMonthVars>({ mutationKey: mutationKeys.restoreMonth, scope: WRITE_SCOPE });
  return { restoreMonth: (vars) => mutation.mutate(vars) };
}

export function useRestoreAllMonths(): { restoreAllMonths(vars: RestoreAllMonthsVars): void } {
  const mutation = useMutation<void, unknown, RestoreAllMonthsVars>({ mutationKey: mutationKeys.restoreAllMonths, scope: WRITE_SCOPE });
  return { restoreAllMonths: (vars) => mutation.mutate(vars) };
}
