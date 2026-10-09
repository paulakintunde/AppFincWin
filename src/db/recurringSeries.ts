// Typed recurring-series reads and RPC-backed writes (REC-05, REC-06, D-07, D-08, D-26).
//
// Series are household-scoped and RLS grants selection only (supabase/migrations/
// 20260926000300_recurring_series.sql) -- every write goes through one of the three
// security-definer RPCs from 20260926000400_recurring_materialisation.sql (plan 02-08),
// never a plain table insert/update. Each RPC returns a small JSON envelope; this module's
// job is to turn that envelope into either a validated `SeriesChangeSet` (engine/undo's
// vocabulary for building an undo step), a replay-safe 'already-applied', or one of the
// same typed errors (VersionConflictError, NotFoundError) a table write throws -- so the
// mutation layer (plan 02-18) never has to know it is talking to an RPC instead of a table.

import type { PatchValue, SeriesChangeSet, UndoLabelKey, UndoLabelParams } from '@/engine/undo';
import type { RecurringFreq } from '@/engine/recurring';
import { NotFoundError, VersionConflictError, DbError, toDbError } from './errors';
import { parseConflict } from './patches';
import {
  assertAllowedKeys,
  RECURRING_SERIES_COLUMNS,
  type DbClient,
  type PaymentType,
  type RecurringSeriesRow,
} from './rows';

export interface NewRecurringSeries {
  id: string;
  household_id: string;
  account_id: string;
  name: string;
  amount: number;
  currency: string;
  category_id: string | null;
  payment_type: PaymentType | null;
  freq: RecurringFreq;
  anchor_date: string;
  time_zone: string;
  end_date: string | null;
  occurrence_count: number | null;
  /** Record polish D-02: the template flag; materialised occurrences inherit it. */
  is_automatic?: boolean;
}

// Mirrors edit_recurring_series_from's allowed patch keys (plan 02-08): any other key
// raises 22023 server-side. time_zone is deliberately excluded -- it is fixed at creation.
export const RECURRING_SERIES_PATCH_KEYS = [
  'name',
  'amount',
  'currency',
  'account_id',
  'category_id',
  'payment_type',
  'freq',
  'anchor_date',
  'end_date',
  'occurrence_count',
  'is_automatic',
] as const satisfies readonly (keyof RecurringSeriesRow)[];

export type RecurringSeriesPatch = Partial<Pick<RecurringSeriesRow, (typeof RECURRING_SERIES_PATCH_KEYS)[number]>>;

/**
 * D-WR-04: the label for the undo step a series RPC records server-side, in the same
 * transaction as the write (D-24). The server builds the step's ops from its own change
 * set (the SQL mirror of `inverseOfSeriesChange`), so a caller that passes this must NOT
 * also call `insertUndoStep` for the same action.
 */
export interface SeriesUndoLabel {
  id: string;
  labelKey: UndoLabelKey;
  labelParams: UndoLabelParams;
}

export type SeriesWriteResult =
  | { status: 'applied'; changeSet: SeriesChangeSet; undoStepId?: string }
  | { status: 'already-applied' };

/** A series RPC returned a status this module does not recognise, or a shape it cannot validate (T-02-12-01). */
export const BAD_RESPONSE = 'bad-response';

const ENTITY = 'recurring_series' as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function badResponse(context: string): DbError {
  return new DbError(`recurring series RPC response: ${context}`, BAD_RESPONSE, null);
}

/** Validates one `{id, version}` entry from the RPC's inserted/soft_deleted/linked arrays. */
function parseIdVersion(value: unknown, context: string): { id: string; version: number } {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.length === 0 || !isPositiveInt(value.version)) {
    throw badResponse(`malformed ${context} entry`);
  }
  return { id: value.id, version: value.version };
}

/**
 * Strictly validates an 'applied' RPC envelope's `series`/`inserted`/`soft_deleted`/`linked`
 * fields and maps it to the engine's `SeriesChangeSet` shape (T-02-12-01): ids must be
 * non-empty strings and versions positive integers, or this throws a `DbError(BAD_RESPONSE)`
 * before any undo step is built from it. `soft_deleted`/`linked` entries carry `version`
 * over the wire; the engine's own vocabulary calls that same value `versionAfter`.
 */
