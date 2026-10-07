// D-01/D-06/D-25: paused-mutation defaults for the profile's money preferences (home
// currency, Show cents, lead figure). Same shape as transactions.ts/accounts.ts, but writes
// are not version-conditional -- preferences are a user's own settings row, not a shared
// record D-18 governs (see src/db/profile.ts's header comment).
import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { setHomeCurrencyIfStill, updateMoneyPrefs, type MoneyPrefsPatch } from '@/db/profile';
import type { MoneyPrefsRow } from '@/db/rows';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import {
  classifySettledWriteError,
  settledWriteErrorCode,
  shouldRetryWrite,
  writeRetryDelay,
} from '@/data/sync/writeErrors';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { writeClient } from './writeClient';
import { guardSession, markSession } from '@/data/sync/sessionEpoch';
import { DEFAULT_MONEY_PREFS } from '@/data/queries/moneyPrefs';

/** The server-side default new profiles are created with (20260924000200_money_prefs.sql). */
export const SERVER_DEFAULT_CURRENCY = 'USD';

export interface UpdateMoneyPrefsVars {
  userId: string;
  patch: MoneyPrefsPatch;
}

interface MutationContext {
  previous: MoneyPrefsRow | undefined;
}

// WR-A01: writes go through ./writeClient (lazy require + session check).

export function registerMoneyPrefsMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.updateMoneyPrefs, {
    mutationFn: (vars: UpdateMoneyPrefsVars) => guardSession(vars, async () => updateMoneyPrefs(await writeClient(), vars.userId, vars.patch)),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: UpdateMoneyPrefsVars): Promise<MutationContext> => {
      markSession(vars); // WR-A09
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
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return; // prefs are unconditional, never conflict

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
        code: settledWriteErrorCode(err),
        attempted: { ...vars.patch },
      });
    },
  });
}

export function useUpdateMoneyPrefs(userId: string): {
  setHomeCurrency(code: string): void;
  setShowCents(on: boolean): void;
  setLeadFigure(figure: 'home' | 'original'): void;
  /** RD-02: the user's own explicit in-app region override; null clears it back to "unset". */
  setRegion(region: string | null): void;
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
    setRegion(region: string | null): void {
      mutation.mutate({ userId, patch: { region } });
    },
  };
}

/**
 * W6-13 WR-07: the device-region default for a fresh profile. Unlike setHomeCurrency (an
 * unconditional, queued patch) this is one direct conditional write: it applies only while the
 * profile still holds SERVER_DEFAULT_CURRENCY, so a real choice -- including one made on another
 * device after this device read the prefs -- is never overwritten. Resolves true when it applied,
 * false when the currency had already been changed; throws (nothing written) when offline or on a
 * server error, so the caller can try again later. Not queued on purpose: a default that lands
 * long after sign-in could race a choice the user has made since.
 */
export function useSetHomeCurrencyIfDefault(userId: string): (target: string) => Promise<boolean> {
  const qc = useQueryClient();
  return useCallback(
    async (target: string): Promise<boolean> => {
      const row = await setHomeCurrencyIfStill(await writeClient(), userId, target, SERVER_DEFAULT_CURRENCY);
      if (row) qc.setQueryData(queryKeys.moneyPrefs(userId), row);
      else await qc.invalidateQueries({ queryKey: queryKeys.moneyPrefs(userId) });
      return row !== null;
    },
    [qc, userId]
  );
}
