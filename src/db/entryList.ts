// 02.3-13 (REC-30, D-14, D-28): the entry-sheet list save. One RPC records the single undo step
// for a batch of already-inserted rows plus any repeating series created with them.
import type { NewRecurringSeries, SeriesUndoLabel } from './recurringSeries';
import { BAD_RESPONSE } from './recurringSeries';
import { DbError, toDbError } from './errors';
import type { DbClient } from './rows';

export const ENTRY_LIST_MAX_ROWS = 200;
export const ENTRY_LIST_MAX_SERIES = 61;

export interface EntryListSeriesItem {
  series: NewRecurringSeries;
  anchorTransactionId: string;
}

export type EntryListResult = { status: 'applied' | 'already-applied'; undoStepId: string };

export async function recordEntryList(
  client: DbClient,
  rowIds: readonly string[],
  items: readonly EntryListSeriesItem[],
  undo: SeriesUndoLabel
): Promise<EntryListResult> {
  if (rowIds.length < 1 || rowIds.length > ENTRY_LIST_MAX_ROWS) {
    throw new RangeError(`recordEntryList: expected 1 to ${ENTRY_LIST_MAX_ROWS} rows, got ${rowIds.length}`);
  }
  if (items.length > ENTRY_LIST_MAX_SERIES) {
    throw new RangeError(`recordEntryList: expected at most ${ENTRY_LIST_MAX_SERIES} series, got ${items.length}`);
  }

  const { data, error, status } = await client.rpc('record_entry_list', {
    p_row_ids: rowIds,
    p_items: items.map((i) => ({ series: i.series, anchor_transaction_id: i.anchorTransactionId })),
    p_undo_step: { id: undo.id, label_key: undo.labelKey, label_params: undo.labelParams },
  });
  if (error) throw toDbError(error, status);

  const rec = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
  const state = rec.status;
  const undoStepId = rec.undo_step_id;
  if ((state !== 'applied' && state !== 'already-applied') || typeof undoStepId !== 'string' || undoStepId.length === 0) {
    throw new DbError(`record_entry_list response: unrecognised ${JSON.stringify(state)}`, BAD_RESPONSE, null);
  }
  return { status: state, undoStepId };
}
