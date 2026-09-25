// Small list helpers shared by the mutation modules' cache patches.

/**
 * WR-A04: replaces the row with the same id, or inserts it when it is missing. A queued add's
 * optimistic row can be dropped by a refetch that lands before the write does (reconnect
 * refetches race resumePausedMutations), so a success handler that only replaced in place
 * would leave the saved row missing from the list until some later refetch.
 */
export function upsertRow<T extends { id: string }>(rows: readonly T[], row: T, insertAt: 'start' | 'end'): T[] {
  if (rows.some((r) => r.id === row.id)) return rows.map((r) => (r.id === row.id ? row : r));
  return insertAt === 'start' ? [row, ...rows] : [...rows, row];
}
