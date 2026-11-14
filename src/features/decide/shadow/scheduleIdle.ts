/** The longest the details wait for an idle moment. */
export const IDLE_TIMEOUT_MS = 200;

/**
 * 05-106 (D-88 speed 5): run `task` once the JS thread is idle. Uses `requestIdleCallback` where the runtime has it (React
 * Native does), else a 0 ms timeout. Returns the cancel. No InteractionManager.
 * The callback carries a deadline (`IDLE_TIMEOUT_MS`): React Native fires an idle callback with no deadline only when the
 * native side reports an idle frame, which a screen that keeps working can starve, and the figures must still arrive.
 */
export function scheduleIdle(task: () => void): () => void {
  const g = globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number; cancelIdleCallback?: (handle: number) => void };
  if (typeof g.requestIdleCallback === 'function') {
    const handle = g.requestIdleCallback(task, { timeout: IDLE_TIMEOUT_MS });
    return () => g.cancelIdleCallback?.(handle);
  }
  const timer = setTimeout(task, 0);
  return () => clearTimeout(timer);
}
