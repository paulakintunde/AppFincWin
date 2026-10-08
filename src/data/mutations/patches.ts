// Bulk actions (ACT-05, D-06, D-24, D-50): bulk delete, bulk mark paid and bulk mark unpaid
// are each ONE queued `apply_patches` call that also records one labelled undo step in the
// same server transaction. The call is all-or-nothing: any row that changed elsewhere refuses
// the whole batch (Phase 1 D-18/D-19, D-26), the cache refetches, and the refusal lands in
// the failed-writes list and as a refusal toast.
//
// Every call carries its undo step (D-WR-03): the step id is the server's replay key, so a
// paused mutation that is replayed after its first attempt actually landed is recognised as
// already applied rather than conflicting with itself. The step id is minted once, before
// mutate(), and stays in the persisted variables across replays.
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { markPaidDate } from '@/engine/activity';
import { monthOf } from '@/engine/time';
import {
  NOW_SENTINEL,
  buildStep,
  planBulkPatch,
  type BulkPatchItem,
  type PatchValue,
  type UndoConflict,
  type UndoLabelKey,
  type UndoLabelParams,
} from '@/engine/undo';
import { DbError, VersionConflictError, type WriteEntity } from '@/db/errors';
import { applyPatches } from '@/db/patches';
import { TRANSFER_LEGS_MAX, fetchTransferLegs } from '@/db/transactions';
import type { TransactionRow } from '@/db/rows';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import type { WithPending } from '@/data/types';
import {
  classifySettledWriteError,
  settledWriteErrorCode,
  shouldRetryWrite,
  writeRetryDelay,
} from '@/data/sync/writeErrors';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { guardSession, markSession } from '@/data/sync/sessionEpoch';
import { recordWrittenVersion, resolveExpectedVersion } from '@/data/sync/versionChain';
import { showToast } from '@/state/undoToast';
import { writeClient } from './writeClient';
import { newStepId } from './undoCapture';

/** The server's cap on ops in one apply_patches call (matches buildStep's own cap). */
const BULK_MAX = 6000;

/** W6-13 WR-04: the failed-write code for a batch that grew past BULK_MAX at flush time. */
export const BULK_TOO_LARGE = 'bulk-too-large';

export interface BulkPatchVars {
  householdId: string;
  ownerId: string;
  items: BulkPatchItem[];
  undo: { stepId: string; labelKey: UndoLabelKey; labelParams: UndoLabelParams };
  /** Month keys (YYYY-MM) whose loaded caches are patched optimistically. */
  months: string[];
  /**
   * D-50: transfer ids whose partner legs the mutationFn must fetch and add to the batch at
   * flush time (a bulk delete of one leg deletes both, in the same atomic call).
   */
  expandTransferIds?: string[];
}

type TransactionList = WithPending<TransactionRow>[];

type BulkRow = Pick<TransactionRow, 'id' | 'version' | 'local_date' | 'status' | 'household_id' | 'transfer_id'>;
interface BulkContext {
  householdId: string;
  ownerId: string;
}

/** Labels whose `n` param is the count of rows the step really touched (set at flush time). */
const COUNTED_LABELS: ReadonlySet<UndoLabelKey> = new Set(['deletedMany', 'markedPaidMany', 'markedUnpaidMany']);

