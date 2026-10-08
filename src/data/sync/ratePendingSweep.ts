// 02-DECISION-fx-on-demand.md item 6: when the app comes online or returns to the foreground,
// retry the caller's rate_pending lines and any failed account rate checks. This replaces the
// retired server-side fx_restamp_pending(); it also covers lines the server's daily
// recurring-materialise job created, which no client write ever followed up.
//
// Call-budget arithmetic: a run happens at most once per SWEEP_MIN_INTERVAL_MS (15 min) and
// makes at most SWEEP_MAX_CALLS (10) resolve-rate calls in total, shared through one SweepBudget
// by every step (02-49's home check first, then account checks, then pending dates). That is
// 4 runs x 10 = 40 calls/hour, under the server's 60/hour per-user limit, leaving headroom for
// interactive saves. Rows are read oldest date first; a date that is still pending afterwards is
// skipped for DATE_BACKOFF_MS (>= the server's longest per-reason negative cache) so one
// permanently failing old date cannot starve newer ones.
import { focusManager, onlineManager, type QueryClient } from '@tanstack/react-query';
import { fetchRatePendingRows } from '@/db/fxResolve';
import { retryAccountRateChecks } from '@/data/mutations/accountRateChecks';
import { retryOutstandingHomeRateCheck } from '@/data/mutations/homeCurrencyRates';
import { followUpPendingByDate, lazySupabaseClient } from '@/data/mutations/transactionCache';
import { getDeviceTimeZone } from '@/services/locale/deviceLocale';
import { localDateIn } from '@/engine/time';
import { isResolveRateThrottled } from './resolveRateBackoff';
import { createSweepBudget, SWEEP_MAX_CALLS } from './sweepBudget';

export const SWEEP_MIN_INTERVAL_MS = 15 * 60 * 1000;
export const SWEEP_ROW_LIMIT = 200;
export const DATE_BACKOFF_MS = 6 * 60 * 60 * 1000;

let lastRunAt: number | null = null;
let running = false;
const dateBackoff = new Map<string, number>();
let stopFn: (() => void) | null = null;

export function resetRatePendingSweepForTests(): void {
  lastRunAt = null;
  running = false;
  dateBackoff.clear();
  stopFn?.();
  stopFn = null;
}

/** Device-local tomorrow as YYYY-MM-DD: calendar arithmetic on the date, no clock-hour maths. */
function localTomorrow(now: number): string {
  const [y, m, d] = localDateIn(new Date(now), getDeviceTimeZone()).split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

async function sessionUserId(): Promise<string | null> {
  try {
    const { data } = await lazySupabaseClient().auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

export async function runRatePendingSweep(qc: QueryClient, now: number = Date.now()): Promise<void> {
  if (running || isResolveRateThrottled(now)) return;
  if (lastRunAt !== null && now - lastRunAt < SWEEP_MIN_INTERVAL_MS) return;
  running = true;
  try {
    const userId = await sessionUserId();
    if (userId === null) return;
    lastRunAt = now;

    const budget = createSweepBudget(SWEEP_MAX_CALLS);
    try {
      await retryOutstandingHomeRateCheck(qc, userId, budget);
    } catch {
      // never stops the rest of the run; the stored check is retried next time
    }
    await retryAccountRateChecks(qc, userId, budget);
    if (budget.remaining <= 0) return;

    let rows;
    try {
      rows = await fetchRatePendingRows(lazySupabaseClient(), {
        onOrBefore: localTomorrow(now),
        limit: SWEEP_ROW_LIMIT,
        order: 'asc',
      });
    } catch {
      return; // swallowed: the next run (after the interval) tries again
    }

    const eligible = rows.filter((r) => {
      const at = dateBackoff.get(r.local_date);
      return at === undefined || now - at >= DATE_BACKOFF_MS;
    });
    const dates = [...new Set(eligible.map((r) => r.local_date))].sort().slice(0, budget.remaining);
    if (dates.length === 0) return;
    const chosen = new Set(dates);
    const batch = eligible.filter((r) => chosen.has(r.local_date));

    const { calls, stillPendingDates } = await followUpPendingByDate(qc, batch, { maxCalls: budget.remaining });
    budget.spend(calls);
    for (const d of stillPendingDates) dateBackoff.set(d, now);
  } finally {
    running = false;
  }
}

/** Idempotent. Runs when online and focused (once at start if both already hold). Returns an unsubscribe. */
export function startRatePendingSweep(qc: QueryClient): () => void {
  if (stopFn) return stopFn;
  const attempt = (): void => {
    if (onlineManager.isOnline() && focusManager.isFocused()) void runRatePendingSweep(qc).catch(() => undefined);
  };
  const offOnline = onlineManager.subscribe(attempt);
  const offFocus = focusManager.subscribe(attempt);
  const stop = (): void => {
    offOnline();
    offFocus();
    if (stopFn === stop) stopFn = null;
  };
  stopFn = stop;
  attempt();
  return stop;
}
