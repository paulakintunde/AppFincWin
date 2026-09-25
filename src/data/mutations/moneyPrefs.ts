// D-01/D-06/D-25: paused-mutation defaults for the profile's money preferences (home
// currency, Show cents, lead figure). Same shape as transactions.ts/accounts.ts, but writes
// are not version-conditional -- preferences are a user's own settings row, not a shared
// record D-18 governs (see src/db/profile.ts's header comment).
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { updateMoneyPrefs, type MoneyPrefsPatch } from '@/db/profile';
import type { MoneyPrefsRow } from '@/db/rows';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import { classifyWriteError, shouldRetryWrite, writeRetryDelay } from '@/data/sync/writeErrors';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { writeClient } from './writeClient';
import { DEFAULT_MONEY_PREFS } from '@/data/queries/moneyPrefs';

export interface UpdateMoneyPrefsVars {
  userId: string;
  patch: MoneyPrefsPatch;
}

interface MutationContext {
  previous: MoneyPrefsRow | undefined;
}

// WR-A01: writes go through ./writeClient (lazy require + session check).

function errorCode(err: unknown): string {
  return err instanceof Error && 'code' in err ? String((err as { code: unknown }).code) : '';
}

export function registerMoneyPrefsMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.updateMoneyPrefs, {
    mutationFn: async (vars: UpdateMoneyPrefsVars) => updateMoneyPrefs(await writeClient(), vars.userId, vars.patch),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: UpdateMoneyPrefsVars): Promise<MutationContext> => {
      const key = queryKeys.moneyPrefs(vars.userId);
      await qc.cancelQueries({ queryKey: key });

      const previous = qc.getQueryData<MoneyPrefsRow>(key);
      qc.setQueryData<MoneyPrefsRow>(key, (old) => ({ ...(old ?? DEFAULT_MONEY_PREFS), ...vars.patch }));
      return { previous };
    },
    onSuccess: (row: MoneyPrefsRow, vars: UpdateMoneyPrefsVars) => {
      // D-05: changing home currency never rewrites transaction history -- only this cache
      // entry is ever touched, nothing else is invalidated.
      qc.setQueryData(queryKeys.moneyPrefs(vars.userId), row);
    },
    onError: async (err: unknown, vars: UpdateMoneyPrefsVars, context: unknown) => {
      const cls = classifyWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return; // transient retries

      const previous = (context as MutationContext | undefined)?.previous;
      if (previous) {
        qc.setQueryData(queryKeys.moneyPrefs(vars.userId), previous);
      } else {
        await qc.invalidateQueries({ queryKey: queryKeys.moneyPrefs(vars.userId) });
      }

      await recordFailedWrite({
        entity: 'profiles',
        entityId: vars.userId,
        kind: cls,
        code: errorCode(err),
        attempted: { ...vars.patch },
      });
    },
  });
}

export function useUpdateMoneyPrefs(userId: string): {
  setHomeCurrency(code: string): void;
  setShowCents(on: boolean): void;
  setLeadFigure(figure: 'home' | 'original'): void;
} {
  const mutation = useMutation<MoneyPrefsRow, unknown, UpdateMoneyPrefsVars, MutationContext>({
    mutationKey: mutationKeys.updateMoneyPrefs,
    scope: WRITE_SCOPE,
  });

  return {
    setHomeCurrency(code: string): void {
      mutation.mutate({ userId, patch: { home_currency: code } });
    },
    setShowCents(on: boolean): void {
      mutation.mutate({ userId, patch: { show_cents: on } });
    },
    setLeadFigure(figure: 'home' | 'original'): void {
      mutation.mutate({ userId, patch: { lead_figure: figure } });
    },
  };
}
