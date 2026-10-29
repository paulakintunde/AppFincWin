/**
 * Plan 05.2-66 (F-02): a "Not my pay" answer is a recurring_dismissals row whose payee_key is the candidate key
 * behind a namespace prefix, direction 'in'. No migration. Every other reader of the table must ignore these rows.
 */
import type { RecurringDismissalRow } from '@/db/recurringDismissals';

export const NOT_PAY_PREFIX = 'not-pay:';
/** The payee_key column limit. */
const MAX_KEY = 200;

/** The stored key for a candidate key, cut the same way every time to fit the column. */
export function notPayKey(candidateKey: string): string {
  return `${NOT_PAY_PREFIX}${candidateKey}`.slice(0, MAX_KEY);
}

export function isNotPayKey(payeeKey: string): boolean {
  return payeeKey.startsWith(NOT_PAY_PREFIX);
}

/** True for a candidate key that has a live "Not my pay" answer. */
export function notPayMatcher(rows: readonly RecurringDismissalRow[]): (candidateKey: string) => boolean {
  const stored = new Set(rows.filter((r) => r.deleted_at === null && r.direction === 'in' && isNotPayKey(r.payee_key)).map((r) => r.payee_key));
  return (candidateKey) => stored.has(notPayKey(candidateKey));
}
