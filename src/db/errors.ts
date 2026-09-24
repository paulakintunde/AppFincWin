// Typed database errors. Dependency-free (plain classes, no imports) so this file can sit
// underneath both src/data/sync/writeErrors.ts and any future db/ query builder without
// creating a cycle.

/** The write-carrying tables the app currently mutates through db/data. */
export type WriteEntity = 'transactions' | 'accounts' | 'custom_currencies' | 'profiles';

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
 * Normalizes a PostgREST-shaped error object (message + optional code) plus an optional
 * HTTP status into a DbError. `code` and `status` both default to their "unknown" values
 * (empty string, null) rather than throwing when absent, since not every failure path
 * (e.g. a thrown network error re-wrapped upstream) carries both.
 */
export function toDbError(error: { message: string; code?: string | null }, status: number | null = null): DbError {
  return new DbError(error.message, error.code ?? '', status);
}
