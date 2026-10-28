// 05.2-16 (DSU-15, D-21): pure helpers for the income-type save. No React, no I/O.
import { normaliseDescription } from '@/engine/categorize';
import type { TransactionRow } from '@/db/rows';

/** The payer rule's key: the normalised name, at most 60 characters; null when there is nothing to key on. */
export function payerKeyOf(description: string | null): string | null {
  if (description === null) return null;
  const key = normaliseDescription(description).slice(0, 60).trim();
  return key === '' ? null : key;
}

/**
 * Earlier payments "Apply to future payments" also tags: money in, live, not a transfer leg, same payer, and not yet
 * tagged by anyone (a payment the user tagged themselves keeps its tag, owner decision 4).
 */
export function earlierUntagged(rows: readonly TransactionRow[], payerKey: string, excludeId: string): TransactionRow[] {
  return rows.filter(
    (r) =>
      r.id !== excludeId &&
      r.original_amount > 0 &&
      r.deleted_at === null &&
      r.transfer_id === null &&
      (r.income_kind ?? null) === null &&
      payerKeyOf(r.name) === payerKey
  );
}