/** E-WR-10: planBulkPatch refuses a duplicate (entity, id); first occurrence wins. */
function dedupeItems(items: readonly BulkPatchItem[]): BulkPatchItem[] {
  const seen = new Set<string>();
  const out: BulkPatchItem[] = [];
  for (const item of items) {
    const key = `${item.entity}\u0000${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function chunked<T>(values: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

/** D-50: the partner legs of `transferIds` not already in `items`, as soft-delete items. */
async function partnerDeleteItems(
  vars: BulkPatchVars,
  items: readonly BulkPatchItem[],
  client: Awaited<ReturnType<typeof writeClient>>
): Promise<BulkPatchItem[]> {
  const ids = vars.expandTransferIds ?? [];
  if (ids.length === 0) return [];
  const present = new Set(items.filter((i) => i.entity === 'transactions').map((i) => i.id));
  const extra: BulkPatchItem[] = [];
  for (const group of chunked(ids, TRANSFER_LEGS_MAX)) {
    const legs = await fetchTransferLegs(client, vars.householdId, group);
    for (const leg of legs) {
      if (present.has(leg.id)) continue;
      present.add(leg.id);
      extra.push({
        entity: 'transactions',
        id: leg.id,
        expectedVersion: leg.version,
        before: { deleted_at: null },
        patch: { deleted_at: NOW_SENTINEL },
      });
    }
  }
  return extra;
}

function applyPatchToRow(row: WithPending<TransactionRow>, patch: Readonly<Record<string, PatchValue>>): WithPending<TransactionRow> {
  const resolved: Record<string, PatchValue> = {};
  for (const [key, value] of Object.entries(patch)) {
    resolved[key] = value === NOW_SENTINEL ? new Date().toISOString() : value;
  }
  return { ...row, ...(resolved as Partial<TransactionRow>), pending: true };
}

/** Optimistic: deleted rows leave every loaded month; other patches merge in place. */
function patchLoadedMonths(qc: QueryClient, vars: BulkPatchVars): void {
  const patches = new Map<string, Readonly<Record<string, PatchValue>>>();
  for (const item of vars.items) if (item.entity === 'transactions') patches.set(item.id, item.patch);
  if (patches.size === 0) return;

  const loaded = new Map<string, TransactionList>();
  for (const month of new Set(vars.months)) {
    const rows = qc.getQueryData<TransactionList>(queryKeys.transactionsMonth(vars.householdId, month));
    if (rows !== undefined) loaded.set(month, rows);
  }

  const patched = new Map<string, WithPending<TransactionRow>>();
  for (const rows of loaded.values()) {
    for (const row of rows) {
      const patch = patches.get(row.id);
      if (patch && !patched.has(row.id)) patched.set(row.id, applyPatchToRow(row, patch));
    }
  }

  for (const [month, rows] of loaded) {
    const kept = rows.flatMap((row) => {
      const next = patched.get(row.id);
      if (!next) return [row];
      if (next.deleted_at !== null) return [];
      return monthOf(next.local_date) === month ? [next] : [];
    });
    const present = new Set(kept.map((r) => r.id));
    const arrived = [...patched.values()].filter(
      (r) => r.deleted_at === null && monthOf(r.local_date) === month && !present.has(r.id)
    );
    qc.setQueryData<TransactionList>(queryKeys.transactionsMonth(vars.householdId, month), [...arrived, ...kept]);
  }
}

function invalidateAfterBulk(qc: QueryClient, vars: BulkPatchVars): void {
  // Not awaited: query-core holds WRITE_SCOPE while onSuccess/onError are awaited (WR-A15).
  void qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(vars.householdId) });
  void qc.invalidateQueries({ queryKey: queryKeys.undoLog(vars.ownerId) });
  if (vars.items.some((i) => i.entity === 'accounts')) {
    void qc.invalidateQueries({ queryKey: queryKeys.accounts(vars.householdId) });
  }
  if (vars.items.some((i) => i.entity === 'categories')) {
    void qc.invalidateQueries({ queryKey: queryKeys.categories(vars.ownerId) });
  }
  if (vars.items.some((i) => i.entity === 'recurring_series')) {
    void qc.invalidateQueries({ queryKey: queryKeys.recurringSeries(vars.householdId) });
  }
}

export function registerPatchMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.bulkPatch, {
    mutationFn: (vars: BulkPatchVars) =>
      guardSession(vars, async () => {
        const client = await writeClient();
        const requested = dedupeItems(vars.items);
        // D-50: partner legs are read at flush time, so a transfer's other leg is whatever it
        // is now (it may have been edited or deleted while this sat in the queue).
        const items = [...requested, ...(await partnerDeleteItems(vars, requested, client))];
        // W6-13 WR-04: partner expansion can push a batch past the op cap after apply() checked
        // it; refuse with a meaningful code instead of letting buildStep throw a bare RangeError.
        if (items.length > BULK_MAX) throw new DbError(`bulk patch: ${items.length} ops exceeds ${BULK_MAX}`, BULK_TOO_LARGE, null);
        const resolved = items.map((i) => ({
          ...i,
          expectedVersion: resolveExpectedVersion(i.entity as WriteEntity, i.id, i.expectedVersion),
        }));
        const { forward, inverse } = planBulkPatch(resolved);
        const labelParams = COUNTED_LABELS.has(vars.undo.labelKey)
          ? { ...vars.undo.labelParams, n: items.length }
          : vars.undo.labelParams;
        const step = buildStep(vars.undo.stepId, vars.undo.labelKey, labelParams, inverse);
        const rows = await applyPatches(client, forward, step);

        const bases = new Map(items.map((i, k) => [`${i.entity}\u0000${i.id}`, [i.expectedVersion, resolved[k]!.expectedVersion]] as const));
        for (const row of rows) {
          recordWrittenVersion(row.entity as WriteEntity, row.id, bases.get(`${row.entity}\u0000${row.id}`) ?? [], row.version);
        }
        return rows;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: BulkPatchVars) => {
      markSession(vars); // WR-A09
      await Promise.all(
        [...new Set(vars.months)].map((m) => qc.cancelQueries({ queryKey: queryKeys.transactionsMonth(vars.householdId, m) }))
      );
      patchLoadedMonths(qc, vars);
    },
    onSuccess: (_rows: unknown, vars: BulkPatchVars) => {
      invalidateAfterBulk(qc, vars);
    },
    onError: async (err: unknown, vars: BulkPatchVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'conflict' && cls !== 'rejected' && cls !== 'not-found') return;
      void qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(vars.householdId) });
      const attempted = { labelKey: vars.undo.labelKey, n: vars.items.length };

      if (err instanceof VersionConflictError) {
        const conflict = err.serverRow as UndoConflict;
        await recordFailedWrite({
          entity: conflict.entity,
          entityId: conflict.id,
          kind: 'conflict',
          code: 'version-conflict',
          attempted,
        });
        showToast({ kind: 'refusal', refusal: conflict });
        return;
      }

      // Ids and counts only (T-02-15-07): a rejected batch names its step, not its rows.
      await recordFailedWrite({
        entity: (vars.items[0]?.entity ?? 'transactions') as WriteEntity,
        entityId: `bulk:${vars.undo.stepId}`,
        kind: cls,
        code: settledWriteErrorCode(err),
        attempted,
      });
    },
  });
}

type ApplyInput = Omit<BulkPatchVars, 'undo'> & { undo: Omit<BulkPatchVars['undo'], 'stepId'> };

export function useBulkPatch(): { apply(vars: ApplyInput): string } {
  const mutation = useMutation<unknown, unknown, BulkPatchVars>({
    mutationKey: mutationKeys.bulkPatch,
    scope: WRITE_SCOPE,
  });

  return {
    apply(vars: ApplyInput): string {
      const items = dedupeItems(vars.items);
      if (items.length === 0) throw new RangeError('bulk patch: nothing selected');
      // W6-13 WR-04: each transfer id to expand can add one partner leg at flush, so it counts
      // toward the cap here too (worst case: none of those partners is already selected).
      const worstCase = items.length + (vars.expandTransferIds?.length ?? 0);
      if (worstCase > BULK_MAX) throw new RangeError(`bulk patch: ${worstCase} rows exceeds ${BULK_MAX}`);
      const stepId = newStepId();
      mutation.mutate({ ...vars, items, undo: { ...vars.undo, stepId } });
      return stepId;
    },
  };
}

function uniqueRows<T extends { id: string }>(rows: readonly T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}

function monthsOf(rows: readonly Pick<BulkRow, 'local_date'>[], extra: readonly string[] = []): string[] {
  return [...new Set([...rows.map((r) => monthOf(r.local_date)), ...extra])];
}

export function useBulkDelete(): { remove(rows: readonly BulkRow[], ctx: BulkContext): string } {
  const { apply } = useBulkPatch();
  return {
    remove(rows: readonly BulkRow[], ctx: BulkContext): string {
      const selected = uniqueRows(rows);
      // D-50: a selected leg whose partner is not selected needs its partner fetched at flush.
      const perTransfer = new Map<string, number>();
      for (const r of selected) if (r.transfer_id) perTransfer.set(r.transfer_id, (perTransfer.get(r.transfer_id) ?? 0) + 1);
      const expandTransferIds = [...perTransfer].filter(([, count]) => count < 2).map(([id]) => id);

      return apply({
        householdId: ctx.householdId,
        ownerId: ctx.ownerId,
        items: selected.map((r) => ({
          entity: 'transactions',
          id: r.id,
          expectedVersion: r.version,
          before: { deleted_at: null },
          patch: { deleted_at: NOW_SENTINEL },
        })),
        months: monthsOf(selected),
        ...(expandTransferIds.length > 0 ? { expandTransferIds } : {}),
        undo: { labelKey: 'deletedMany', labelParams: { n: selected.length } },
      });
    },
  };
}

export function useBulkMarkPaid(): {
  markPaid(rows: readonly BulkRow[], ctx: BulkContext, today: string): string;
} {
  const { apply } = useBulkPatch();
  return {
    markPaid(rows: readonly BulkRow[], ctx: BulkContext, today: string): string {
      // D-50/D-56: transfer legs are always paid in this phase and are left alone.
      const targets = uniqueRows(rows).filter((r) => r.status === 'pending' && !r.transfer_id);
      if (targets.length === 0) throw new RangeError('nothing to mark');
      const dates = targets.map((r) => markPaidDate(today, r.local_date));
      return apply({
        householdId: ctx.householdId,
        ownerId: ctx.ownerId,
        items: targets.map((r, k) => ({
          entity: 'transactions',
          id: r.id,
          expectedVersion: r.version,
          before: { status: 'pending', local_date: r.local_date },
          patch: { status: 'paid', local_date: dates[k]! },
        })),
        months: monthsOf(targets, dates.map(monthOf)),
        undo: { labelKey: 'markedPaidMany', labelParams: { n: targets.length } },
      });
    },
  };
}

export function useBulkMarkUnpaid(): {
  markUnpaid(rows: readonly BulkRow[], ctx: BulkContext): string;
} {
  const { apply } = useBulkPatch();
  return {
    markUnpaid(rows: readonly BulkRow[], ctx: BulkContext): string {
      const targets = uniqueRows(rows).filter((r) => r.status === 'paid' && !r.transfer_id);
      if (targets.length === 0) throw new RangeError('nothing to mark');
      return apply({
        householdId: ctx.householdId,
        ownerId: ctx.ownerId,
        items: targets.map((r) => ({
          entity: 'transactions',
          id: r.id,
          expectedVersion: r.version,
          before: { status: 'paid' },
          patch: { status: 'pending' },
        })),
        months: monthsOf(targets),
        undo: { labelKey: 'markedUnpaidMany', labelParams: { n: targets.length } },
      });
    },
  };
}

