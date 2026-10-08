// Leaf module (imports nothing from src/data): the per-run resolve-rate call budget shared by
// the pending-rate sweep, the persisted account rate checks and the home-currency check.
// It lives apart so none of those modules imports another (depcruise no-circular, which
// counts type-only imports).
//
// 4 runs/hour (15-minute interval) x SWEEP_MAX_CALLS = 40 calls/hour, under the server's
// 60/hour per-user limit, leaving headroom for interactive saves.

export const SWEEP_MAX_CALLS = 10;

export interface SweepBudget {
  readonly remaining: number;
  /** Decrements by 1 and returns true; returns false when exhausted. */
  take(): boolean;
  /** Subtracts n calls already made (floored at 0). */
  spend(n: number): void;
}

export function createSweepBudget(max: number = SWEEP_MAX_CALLS): SweepBudget {
  let remaining = Math.max(0, Math.floor(max));
  return {
    get remaining() {
      return remaining;
    },
    take() {
      if (remaining <= 0) return false;
      remaining -= 1;
      return true;
    },
    spend(n: number) {
      remaining = Math.max(0, remaining - Math.max(0, Math.floor(n)));
    },
  };
}
