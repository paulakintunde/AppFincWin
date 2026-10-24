/**
 * CR-D02: a stated statement period tells Decide that every month it covers end to end is complete. That is only true
 * when every statement line inside the period is in the app after this import: a line the user left unticked (or one
 * that could not be imported) is missing from those months, and a complete month with missing lines understates
 * spending and income. A line left out because it duplicates a stored line is already in the app, so it does not count
 * against the period.
 */
export interface PeriodRow {
  localDate: string | null;
  included: boolean;
  duplicate: boolean;
}

export function periodFullyImported(rows: readonly PeriodRow[], start: string, end: string): boolean {
  return rows.every(
    (r) => r.localDate === null || r.localDate < start || r.localDate > end || r.included || r.duplicate,
  );
}
