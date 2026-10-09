// 02-DECISION-fx-on-demand.md point 3 (amended 2026-10-07): changing the home currency asks the
// server for TODAY's rate for the new home currency against every other currency the household
// uses, so converted totals work at once. Phase 1 D-05 still holds: no transaction row is touched;
// only rates are added to the shared store.
//
// A check that cannot complete (offline, throttled, 502, household unknown) is persisted -- only
// the latest one -- and retried by the pending sweep inside its call budget. The key starts with
// `fincwin:` so wipeDeviceData() clears it (src/services/storage/wipe.ts STORAGE_PREFIX); a record
// for another user than the session is dropped unread. It holds a user id, a code and a date.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueryClient } from '@tanstack/react-query';
import { fetchHouseholdCurrencies } from '@/db/householdCurrencies';
import { MAX_CODES_PER_ENSURE, requestRatesForDate } from '@/db/fxResolve';
import { queryKeys } from '@/data/keys';
import { isResolveRateThrottled } from '@/data/sync/resolveRateBackoff';
import type { SweepBudget } from '@/data/sync/sweepBudget';
import { lazySupabaseClient } from './transactionCache';

export const HOME_RATE_CHECK_KEY = 'fincwin:fx-home-rate-check';

export interface HomeRateCheck {
  userId: string;
  homeCurrency: string;
  date: string;
  householdId: string | null;
}

function isCheck(v: unknown): v is HomeRateCheck {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c.userId === 'string' &&
    typeof c.homeCurrency === 'string' &&
    typeof c.date === 'string' &&
    (c.householdId === null || typeof c.householdId === 'string')
  );
}

async function readCheck(): Promise<HomeRateCheck | null> {
  try {
    const raw = await AsyncStorage.getItem(HOME_RATE_CHECK_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isCheck(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeCheck(check: HomeRateCheck | null): Promise<void> {
  try {
    if (check === null) await AsyncStorage.removeItem(HOME_RATE_CHECK_KEY);
    else await AsyncStorage.setItem(HOME_RATE_CHECK_KEY, JSON.stringify(check));
  } catch {
    // Best-effort: a lost retry only means rates arrive with the next foreign line instead.
  }
}

/**
 * One chunk loop for both paths: every call carries the new home currency, so each chunk holds
 * up to 49 others. Returns the stored codes of every chunk, 'budget' when the sweep budget ran
 * out, or null when any chunk was not answered (throttled/offline/server error).
 */
async function requestHomeChunks(
  client: ReturnType<typeof lazySupabaseClient>,
  date: string,
  home: string,
  others: readonly string[],
  budget?: SweepBudget
): Promise<string[][] | 'budget' | null> {
  const size = MAX_CODES_PER_ENSURE - 1;
  const all: string[][] = [];
  for (let i = 0; i < others.length; i += size) {
    if (budget && !budget.take()) return 'budget';
    const stored = await requestRatesForDate(client, date, [home, ...others.slice(i, i + size)]);
    if (stored === null) return null;
    all.push(stored);
  }
  return all;
}

type Outcome = 'done' | 'nothing-to-fetch' | 'deferred';

async function attempt(qc: QueryClient, check: HomeRateCheck, budget?: SweepBudget): Promise<Outcome> {
  try {
    if (isResolveRateThrottled()) return 'deferred';
    const householdId = check.householdId ?? qc.getQueryData<string | null>(queryKeys.household(check.userId)) ?? null;
    if (householdId === null) return 'deferred';

    const client = lazySupabaseClient();
    const others = (await fetchHouseholdCurrencies(client, householdId)).filter((c) => c !== check.homeCurrency);
    if (others.length === 0) return 'nothing-to-fetch';

    const chunks = await requestHomeChunks(client, check.date, check.homeCurrency, others, budget);
    if (chunks === 'budget' || chunks === null) return 'deferred';
    void qc.invalidateQueries({ queryKey: queryKeys.fxLatest() });
    return 'done';
  } catch {
    return 'deferred';
  }
}

/** Never throws. Persists the check on 'deferred', clears it otherwise. */
export async function ensureRatesForHomeChange(qc: QueryClient, check: HomeRateCheck, budget?: SweepBudget): Promise<Outcome> {
  const outcome = await attempt(qc, check, budget);
  await writeCheck(outcome === 'deferred' ? check : null);
  return outcome;
}

/** Sweep step: re-runs the stored check for the session user under the shared budget. */
export async function retryOutstandingHomeRateCheck(qc: QueryClient, sessionUserId: string, budget: SweepBudget): Promise<void> {
  const check = await readCheck();
  if (check === null) return;
  if (check.userId !== sessionUserId) {
    await writeCheck(null);
    return;
  }
  if (budget.remaining <= 0) return;
  await ensureRatesForHomeChange(qc, check, budget);
}

/**
 * D-22 / Confirmed Decision 11: the awaited rate fetch that must complete BEFORE change_home_currency
 * is called. Requests the new home currency and the old one against every currency the household
 * uses. 'done' only when every chunk answered and the stored codes cover both; anything else is
 * 'failed'. Unlike ensureRatesForHomeChange it never persists a deferred check -- a failed change
 * changes nothing, so there is nothing to retry later. Never throws.
 */
export async function fetchRatesForHomeChange(
  qc: QueryClient,
  input: { next: string; previous: string; date: string; householdId: string }
): Promise<'done' | 'failed'> {
  try {
    if (isResolveRateThrottled()) return 'failed';
    const client = lazySupabaseClient();
    const used = await fetchHouseholdCurrencies(client, input.householdId);
    const others = [...new Set([input.previous, ...used])].filter((c) => c !== input.next);
    if (others.length === 0) return 'done'; // next equals previous and nothing else is in use
    const chunks = await requestHomeChunks(client, input.date, input.next, others);
    if (chunks === null || chunks === 'budget') return 'failed';
    const covered = new Set(chunks.flat());
    if (!covered.has(input.next) || !covered.has(input.previous)) return 'failed';
    void qc.invalidateQueries({ queryKey: queryKeys.fxLatest() });
    return 'done';
  } catch {
    return 'failed';
  }
}
