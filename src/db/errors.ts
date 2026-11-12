// Typed database errors. Dependency-free (plain classes, no imports) so this file can sit
// underneath both src/data/sync/writeErrors.ts and any future db/ query builder without
// creating a cycle.

/** The tables the app mutates through db/data (failed-write and version-chain keys). */
export type WriteEntity =
  | 'transactions'
  | 'accounts'
  | 'custom_currencies'
  | 'profiles'
  | 'categories'
  | 'recurring_series'
  | 'category_rules'
  | 'undo_log'
  | 'import_profiles'
  | 'households'
  | 'dismissed_series_offers'
  | 'decide_checks'
  | 'debts'
  | 'decide_links'
  | 'decide_changes'
  | 'savings_goals'
  | 'decide_settings'
  | 'statement_periods'
  | 'decide_answers'
  | 'recurring_dismissals'
  | 'income_payer_prompts'
  | 'holdings'
  | 'holding_lots';

/**
 * A PostgREST/Postgres error normalized into a typed shape. `code` is the Postgres or
 * PostgREST error code (e.g. '42501', '23505', 'PGRST204'); `status` is the HTTP status
 * the request failed with, or null when no HTTP layer was involved (e.g. a thrown JS error
 * with no response).
 */
export class DbError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number | null
  ) {
    super(message);
    this.name = 'DbError';
  }
}

/**
 * D-18: an update was rejected because `expected_version` no longer matched the server row.
 * The server copy wins; this error is never retried and never resolved as last-write-wins.
 */
export class VersionConflictError extends Error {
  readonly code = 'version-conflict';

  constructor(
    readonly entity: WriteEntity,
    readonly id: string,
    readonly serverRow: unknown
  ) {
    super(`Version conflict on ${entity} ${id}: the server row changed elsewhere`);
    this.name = 'VersionConflictError';
  }
}

/** The row a write targeted no longer exists (e.g. deleted on another device). */
export class NotFoundError extends Error {
  readonly code = 'not-found';

  constructor(
    readonly entity: WriteEntity,
    readonly id: string
  ) {
    super(`${entity} ${id} not found`);
    this.name = 'NotFoundError';
  }
}

/**
 * WR-A01: a write was about to be sent with no usable session (the access token expired and
 * supabase-js could not refresh it yet, e.g. the refresh call itself hit a flaky network).
 * Sending anyway would go out under the anon key and fail the column grants with a 42501
 * that looks permanent. The write queue waits and retries instead of rejecting.
 */
export class SessionUnavailableError extends Error {
  readonly code = 'session-unavailable';

  constructor(reason?: string) {
    super(reason ? `No usable auth session: ${reason}` : 'No usable auth session');
    this.name = 'SessionUnavailableError';
  }
}

/**
 * Normalizes a PostgREST-shaped error object (message + optional code) plus an optional
 * HTTP status into a DbError. `code` and `status` both default to their "unknown" values
 * (empty string, null) rather than throwing when absent, since not every failure path
 * (e.g. a thrown network error re-wrapped upstream) carries both.
 */
export function toDbError(error: { message: string; code?: string | null }, status: number | null = null): DbError {
  return new DbError(error.message, error.code ?? '', status);
}

/**
 * 05.4 APP-10 (05.4-33): what kind of failure a read hit, for the shared error / offline card (08.1). A network failure is
 * never 'not_found': only the server saying so (HTTP 404 or PostgREST PGRST116) is.
 */
export type DbErrorKind = 'network' | 'not_found' | 'server' | 'forbidden' | 'conflict';

const FORBIDDEN_CODES = new Set(['42501', 'PGRST301', 'PGRST302', 'PGRST303']);

/**
 * Classifies any thrown read error. Network: a fetch TypeError (RequestTimeoutError, the 15 s read timeout, is one), an
 * AbortError, or a DbError with no HTTP answer (postgrest-js resolves a fetch failure as status 0). Not found: 404 or
 * PGRST116. Forbidden: 401, 403, 42501 or PostgREST's JWT codes. Conflict: 409 or a version conflict. Everything else,
 * unknown errors included, is 'server' (never 'not_found').
 */
export function classifyReadError(err: unknown): DbErrorKind {
  if (err instanceof VersionConflictError) return 'conflict';
  if (err instanceof NotFoundError) return 'not_found';
  if (err instanceof SessionUnavailableError) return 'forbidden';
  if (err instanceof DbError) {
    if (err.status === 0 || (err.code === '' && err.status === null)) return 'network';
    if (err.status === 404 || err.code === 'PGRST116') return 'not_found';
    if (err.status === 401 || err.status === 403 || FORBIDDEN_CODES.has(err.code)) return 'forbidden';
    if (err.status === 409) return 'conflict';
    return 'server';
  }
  if (err instanceof TypeError) return 'network';
  if (typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError') return 'network';
  return 'server';
}
