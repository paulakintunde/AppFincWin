// 02-DECISION-fx-on-demand.md item 3b: a foreign-currency account asks the server for its
// currency's rate on the account's opening date (the device-local creation date). A check that
// cannot complete (offline, throttled, 502) is persisted and retried by the pending sweep.
//
// The key starts with `fincwin:` so wipeDeviceData() clears it (src/services/storage/wipe.ts
// STORAGE_PREFIX). Entries for another user than the current session are dropped unread.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueryClient } from '@tanstack/react-query';
import { requestRatesForDate } from '@/db/fxResolve';
import { queryKeys } from '@/data/keys';
import { isResolveRateThrottled } from '@/data/sync/resolveRateBackoff';
import type { SweepBudget } from '@/data/sync/sweepBudget';
import { lazySupabaseClient } from './transactionCache';

export const ACCOUNT_RATE_CHECKS_KEY = 'fincwin:fx-account-rate-checks';
const MAX_ENTRIES = 20;

export interface AccountRateCheck {
  userId: string;
  accountId: string;
  currency: string;
  homeCurrency: string;
  openingDate: string;
}

function isCheck(v: unknown): v is AccountRateCheck {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Record<string, unknown>;
  return ['userId', 'accountId', 'currency', 'homeCurrency', 'openingDate'].every((k) => typeof c[k] === 'string');
}

async function readChecks(): Promise<AccountRateCheck[]> {
  try {
    const raw = await AsyncStorage.getItem(ACCOUNT_RATE_CHECKS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isCheck) : [];
  } catch {
    return [];
  }
}

async function writeChecks(list: AccountRateCheck[]): Promise<void> {
  try {
    if (list.length === 0) await AsyncStorage.removeItem(ACCOUNT_RATE_CHECKS_KEY);
    else await AsyncStorage.setItem(ACCOUNT_RATE_CHECKS_KEY, JSON.stringify(list.slice(-MAX_ENTRIES)));
  } catch {
    // Best-effort: a lost retry only means the latest stored rate is used until the user acts again.
  }
}

const same = (a: AccountRateCheck, b: AccountRateCheck): boolean =>
  a.userId === b.userId && a.accountId === b.accountId && a.openingDate === b.openingDate;

/** One attempt at the check. Never throws; persists the check on 'deferred'. */
async function attempt(qc: QueryClient, check: AccountRateCheck): Promise<'done' | 'deferred'> {
  if (isResolveRateThrottled()) return 'deferred';
  try {
    const stored = await requestRatesForDate(lazySupabaseClient(), check.openingDate, [check.currency, check.homeCurrency]);
    if (stored === null) return 'deferred';
    void qc.invalidateQueries({ queryKey: queryKeys.fxLatest() });
    return 'done';
  } catch {
    return 'deferred';
  }
}

export async function runAccountRateCheck(qc: QueryClient, check: AccountRateCheck): Promise<'done' | 'deferred'> {
  const outcome = await attempt(qc, check);
  if (outcome === 'deferred') {
    const list = (await readChecks()).filter((c) => !same(c, check));
    list.push(check);
    await writeChecks(list);
  }
  return outcome;
}

/** Sweep step: retries stored checks while the budget allows; 'done' ones are removed. */
export async function retryAccountRateChecks(qc: QueryClient, sessionUserId: string, budget: SweepBudget): Promise<void> {
  const list = (await readChecks()).filter((c) => c.userId === sessionUserId);
  const keep: AccountRateCheck[] = [];
  for (const check of list) {
    if (!budget.take()) {
      keep.push(check);
      continue;
    }
    if ((await attempt(qc, check)) === 'deferred') keep.push(check);
  }
  await writeChecks(keep);
}
