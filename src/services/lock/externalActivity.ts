// 10-review (L-6): a system screen the app opened itself (the file picker, the share sheet, a folder picker, a
// permission dialog) sends the app to the background just as the biometric prompt does. While one is open the lock host
// does not lock on return, so the screen that opened it stays mounted and gets its answer.
//  - Calls nest: two at once keep the flag up until both end.
//  - Safety timeout: a call that never settles stops counting after EXTERNAL_ACTIVITY_MAX_MS, so the flag cannot stay
//    up for ever. The lock host also caps the time away it forgives (see useLockController).
export const EXTERNAL_ACTIVITY_MAX_MS = 10 * 60_000;

let open = 0;

/** True while a system screen the app opened is still open. */
export function isExternalActivityPending(): boolean {
  return open > 0;
}

/** Marks a system screen as open. Returns the function that marks it closed (safe to call more than once). */
export function beginExternalActivity(): () => void {
  open += 1;
  let ended = false;
  const end = (): void => {
    if (ended) return;
    ended = true;
    clearTimeout(timer);
    open = Math.max(0, open - 1);
  };
  const timer = setTimeout(end, EXTERNAL_ACTIVITY_MAX_MS);
  return end;
}

/** Runs `fn` (which opens a system screen) with the flag up, and lowers it however `fn` ends. */
export async function withExternalActivity<T>(fn: () => Promise<T>): Promise<T> {
  const end = beginExternalActivity();
  try {
    return await fn();
  } finally {
    end();
  }
}
