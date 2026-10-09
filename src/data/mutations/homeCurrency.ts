// REC-25, CONTEXT D-22, UI-SPEC Confirmed Decision 11: changing the home currency is one
// all-or-nothing online action. Today's rates for the new home currency against every currency in
// use (the old home included) are fetched and stored FIRST, awaited; only then is the
// change_home_currency RPC called, which converts the caps and switches the preference in one
// server transaction. Any failure leaves the home currency and every cap unchanged.
// Phase 1 D-05 still holds: no transaction row is rewritten; only the preference, caps and shared
// rates change. Direct awaited calls (like useSetHomeCurrencyIfDefault), never queued.
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { changeHomeCurrency, RatesUnavailableError } from '@/db/recordPrefs';
import { VersionConflictError } from '@/db/errors';
import type { MoneyPrefsRow } from '@/db/rows';
import { queryKeys } from '@/data/keys';
import { DEFAULT_MONEY_PREFS } from '@/data/queries/moneyPrefs';
import { localDateIn } from '@/engine/time';
import { getDeviceTimeZone } from '@/services/locale/deviceLocale';
import { fetchRatesForHomeChange } from './homeCurrencyRates';
import { writeClient } from './writeClient';

export type HomeCurrencyChangeResult = { ok: true; capsConverted: number } | { ok: false; reason: 'rates' | 'changed' };

export function useChangeHomeCurrency(ctx: { userId: string; householdId: string; currentHome: string }): {
  change(next: string): Promise<HomeCurrencyChangeResult>;
  pending: boolean;
} {
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const { userId, householdId, currentHome } = ctx;

  const change = useCallback(
    async (next: string): Promise<HomeCurrencyChangeResult> => {
      setPending(true);
      try {
        const today = localDateIn(new Date(), getDeviceTimeZone());
        const rates = await fetchRatesForHomeChange(qc, { next, previous: currentHome, date: today, householdId });
        if (rates === 'failed') return { ok: false, reason: 'rates' };

        const res = await changeHomeCurrency(await writeClient(), { next, from: currentHome, today });
        if (res.status === 'applied') {
          qc.setQueryData<MoneyPrefsRow>(queryKeys.moneyPrefs(userId), (old) => ({
            ...(old ?? DEFAULT_MONEY_PREFS),
            home_currency: next,
          }));
        }
        void qc.invalidateQueries({ queryKey: queryKeys.categories(userId) });
        void qc.invalidateQueries({ queryKey: queryKeys.fxLatest() });
        void qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(householdId) });
        return { ok: true, capsConverted: res.capsConverted };
      } catch (err) {
        if (err instanceof VersionConflictError) {
          void qc.invalidateQueries({ queryKey: queryKeys.moneyPrefs(userId) });
          return { ok: false, reason: 'changed' };
        }
        if (err instanceof RatesUnavailableError) return { ok: false, reason: 'rates' };
        return { ok: false, reason: 'rates' }; // offline / network: nothing changed
      } finally {
        setPending(false);
      }
    },
    [qc, userId, householdId, currentHome]
  );

  return { change, pending };
}
