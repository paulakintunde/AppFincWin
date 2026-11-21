import { useSyncExternalStore } from 'react';

/**
 * 09-25 (A2-W, owner Q4 "the whole app is read-only"): the central plan guard for every queued write.
 *
 * Button gates (useWriteGate, 09-17) explain the lock where a person taps. This module is the floor under them: no
 * screen can start a write to a plan-locked table while the plan view says not writable, whether or not its button was
 * gated. It sits in the QueryClient (src/data/queryClient.ts):
 *
 * - MutationCache onMutate runs first for every new mutation. When `decidePlanWrite` says block, it throws
 *   PlanWriteBlockedError. TanStack then skips the mutation's own onMutate (no optimistic change is made), never runs the
 *   mutationFn (nothing sent, nothing paused, nothing persisted) and settles the mutation as an error. The error
 *   classifies as 'discarded' (writeErrors.ts), so every onError returns early: no toast, no failed-write record, no
 *   locked-write record. The listener (LockedSheetProvider) opens the LockedSheet.
 * - The mutationFn of every registered default is wrapped too (`guardPlanSend`). A write restored from disk skips
 *   onMutate; in sample status it is dropped there instead of being sent. In 'locked' status a restored write is still
 *   sent, so a write made while covered and synced after the lapse is refused by the server and kept (D-40).
 *
 * Allowed: writes to tables the server lock does not cover (guard_plan_lock's 27-table list in
 * supabase/migrations/20261124000200_plans_lock.sql) and the server's plan_bypass paths. Every queued mutation key is
 * blocked unless it is on PLAN_OPEN_MUTATION_KEYS; an unkeyed mutation (online-only plan, invite and settle calls) is
 * allowed unless it carries `meta: { planLocked: true }`. A write the app makes by itself carries `meta: { planSilent: true }`
 * and is blocked the same way, without the sheet.
 *
 * Never blocks while the plan is loading or unknown: the server trigger still decides (same rule as useWriteGate).
 *
 * This module imports nothing from features/: the plan view arrives through setPlanWriteState from the plans feature.
 */

/** The plan view fields the guard needs. `status` is PlanView['status'] ('sample' | 'trial' | 'locked' | ...). */
export interface PlanWriteState {
  status: string;
  writable: boolean;
  loading: boolean;
}

export type PlanWriteVariant = 'sample' | 'locked';
export type PlanWriteDecision = 'allow' | PlanWriteVariant;

/**
 * Queued writes that touch only tables outside the server lock (profiles, user_setup, feature_switches) or run through a
 * plan_bypass RPC (sample seed and clear). Each entry is a full mutation key from src/data/keys.ts.
 */
export const PLAN_OPEN_MUTATION_KEYS: readonly (readonly string[])[] = [
  ['money-prefs', 'update'], // profiles
  ['region-subdivision', 'update'], // profiles.region_subdivision
  ['record-prefs', 'update'], // profiles
  ['user-setup', 'save'], // user_setup (09-13 onboarding)
  ['feature-switches', 'set'], // feature_switches
  ['feature-switches', 'replace'], // feature_switches
  ['samples', 'seed'], // seed_sample_data (plan_bypass)
  ['samples', 'clear'], // clear_sample_data (plan_bypass)
];

export interface PlanWriteTarget {
  mutationKey?: readonly unknown[] | undefined;
  meta?: Record<string, unknown> | undefined;
}