export function parseSeriesChangeSet(json: unknown): SeriesChangeSet {
  if (!isRecord(json)) throw badResponse('not an object');

  const seriesField = json.series;
  if (!isRecord(seriesField) || typeof seriesField.id !== 'string' || seriesField.id.length === 0 || !isPositiveInt(seriesField.version)) {
    throw badResponse('malformed series');
  }

  const before = seriesField.before;
  if (before !== null && !isRecord(before)) throw badResponse('malformed series.before');

  const insertedRaw = json.inserted;
  const softDeletedRaw = json.soft_deleted;
  const linkedRaw = json.linked;
  if (!Array.isArray(insertedRaw) || !Array.isArray(softDeletedRaw) || !Array.isArray(linkedRaw)) {
    throw badResponse('malformed inserted/soft_deleted/linked');
  }

  const inserted = insertedRaw.map((row) => parseIdVersion(row, 'inserted'));
  const softDeleted = softDeletedRaw.map((row) => {
    const parsed = parseIdVersion(row, 'soft_deleted');
    return { id: parsed.id, versionAfter: parsed.version };
  });
  const linked = linkedRaw.map((row) => {
    const parsed = parseIdVersion(row, 'linked');
    return { id: parsed.id, versionAfter: parsed.version };
  });

  return {
    series: {
      id: seriesField.id,
      versionAfter: seriesField.version,
      before: before as Readonly<Record<string, PatchValue>> | null,
    },
    inserted,
    softDeleted,
    linked,
  };
}

/**
 * Shared response interpreter for all three series RPCs (create/edit_from/end): switches on
 * the envelope's `status` and either returns a `SeriesWriteResult` or throws the matching
 * typed error, exactly like a plain table write would (D-26). `entityId` is the series id
 * the caller already knows (the client-generated id for a create, the `id` parameter for an
 * edit/end) -- it is never read from the response, so a malformed response can't spoof it.
 */
function interpretSeriesResponse(entityId: string, data: unknown): SeriesWriteResult {
  const status = isRecord(data) ? data.status : undefined;

  switch (status) {
    case 'applied': {
      const changeSet = parseSeriesChangeSet(data);
      const undoStepId = isRecord(data) ? data.undo_step_id : undefined;
      if (undoStepId === undefined || undoStepId === null) return { status: 'applied', changeSet };
      if (typeof undoStepId !== 'string' || undoStepId.length === 0) throw badResponse('malformed undo_step_id');
      return { status: 'applied', changeSet, undoStepId };
    }
    case 'already-applied':
      return { status: 'already-applied' };
    case 'not-found':
      throw new NotFoundError(ENTITY, entityId);
    case 'conflict':
      // D-IN-05: validated and mapped exactly as applyPatches does, so callers narrowing on
      // `serverRow` for the refusal copy always get an `UndoConflict`.
      throw new VersionConflictError('recurring_series', entityId, parseConflict(isRecord(data) ? data.conflict : undefined));
    default:
      throw badResponse(`unrecognised status ${JSON.stringify(status)}`);
  }
}

export async function fetchRecurringSeries(client: DbClient, householdId: string): Promise<RecurringSeriesRow[]> {
  const { data, error, status } = await client
    .from('recurring_series')
    .select(RECURRING_SERIES_COLUMNS)
    .eq('household_id', householdId)
    .is('deleted_at', null)
    .order('name', { ascending: true });

  if (error) throw toDbError(error, status);
  return (data as RecurringSeriesRow[] | null) ?? [];
}

/** W6-13 WR-05: denial-of-service guard on fetchSeriesIdsByCategory (one merge's op cap). */
export const SERIES_BY_CATEGORY_MAX = 6000;

/**
 * D-36 / W6-13 WR-05: every live series template filed under one category, so a category merge
 * can move the templates with the rows (materialise_series copies the template's category into
 * each new occurrence, so a template left on the archived source keeps filing bills there).
 */
export async function fetchSeriesIdsByCategory(
  client: DbClient,
  householdId: string,
  categoryId: string
): Promise<{ id: string; version: number }[]> {
  const { data, error, status } = await client
    .from('recurring_series')
    .select('id, version')
    .eq('household_id', householdId)
    .eq('category_id', categoryId)
    .is('deleted_at', null)
    .limit(SERIES_BY_CATEGORY_MAX + 1);

  if (error) throw toDbError(error, status);
  return (data as { id: string; version: number }[] | null) ?? [];
}

/** `p_undo_step` is only sent when the caller asks the server to record the step (D-WR-04). */
function undoStepParam(undo: SeriesUndoLabel | undefined): { p_undo_step?: { id: string; label_key: string; label_params: UndoLabelParams } } {
  return undo ? { p_undo_step: { id: undo.id, label_key: undo.labelKey, label_params: undo.labelParams } } : {};
}

