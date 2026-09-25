import { DbError, VersionConflictError, NotFoundError, SessionUnavailableError } from '@/db/errors';

/**
 * How a failed write is handled downstream:
 * - 'conflict': D-18. Optimistic concurrency lost — expected_version no longer matched.
 *   The server copy wins. Never retried, never resolved as last-write-wins.
 * - 'not-found': the target row no longer exists (deleted elsewhere).
 * - 'rejected': D-19. A permanent failure (RLS denial, check/FK/not-null violation,
 *   malformed input, or anything this module does not recognise). Stops retrying
 *   immediately so nothing loops forever on something it can never fix by retrying.
 * - 'transient': network failure or a 5xx/408/429 response. Safe to retry.
 * - 'auth': WR-A01. The session was missing or expired (HTTP 401, PostgREST's JWT codes
 *   PGRST301/302/303, or the pre-send session check found no session). Nothing is wrong with
 *   the write itself: it waits and retries, and every retry runs the session check again,
 *   which is where supabase-js refreshes the token. Never parked as failed -- sign-out wipes
 *   the queue explicitly (D-15) if the user is really signed out.
 *
 * CR-A03: there is deliberately no "already applied" class. A duplicate client-generated
 * UUID (23505 on the primary key -- an earlier attempt landed and its response was lost) is
 * resolved inside the db/ insert functions themselves: they re-fetch by id and return the
 * existing row as a success. So any 23505 that still reaches this classifier came from a
 * different unique constraint (e.g. custom_currencies' (owner_id, code)) and is a permanent
 * rejection the user must be told about (D-19), never a silent drop.
 */
export type WriteErrorClass = 'transient' | 'auth' | 'conflict' | 'rejected' | 'not-found';

// D-19: permanent rejections. 42501 RLS denial, 23514 check violation, 23503 FK violation,
// 23502 not-null violation, 22P02 invalid text representation, PGRST204 PostgREST
// column-not-found, 23505 unique violation on a constraint other than the row's own id
// (CR-A03, see above). None of these are fixed by retrying the same write again.
const REJECTED_CODES = new Set(['42501', '23514', '23503', '23502', '22P02', 'PGRST204', '23505']);

// CR-A01: postgrest-js 2.x never rejects on a fetch failure (radio drop, DNS failure,
// timeout/abort). It catches the error and resolves `{ error: { message: 'TypeError:
// Network request failed', code: '' }, status: 0 }` instead (see
// node_modules/@supabase/postgrest-js/dist/index.cjs, the `res.catch((fetchError) => ...)`
// branch). Status 0 therefore means "the request never got an HTTP answer" -- a
// connectivity failure, always safe to retry.
// WR-A01: PostgREST's JWT errors -- PGRST301 (invalid/undecodable JWT), PGRST302 (anonymous
// access disabled / no JWT), PGRST303 (claims validation failed, e.g. expired).
const AUTH_CODES = new Set(['PGRST301', 'PGRST302', 'PGRST303']);

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
  if (err instanceof SessionUnavailableError) return 'auth';

  if (err instanceof DbError) {
    if (isConnectivityFailure(err)) return 'transient';
    if (err.status === 401 || AUTH_CODES.has(err.code)) return 'auth';
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
 * WR-A02: how many times a write that got an HTTP answer (5xx/408/429) is retried before it
 * is parked as failed. Every mutation shares one scope (WRITE_SCOPE), so a write that always
 * fails server-side (a trigger error surfacing as a 500, a PostgREST bug on one payload)
 * would otherwise block every later write forever. With writeRetryDelay's backoff this is
 * roughly six and a half minutes of trying.
 */
export const MAX_SERVER_ERROR_RETRIES = 10;

/** The failed-write code recorded when WR-A02's retry budget runs out. */
export const RETRY_EXHAUSTED_CODE = 'retry-exhausted';

/** A connectivity failure: the request never got an HTTP answer at all. */
function isConnectivityError(err: unknown): boolean {
  if (err instanceof DbError) return isConnectivityFailure(err);
  return classifyWriteError(err) === 'transient';
}

/**
 * Retry policy for every queued write:
 * - connectivity failures ('transient' with no HTTP answer) and 'auth' retry without bound.
 *   TanStack Query pauses the mutation entirely while offline, so this never spins while
 *   disconnected, and an auth wait ends when the session is refreshed or sign-out wipes.
 * - server answers (5xx/408/429) retry at most MAX_SERVER_ERROR_RETRIES times (WR-A02).
 * - everything else is permanent and never retried.
 * `failureCount` is query-core's count of failures before this one (0 on the first).
 */
export function shouldRetryWrite(failureCount: number, err: unknown): boolean {
  const cls = classifyWriteError(err);
  if (cls === 'auth') return true;
  if (cls !== 'transient') return false;
  if (isConnectivityError(err)) return true;
  return failureCount < MAX_SERVER_ERROR_RETRIES;
}

/**
 * For a mutation's onError, where retrying has already stopped. A 'transient' or 'auth'
 * error can only get there once shouldRetryWrite gave up (WR-A02's bounded server-error
 * budget), so it is reported as a rejected write with the RETRY_EXHAUSTED_CODE reason rather
 * than being dropped. Every other class passes through unchanged.
 */
export function classifySettledWriteError(err: unknown): Exclude<WriteErrorClass, 'transient' | 'auth'> {
  const cls = classifyWriteError(err);
  return cls === 'transient' || cls === 'auth' ? 'rejected' : cls;
}

/** The code recorded with a settled failure: the error's own code, or RETRY_EXHAUSTED_CODE. */
export function settledWriteErrorCode(err: unknown): string {
  const cls = classifyWriteError(err);
  if (cls === 'transient' || cls === 'auth') return RETRY_EXHAUSTED_CODE;
  return err instanceof Error && 'code' in err ? String((err as { code: unknown }).code) : '';
}

/** Exponential backoff, capped at 60 seconds. */
export function writeRetryDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 60_000);
}
