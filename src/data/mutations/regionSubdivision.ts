// 06.1-71 (CN-10, OQ-71-1 B): the paused-mutation default for profiles.region_subdivision, the state or province the sales tax
// estimate reads (05.4 D-19). Same shape as moneyPrefs.ts: a user's own settings column, written unconditionally, applied to the
// cache at once (so Decide's Price step updates before the write lands) and put back when the server rejects it.
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { updateRegionSubdivision } from '@/db/profile';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import { classifySettledWriteError, settledWriteErrorCode, shouldRetryWrite, writeRetryDelay } from '@/data/sync/writeErrors';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { guardSession, markSession } from '@/data/sync/sessionEpoch';
import { writeClient } from './writeClient';

export interface UpdateRegionSubdivisionVars {
  userId: string;
  /** 1-3 upper-case letters or digits ('ON', 'CA'), or null for none. */
  value: string | null;
}

interface MutationContext {
  had: boolean;
  previous: string | null | undefined;
}

export function registerRegionSubdivisionMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.updateRegionSubdivision, {
    mutationFn: (vars: UpdateRegionSubdivisionVars) =>
      guardSession(vars, async () => updateRegionSubdivision(await writeClient(), vars.userId, vars.value)),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: UpdateRegionSubdivisionVars): Promise<MutationContext> => {
      markSession(vars);
      const key = queryKeys.regionSubdivision(vars.userId);
      await qc.cancelQueries({ queryKey: key });
      const had = qc.getQueryState(key) !== undefined;
      const previous = qc.getQueryData<string | null>(key);
      qc.setQueryData<string | null>(key, vars.value);
      return { had, previous };
    },
    onError: async (err: unknown, vars: UpdateRegionSubdivisionVars, context: unknown) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return; // a settings column: never a conflict
      const key = queryKeys.regionSubdivision(vars.userId);
      const ctx = context as MutationContext | undefined;
      if (ctx?.had === true && ctx.previous !== undefined) qc.setQueryData(key, ctx.previous);
      else await qc.invalidateQueries({ queryKey: key });
      await recordFailedWrite({
        entity: 'profiles',
        entityId: vars.userId,
        kind: cls,
        code: settledWriteErrorCode(err),
        attempted: { region_subdivision: vars.value },
      });
    },
  });
}

/** Sets (or clears, with null) the state or province for the sales tax estimate. */
export function useSetRegionSubdivision(userId: string): (value: string | null) => void {
  const mutation = useMutation<void, unknown, UpdateRegionSubdivisionVars, MutationContext>({
    mutationKey: mutationKeys.updateRegionSubdivision,
    scope: WRITE_SCOPE,
  });
  return (value: string | null) => mutation.mutate({ userId, value });
}