export async function createRecurringSeries(
  client: DbClient,
  series: NewRecurringSeries,
  link?: {
    anchorTransactionId?: string | null;
    linkTransactionIds?: readonly string[];
    /**
     * The anchor transaction was created in this same user action, so the recorded undo step
     * also soft-deletes it (one undo removes the new entry and its series). Only sent when
     * true; the server default is false and leaves the anchor alone.
     */
    anchorIsNew?: boolean;
  },
  undo?: SeriesUndoLabel
): Promise<SeriesWriteResult> {
  const { data, error, status } = await client.rpc('create_recurring_series', {
    p_series: series,
    p_anchor_transaction_id: link?.anchorTransactionId ?? null,
    p_link_transaction_ids: link?.linkTransactionIds ?? [],
    ...(link?.anchorIsNew === true ? { p_anchor_is_new: true } : {}),
    ...undoStepParam(undo),
  });

  if (error) throw toDbError(error, status);
  return interpretSeriesResponse(series.id, data);
}

export async function editRecurringSeriesFrom(
  client: DbClient,
  id: string,
  expectedVersion: number,
  patch: RecurringSeriesPatch,
  effectiveFrom: string,
  undo?: SeriesUndoLabel
): Promise<SeriesWriteResult> {
  assertAllowedKeys(patch, RECURRING_SERIES_PATCH_KEYS, 'editRecurringSeriesFrom');

  const { data, error, status } = await client.rpc('edit_recurring_series_from', {
    p_series_id: id,
    p_expected_version: expectedVersion,
    p_patch: patch,
    p_effective_from: effectiveFrom,
    ...undoStepParam(undo),
  });

  if (error) throw toDbError(error, status);
  return interpretSeriesResponse(id, data);
}

export async function endRecurringSeries(
  client: DbClient,
  id: string,
  expectedVersion: number,
  endDate: string,
  undo?: SeriesUndoLabel
): Promise<SeriesWriteResult> {
  const { data, error, status } = await client.rpc('end_recurring_series', {
    p_series_id: id,
    p_expected_version: expectedVersion,
    p_end_date: endDate,
    ...undoStepParam(undo),
  });

  if (error) throw toDbError(error, status);
  return interpretSeriesResponse(id, data);
}

/** D-19 / T-02.2-17-03: one batch call carries 1..50 series (the SQL enforces the same cap). */
export const SERIES_BATCH_MAX = 50;

export interface SeriesBatchItem {
  series: NewRecurringSeries;
  anchorTransactionId: string;
  linkTransactionIds: readonly string[];
}

export type SeriesBatchResult =
  | { status: 'applied'; undoStepId: string; changeSets: SeriesChangeSet[] }
  | { status: 'already-applied'; undoStepId: string };

/** Creates several series in one transaction and one undo step (D-19). */
export async function createRecurringSeriesBatch(
  client: DbClient,
  items: readonly SeriesBatchItem[],
  undo: SeriesUndoLabel
): Promise<SeriesBatchResult> {
  if (items.length < 1 || items.length > SERIES_BATCH_MAX) {
    throw new RangeError(`createRecurringSeriesBatch: expected 1 to ${SERIES_BATCH_MAX} items, got ${items.length}`);
  }

  const { data, error, status } = await client.rpc('create_recurring_series_batch', {
    p_items: items.map((item) => ({
      series: item.series,
      anchor_transaction_id: item.anchorTransactionId,
      link_transaction_ids: item.linkTransactionIds,
    })),
    p_undo_step: { id: undo.id, label_key: undo.labelKey, label_params: undo.labelParams },
  });

  if (error) throw toDbError(error, status);

  const state = isRecord(data) ? data.status : undefined;
  const undoStepId = isRecord(data) ? data.undo_step_id : undefined;
  if ((state !== 'applied' && state !== 'already-applied') || typeof undoStepId !== 'string' || undoStepId.length === 0) {
    throw badResponse(`unrecognised batch response ${JSON.stringify(state)}`);
  }
  if (state === 'already-applied') return { status: 'already-applied', undoStepId };

  const changes = (data as Record<string, unknown>).changes;
  if (!Array.isArray(changes)) throw badResponse('malformed changes');
  return { status: 'applied', undoStepId, changeSets: changes.map((change) => parseSeriesChangeSet(change)) };
}