function sameKey(a: readonly unknown[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((part, i) => part === b[i]);
}

/** True when the write may go out whatever the plan (it never touches a plan-locked table). */
export function isPlanOpenWrite(target: PlanWriteTarget): boolean {
  const key = target.mutationKey;
  if (!key || key.length === 0) return target.meta?.planLocked !== true;
  return PLAN_OPEN_MUTATION_KEYS.some((open) => sameKey(key, open));
}

/** The variant to show when the plan does not cover writes, or null when it does (or is not known yet). */
export function planLockVariant(plan: PlanWriteState | null): PlanWriteVariant | null {
  if (plan === null || plan.loading || plan.writable) return null;
  return plan.status === 'sample' ? 'sample' : 'locked';
}

/** Pure: may this write start under this plan view? */
export function decidePlanWrite(plan: PlanWriteState | null, target: PlanWriteTarget): PlanWriteDecision {
  const variant = planLockVariant(plan);
  if (variant === null || isPlanOpenWrite(target)) return 'allow';
  return variant;
}

/**
 * Pure: may a write restored from disk (it skipped onMutate) be sent now? Only sample blocks: nothing made before the
 * trial may reach the records, while a lapsed plan's writes still go to the server to be refused and kept (D-40).
 */
export function decidePlanSend(plan: PlanWriteState | null, target: PlanWriteTarget): PlanWriteDecision {
  return decidePlanWrite(plan, target) === 'sample' ? 'sample' : 'allow';
}

/** Thrown instead of starting a write the plan does not cover. Classified 'discarded': a silent no-op everywhere. */
export class PlanWriteBlockedError extends Error {
  readonly code = 'plan-write-blocked';
  readonly variant: PlanWriteVariant;

  constructor(variant: PlanWriteVariant) {
    super('The plan does not cover this write; it was not sent');
    this.name = 'PlanWriteBlockedError';
    this.variant = variant;
  }
}

export function isPlanWriteBlocked(err: unknown): err is PlanWriteBlockedError {
  return err instanceof PlanWriteBlockedError;
}

// ---- thin wiring: the latest plan view and the sheet listener -------------------------------------------------------

let current: PlanWriteState | null = null;
const listeners = new Set<() => void>();
let onBlocked: ((variant: PlanWriteVariant) => void) | null = null;

/** Set by the plans feature whenever the plan view changes; null on sign-out. */
export function setPlanWriteState(next: PlanWriteState | null): void {
  if (
    next === current ||
    (next !== null &&
      current !== null &&
      next.status === current.status &&
      next.writable === current.writable &&
      next.loading === current.loading)
  ) {
    return;
  }
  current = next === null ? null : { status: next.status, writable: next.writable, loading: next.loading };
  for (const listener of listeners) listener();
}

export function getPlanWriteState(): PlanWriteState | null {
  return current;
}

export function subscribePlanWriteState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The plan view for components that must not import the plan query (no env check at import). */
export function usePlanWriteState(): PlanWriteState | null {
  return useSyncExternalStore(subscribePlanWriteState, getPlanWriteState, getPlanWriteState);
}

/** The LockedSheet opener. One listener: the app has one LockedSheetProvider. */
export function setPlanWriteBlockedListener(fn: ((variant: PlanWriteVariant) => void) | null): void {
  onBlocked = fn;
}

/** MutationCache onMutate: throws PlanWriteBlockedError (and opens the sheet) when the write may not start. */
export function guardPlanWrite(target: PlanWriteTarget): void {
  const decision = decidePlanWrite(current, target);
  if (decision === 'allow') return;
  // A write the app makes on its own (an answer marked seen, a draft autosave) is stopped without the sheet: the person
  // did not ask for it, and reading must stay quiet.
  if (target.meta?.planSilent === true) throw new PlanWriteBlockedError(decision);
  try {
    onBlocked?.(decision);
  } catch {
    // the sheet is explanation only; the block stands either way
  }
  throw new PlanWriteBlockedError(decision);
}

/** Wraps a registered mutationFn so a write restored from disk in sample status is dropped, not sent. */
export function guardPlanSend<TArgs extends unknown[], TResult>(
  mutationKey: readonly unknown[],
  fn: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  return (...args: TArgs) => {
    const decision = decidePlanSend(current, { mutationKey });
    if (decision !== 'allow') return Promise.reject(new PlanWriteBlockedError(decision));
    return fn(...args);
  };
}
