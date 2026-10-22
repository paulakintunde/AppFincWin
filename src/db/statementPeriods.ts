// 05-05: statement coverage periods (05-03). A period records that an account's statement
// import covered [period_start, period_end]; re-inserting the same id is success (replay).

import { toDbError } from './errors';
import type { DbClient } from './rows';

export interface StatementPeriodRow {
  id: string;
  household_id: string;
  account_id: string;
  period_start: string;
  period_end: string;
  /**
   * CR-D02: the import that stated this period. Decide reads statement_periods_live, which keeps a period only while
   * some line of its batch is live, so an undone or refused import leaves no complete month behind. Null on a period
   * recorded before the column existed.
   */
  import_batch_id: string | null;
}

const COLUMNS = 'id, household_id, account_id, period_start, period_end, import_batch_id';
const UNIQUE_VIOLATION = '23505';

/**
 * One household's statement periods that still count (WR-A05: RLS alone would return every household the caller
 * belongs to). CR-D02: read from statement_periods_live, so a period whose import was undone or never landed is left out.
 */
export async function fetchStatementPeriods(client: DbClient, householdId: string): Promise<StatementPeriodRow[]> {
  const { data, error, status } = await client
    .from('statement_periods_live')
    .select(COLUMNS)
    .eq('household_id', householdId)
    .order('period_start', { ascending: true });

  if (error) throw toDbError(error, status);
  return (data as StatementPeriodRow[] | null) ?? [];
}

/** Returns the stored row, or null when this id was already recorded (23505). */
export async function insertStatementPeriod(
  client: DbClient,
  row: StatementPeriodRow
): Promise<StatementPeriodRow | null> {
  if (row.period_end < row.period_start) {
    throw new RangeError('insertStatementPeriod: period_end is before period_start');
  }

  const { data, error, status } = await client
    .from('statement_periods')
    .insert({
      id: row.id,
      household_id: row.household_id,
      account_id: row.account_id,
      period_start: row.period_start,
      period_end: row.period_end,
      import_batch_id: row.import_batch_id,
    })
    .select(COLUMNS)
    .single();

  if (!error) return data as StatementPeriodRow;
  if (error.code === UNIQUE_VIOLATION) return null;
  throw toDbError(error, status);
}
