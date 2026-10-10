// ACT-11, CONTEXT D-18: "Not now" on a series offer is stored per user on the server, so the
// offer stays hidden on every device. There is no undo step: dismissal is permanent by design
// (UI-SPEC 3). The cache is updated first so offers vanish at once.
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { DISMISS_BATCH_MAX, insertDismissedOffers } from '@/db/dismissedOffers';
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

export interface DismissOffersVars {
  userId: string;
  keys: string[];
}

interface DismissContext {
  previous: ReadonlySet<string> | undefined;
}

export function registerDismissOffersMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.dismissOffers, {
    mutationFn: (vars: DismissOffersVars) =>
      guardSession(vars, async () => insertDismissedOffers(await writeClient(), vars.keys)),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: DismissOffersVars): Promise<DismissContext> => {
      markSession(vars);
      const key = queryKeys.dismissedOffers(vars.userId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ReadonlySet<string>>(key);
      qc.setQueryData<ReadonlySet<string>>(key, new Set([...(previous ?? []), ...vars.keys]));
      return { previous };
    },
    onError: async (err: unknown, vars: DismissOffersVars, context: unknown) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return;
      const key = queryKeys.dismissedOffers(vars.userId);
      const previous = (context as DismissContext | undefined)?.previous;
      if (previous) qc.setQueryData<ReadonlySet<string>>(key, previous);
      else void qc.invalidateQueries({ queryKey: key });
      // Counts only (T-02.2-23-03): offer keys embed merchant names.
      await recordFailedWrite({
        entity: 'dismissed_series_offers',
        entityId: vars.userId,
        kind: cls,
        code: settledWriteErrorCode(err),
        attempted: { count: vars.keys.length },
      });
    },
  });
}

export function useDismissOffers(userId: string): { dismiss(keys: readonly string[]): void } {
  const mutation = useMutation<void, unknown, DismissOffersVars, DismissContext>({
    mutationKey: mutationKeys.dismissOffers,
    scope: WRITE_SCOPE,
  });

  return {
    dismiss(keys: readonly string[]): void {
      if (keys.length === 0 || keys.length > DISMISS_BATCH_MAX) {
        throw new RangeError(`useDismissOffers: ${keys.length} keys is outside 1..${DISMISS_BATCH_MAX}`);
      }
      mutation.mutate({ userId, keys: [...new Set(keys)] });
    },
  };
}
