// D-85 / R16.1: run a FAB quick action after the You screen has closed. The handler opens a sheet
// over a tab root or pushes a route, so it must wait for the dismissal transition (the navigation
// `transitionEnd` event), not run under a screen that is still leaving. No React import here;
// the caller supplies the navigation hooks. InteractionManager is deliberately not used.
import type { QuickActionId } from './quickActions';

/** Safety net: if the transition event never arrives, run anyway so a tap is never lost. */
export const TRANSITION_FALLBACK_MS = 1000;

export interface RunAfterDismissDeps {
  /** Closes the current screen back to the tab root it was opened from. */
  dismissTo(): void;
  /** Subscribes to the dismissal's transitionEnd; returns the unsubscribe. */
  onTransitionEnd(listener: () => void): () => void;
  handlers: Partial<Record<QuickActionId, () => void>>;
}

/** Returns false (and does nothing, not even dismiss) when the action has no handler. */
export function runQuickActionAfterDismiss(id: QuickActionId, deps: RunAfterDismissDeps): boolean {
  const handler = deps.handlers[id];
  if (!handler) return false;

  let done = false;
  let unsubscribe: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const finish = (): void => {
    if (done) return;
    done = true;
    if (timer !== null) clearTimeout(timer);
    unsubscribe?.();
    handler();
  };

  unsubscribe = deps.onTransitionEnd(finish);
  timer = setTimeout(finish, TRANSITION_FALLBACK_MS);
  deps.dismissTo();
  return true;
}
