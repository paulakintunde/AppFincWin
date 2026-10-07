// 02-31 finding 2 (user decision 2026-10-07): on first sign-in, start a fresh profile's home
// currency from the device region instead of the database's 'USD' placeholder. Precedence is
// the project's usual: explicit user override (profiles.region) > device region > time zone;
// never an IP lookup. The user can still change it on the You screen.
//
// There is no "never chose a currency" column on profiles, so "never set" is approximated:
//   - the profile still holds the server default 'USD', AND
//   - the household has no accounts (every transaction needs an account, so none can exist), AND
//   - this check has not run before for this user on this device (an AsyncStorage flag), so it
//     happens once, right after sign-in/consent, before the user can reach the You screen.
// Limitation: a user who explicitly picks USD and still has no account on a second device would
// be re-evaluated there; and the flag is per device. See 02-31-WALKTHROUGH-FIXES.md.
// W6-13 WR-07: the decision needs a successful prefs read made in this mount (a failed read shows
// the USD placeholder), and the write itself is conditional on the server still holding USD, so a
// real choice -- even one made on another device a moment earlier -- is never overwritten.
import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAccounts } from '@/data/queries/accounts';
import { useCurrencyOptions } from '@/data/queries/currencyOptions';
import { useHouseholdId } from '@/data/queries/household';
import { useMoneyPrefs } from '@/data/queries/moneyPrefs';
import { useSetHomeCurrencyIfDefault } from '@/data/mutations/moneyPrefs';
import { currencyForRegion } from '@/engine/money';
import { useAuth } from '@/features/auth/AuthProvider';
import { getDeviceRegion } from '@/services/locale/deviceLocale';

/** The server-side default new profiles are created with (20260924000200_money_prefs.sql). */
const SERVER_DEFAULT_CURRENCY = 'USD';

export function homeCurrencyDefaultKey(userId: string): string {
  return `fincwin:home-currency-default:${userId}`;
}

export function useDeviceHomeCurrencyDefault(): void {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const household = useHouseholdId(userId ?? undefined);
  const householdId = household.data ?? undefined;
  const prefsQuery = useMoneyPrefs(userId ?? undefined);
  const { prefs } = prefsQuery;
  const accounts = useAccounts(householdId);
  const { options, loading: optionsLoading } = useCurrencyOptions(userId ?? undefined);
  const setHomeCurrencyIfDefault = useSetHomeCurrencyIfDefault(userId ?? '');
  const ran = useRef<string | null>(null);

  const accountsData = accounts.data;
  const ready =
    userId !== null &&
    householdId !== undefined &&
    // W6-13 WR-07: decide only from a real, fresh read. A failed read returns the USD placeholder
    // and a persisted copy may predate a choice made on another device; both look like the default.
    prefsQuery.isSuccess &&
    !prefsQuery.isError &&
    prefsQuery.isFetchedAfterMount &&
    accountsData !== undefined &&
    !accounts.isError &&
    accounts.isFetchedAfterMount &&
    !optionsLoading &&
    options.length > 0;

  useEffect(() => {
    if (!ready || userId === null || accountsData === undefined || ran.current === userId) return;
    ran.current = userId;

    void (async () => {
      const key = homeCurrencyDefaultKey(userId);
      try {
        if ((await AsyncStorage.getItem(key)) !== null) return;

        const target = currencyForRegion(getDeviceRegion(prefs.region));
        const untouched = prefs.home_currency === SERVER_DEFAULT_CURRENCY && accountsData.length === 0;
        if (untouched && target && target !== prefs.home_currency && options.some((o) => o.code === target)) {
          // WR-07: conditional on the server still holding USD, so a concurrent explicit choice
          // wins; false (it changed meanwhile) is still a completed check. A throw (offline,
          // server error) skips the flag below so the check runs again next launch.
          await setHomeCurrencyIfDefault(target);
        }
        await AsyncStorage.setItem(key, '1');
      } catch {
        // Best effort: a failed flag read/write just means the check may run again next launch,
        // and it still only ever applies to an untouched profile.
        ran.current = null;
      }
    })();
  }, [ready, userId, accountsData, prefs.home_currency, prefs.region, options, setHomeCurrencyIfDefault]);
}

/** Mounted once in the signed-in layout, beside the undo toast host. */
export function DeviceHomeCurrencyDefault(): null {
  useDeviceHomeCurrencyDefault();
  return null;
}
