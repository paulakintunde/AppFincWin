/**
 * Plan 05.2-66 (F-02) and 05.2-72 (WR-02): a "Not my pay" answer is a recurring_dismissals row whose payee_key is the
 * candidate key behind a namespace prefix, direction 'in'. No migration. Every other reader of the table must ignore these rows.
 *
 * The answer belongs to the person who gave it. Two formats exist:
 *  - new: 'not-pay:<user uuid>:<candidate key>'. The uid keeps two members' answers for the same payer from colliding on
 *    the household live-key index (household_id, payee_key, direction).
 *  - old (05.2-66): 'not-pay:<candidate key>'. Still read, but only for its created_by (set server-side).
 * The matcher trusts created_by, never the uid inside the key.
 */
import type { RecurringDismissalRow } from '@/db/recurringDismissals';

export const NOT_PAY_PREFIX = 'not-pay:';
/** The payee_key column limit, counted in code points so a cut never splits a surrogate pair. */
const MAX_KEY = 200;
const UID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:/;

function cut(s: string): string {
  return Array.from(s).slice(0, MAX_KEY).join('');
}

/** The stored key for a user's answer on a candidate key, cut the same way every time to fit the column. */
export function notPayKey(candidateKey: string, userId: string): string {
  return cut(`${NOT_PAY_PREFIX}${userId}:${candidateKey}`);
}

export function isNotPayKey(payeeKey: string): boolean {
  return payeeKey.startsWith(NOT_PAY_PREFIX);
}

/** The candidate key behind a stored not-pay key (either format), or null for a plain key. */
export function notPayCandidateKey(payeeKey: string): string | null {
  if (!isNotPayKey(payeeKey)) return null;
  const rest = payeeKey.slice(NOT_PAY_PREFIX.length);
  const m = UID_PREFIX.exec(rest);
  return m === null ? rest : rest.slice(m[0].length);
}

/** True for a candidate key that the given user has a live "Not my pay" answer on. */
export function notPayMatcher(rows: readonly RecurringDismissalRow[], userId: string | undefined): (candidateKey: string) => boolean {
  if (userId === undefined) return () => false;
  const stored = new Set(
    rows
      .filter((r) => r.deleted_at === null && r.direction === 'in' && r.created_by === userId && isNotPayKey(r.payee_key))
      .map((r) => r.payee_key),
  );
  return (candidateKey) =>
    stored.has(notPayKey(candidateKey, userId)) ||
    stored.has(cut(`${NOT_PAY_PREFIX}${candidateKey}`)) ||
    stored.has(`${NOT_PAY_PREFIX}${candidateKey}`.slice(0, MAX_KEY));
}
