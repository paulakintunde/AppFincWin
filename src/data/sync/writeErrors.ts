import { DbError, VersionConflictError, NotFoundError } from '@/db/errors';

/**
 * How a failed write is handled downstream:
 * - 'conflict': D-18. Optimistic concurrency lost — expected_version no longer matched.
 *   The server copy wins. Never retried, never resolved as last-write-wins.
 * - 'not-found': the target row no longer exists (deleted elsewhere).
 * - 'already-applied': Postgres unique-violation (23505) on the client-generated UUID —
 *   an earlier attempt already succeeded and its response was lost. Not a failure to
 *   surface to the user; full SYN-03 idempotency handling stays in Phase 10.
 * - 'rejected': D-19. A permanent failure (RLS denial, check/FK/not-null violation,
 *   malformed input, or anything this module does not recognise). Stops retrying
 *   immediately so nothing loops forever on something it can never fix by retrying.
 * - 'transient': network failure or a 5xx/408/429 response. Safe to retry.
 */
export type WriteErrorClass = 'transient' | 'already-applied' | 'conflict' | 'rejected' | 'not-found';

// D-19: permanent rejections. 42501 RLS denial, 23514 check violation, 23503 FK violation,
// 23502 not-null violation, 22P02 invalid text representation, PGRST204 PostgREST
// column-not-found. None of these are fixed by retrying the same write again.
const REJECTED_CODES = new Set(['42501', '23514', '23503', '23502', '22P02', 'PGRST204']);

// CR-A01: postgrest-js 2.x never rejects on a fetch failure (radio drop, DNS failure,
// timeout/abort). It catches the error and resolves `{ error: { message: 'TypeError:
// Network request failed', code: '' }, status: 0 }` instead (see
// node_modules/@supabase/postgrest-js/dist/index.cjs, the `res.catch((fetchError) => ...)`
// branch). Status 0 therefore means "the request never got an HTTP answer" -- a
// connectivity failure, always safe to retry.
function isConnectivityFailure(err: DbError): boolean {
  return err.status === 0 || (err.code === '' && err.status === null);
}

function isTransientStatus(status: number | null): boolean {
  if (status === null) return false;
  return status >= 500 || status === 408 || status === 429;
}

/**
 * Classifies any error a write mutation can throw into exactly one WriteErrorClass, so the
 * write queue (plan 01-12) has a single place to decide retry behavior. D-18: a version
 * mismatch always classifies as 'conflict', never retried, never last-write-wins. D-19: a
 * permanent rejection always classifies as 'rejected' and stops retrying.
 */
export function classifyWriteError(err: unknown): WriteErrorClass {
  if (err instanceof VersionConflictError) return 'conflict';
  if (err instanceof NotFoundError) return 'not-found';

  if (err instanceof DbError) {
    if (isConnectivityFailure(err)) return 'transient';
    if (err.code === '23505') return 'already-applied';
    if (REJECTED_CODES.has(err.code)) return 'rejected';
    if (isTransientStatus(err.status)) return 'transient';
    return 'rejected';
  }

  if (err instanceof TypeError && /network/i.test(err.message)) return 'transient';
  if (err instanceof Error && err.name === 'FunctionsFetchError') return 'transient';

  // Never loop forever on something unrecognised.
  return 'rejected';
}

/**
 * True only for 'transient' errors. Retries are unbounded here because TanStack Query
 * pauses the mutation entirely while offline (it never actually retries while
 * disconnected) — failureCount is accepted only to match the shape retry callbacks expect.
 */
export function shouldRetryWrite(_failureCount: number, err: unknown): boolean {
  return classifyWriteError(err) === 'transient';
}

/** Exponential backoff, capped at 60 seconds. */
export function writeRetryDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 60_000);
}
