// The shared read context every Record screen builds its own queries from (REC-01, D-22,
// D-25): the signed-in user and household id, the user's home-currency/show-cents
// preference, the device's own time zone, and today's local date in that zone. `ready`
// stays false until auth/household/prefs have all resolved, so a screen never mistakes a
// still-loading identity for a genuine signed-out or no-household state.
import { useHouseholdId } from '@/data/queries/household';
import { useMoneyPrefs } from '@/data/queries/moneyPrefs';
import { localDateIn } from '@/engine/time';
import { useAuth } from '@/features/auth/AuthProvider';
import { getDeviceTimeZone } from '@/services/locale/deviceLocale';

export interface RecordContext {
  ready: boolean;
  userId: string | null;
  householdId: string | null;
  homeCurrency: string;
  showCents: boolean;
  region: string | null;
  timeZone: string;
  today: string;
}

export function useRecordContext(): RecordContext {
  const { status, user } = useAuth();
  const userId = user?.id ?? null;
  const householdQuery = useHouseholdId(userId ?? undefined);
  const prefsQuery = useMoneyPrefs(userId ?? undefined);
  const { prefs } = prefsQuery;
  const timeZone = getDeviceTimeZone();
  const today = localDateIn(new Date(), timeZone);

  // I-05 (W6-13 WR-07): `ready` is a decision input (a new account's default currency, the
  // Activity screen), so it waits for a successful prefs read. A failed or offline-paused read
  // leaves `prefs` as the USD placeholder, which is not the user's home currency. A copy restored
  // from the persisted cache counts as a success.
  const ready =
    status !== 'loading' &&
    userId !== null &&
    !householdQuery.isLoading &&
    householdQuery.data !== undefined &&
    householdQuery.data !== null &&
    !prefsQuery.loading &&
    prefsQuery.isSuccess;

  return {
    ready,
    userId,
    householdId: householdQuery.data ?? null,
    homeCurrency: prefs.home_currency,
    showCents: prefs.show_cents,
    region: prefs.region,
    timeZone,
    today,
  };
}
