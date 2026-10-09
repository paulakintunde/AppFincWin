// The shared read context every Record screen builds its own queries from (REC-01, D-22,
// D-25): the signed-in user and household id, the user's home-currency/show-cents
// preference, the device's own time zone, and today's local date in that zone. `ready`
// stays false until auth/household/prefs have all resolved, so a screen never mistakes a
// still-loading identity for a genuine signed-out or no-household state.
//
// Phase 2.2 (D-11, D-16, D-23) adds weekStart, horizonMonth, hasSamples and samplePromptAnswered.
// weekStart follows the region-preference precedence: the stored user setting, else the device
// region default (override > device region > time zone; never IP), else Monday. These reads are
// not part of `ready`; they fall back while loading.
import { useHouseholdId } from '@/data/queries/household';
import { useMoneyPrefs } from '@/data/queries/moneyPrefs';
import { useHouseholdHorizon, useRecordPrefs, useSampleExists } from '@/data/queries/recordPrefs';
import { regionWeekStart } from '@/engine/money';
import { localDateIn } from '@/engine/time';
import { useAuth } from '@/features/auth/AuthProvider';
import { getDeviceRegion, getDeviceTimeZone } from '@/services/locale/deviceLocale';

export interface RecordContext {
  ready: boolean;
  userId: string | null;
  householdId: string | null;
  homeCurrency: string;
  showCents: boolean;
  region: string | null;
  timeZone: string;
  today: string;
  weekStart: 0 | 1;
  horizonMonth: string | null;
  hasSamples: boolean;
  samplePromptAnswered: boolean;
}

export function useRecordContext(): RecordContext {
  const { status, user } = useAuth();
  const userId = user?.id ?? null;
  const householdQuery = useHouseholdId(userId ?? undefined);
  const prefsQuery = useMoneyPrefs(userId ?? undefined);
  const { prefs } = prefsQuery;
  const recordPrefs = useRecordPrefs(userId ?? undefined).prefs;
  const { horizonMonth } = useHouseholdHorizon(householdQuery.data ?? undefined);
  const { hasSamples } = useSampleExists(householdQuery.data ?? undefined);
  const timeZone = getDeviceTimeZone();
  const today = localDateIn(new Date(), timeZone);
  const weekStart: 0 | 1 = recordPrefs.week_start ?? regionWeekStart(getDeviceRegion(prefs.region)) ?? 1;

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
    weekStart,
    horizonMonth,
    hasSamples,
    samplePromptAnswered: recordPrefs.sample_prompt_answered_at !== null,
  };
}
