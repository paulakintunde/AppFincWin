// 261123 (DD-05): what an older debt is missing, and the "Not now" that hides the quiet ask for one debt.
// "Ask, don't block": the ask names exactly what is missing and never stops an edit or a save.
// The dismissals are remembered per user on this device; the key starts with `fincwin:` so wipeDeviceData() clears it on
// sign-out and account deletion. A failed read counts as not dismissed; a failed write is swallowed (the ask shows again).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';
import { debtIsFixed, type DebtRow } from '@/db/debts';
import { STORAGE_PREFIX, registerWipeHandler } from '@/services/storage/wipe';

export type DebtAskKey = 'startAndOriginal' | 'start' | 'original' | 'limit';

/**
 * The ask for one debt, or null when nothing is missing. A fixed loan needs its start date and original amount (DD-02); a
 * revolving debt needs its credit limit (DD-03). A removed debt is never asked about.
 */
export function debtAskOf(
  row: Pick<DebtRow, 'kind' | 'revolving' | 'start_date' | 'started_balance' | 'credit_limit' | 'deleted_at'>
): DebtAskKey | null {
  if (row.deleted_at) return null;
  if (debtIsFixed(row)) {
    const noStart = !row.start_date;
    const noOriginal = row.started_balance == null;
    if (noStart && noOriginal) return 'startAndOriginal';
    if (noStart) return 'start';
    if (noOriginal) return 'original';
    return null;
  }
  if (row.kind === 'card' || row.revolving === true) return row.credit_limit == null ? 'limit' : null;
  // An older 'other' row that is neither marked revolving nor fixed: nothing to name yet.
  return null;
}

export function debtAskKey(userId: string): string {
  return `${STORAGE_PREFIX}debt-ask:${userId}`;
}

let loadedFor: string | null = null;
let dismissed: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}
function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

async function load(userId: string): Promise<void> {
  if (loadedFor === userId) return;
  loadedFor = userId;
  dismissed = new Set();
  notify();
  try {
    const raw = await AsyncStorage.getItem(debtAskKey(userId));
    const parsed = raw ? (JSON.parse(raw) as { v?: unknown; ids?: unknown }) : null;
    if (loadedFor !== userId || parsed?.v !== 1 || !Array.isArray(parsed.ids)) return;
    dismissed = new Set(parsed.ids.filter((x): x is string => typeof x === 'string'));
    notify();
  } catch {
    // Not dismissed: the ask shows.
  }
}

/** "Not now" for one debt: hidden at once, remembered on this device. */
export async function dismissDebtAsk(userId: string, debtId: string): Promise<void> {
  if (loadedFor !== userId) await load(userId);
  dismissed = new Set([...dismissed, debtId]);
  notify();
  try {
    await AsyncStorage.setItem(debtAskKey(userId), JSON.stringify({ v: 1, ids: [...dismissed] }));
  } catch {
    // Not remembered: the ask shows again next time.
  }
}

/** The debts whose ask was put away with "Not now" by this user on this device. */
export function useDismissedDebtAsks(userId: string | null): ReadonlySet<string> {
  useEffect(() => {
    if (userId !== null) void load(userId);
  }, [userId]);
  const set = useSyncExternalStore(subscribe, () => dismissed);
  return userId === null || loadedFor !== userId ? EMPTY : set;
}

const EMPTY: ReadonlySet<string> = new Set();

/** Test helper. */
export function resetDebtAsksForTests(): void {
  loadedFor = null;
  dismissed = new Set();
  notify();
}

registerWipeHandler({
  id: 'debt-ask',
  wipe: async () => {
    loadedFor = null;
    dismissed = new Set();
    notify();
  },
});
