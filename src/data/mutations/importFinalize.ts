// The import finalize write (REC-13/REC-14/REC-17/D-16/D-24/D-48/D-50/D-52/D-55): after
// every chunk (transactions.ts's useImportChunks) has been queued, ONE queued
// `importFinalize` mutation links accepted transfer pairs, marks accepted pending bills
// paid, sets an accepted statement limit, and records the import's single "Imported N
// lines" undo step, in the same atomic apply_patches call (D-50/D-55) -- so undo never
// trips the pair trigger by unlinking one leg while the other is still linked
// (RESEARCH.md §A5.3 pitfall 7). The engine never links anything itself (T-02-15-06):
// every link/mark-paid/limit here is a user-accepted suggestion the caller already
// confirmed in the preview.
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import {
  buildStep,
  inverseOfImport,
  inverseOfInserts,
  planBulkPatch,
  type BulkPatchItem,
  type PatchValue,
} from '@/engine/undo';
import type { FormatProfile } from '@/engine/statement';
import { applyPatches, type AppliedRow } from '@/db/patches';
import { insertUndoStep } from '@/db/undoLog';
import { saveImportProfile } from '@/db/importProfiles';
import type { NewTransaction } from '@/db/rows';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import { classifySettledWriteError, settledWriteErrorCode, shouldRetryWrite, writeRetryDelay } from '@/data/sync/writeErrors';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { guardSession, markSession } from '@/data/sync/sessionEpoch';
import { recordWrittenVersion, resolveExpectedVersion } from '@/data/sync/versionChain';
import { writeClient } from './writeClient';
import { chunkKeepingPairs, useImportChunks } from './transactions';

// Re-exported so downstream code can `import { chunkKeepingPairs } from
// '@/data/mutations/importFinalize'` per this plan's documented shape -- see transactions.ts's
// own doc comment on chunkKeepingPairs for why the function is defined there instead (a
// no-circular depcruise deviation).
export { chunkKeepingPairs };

export interface ImportLink {
  importedId: string;
  importedCategoryId: string | null;
  storedId: string;
  storedVersion: number;
  storedCategoryId: string | null;
  transferId: string;
}

export interface ImportMarkPaid {
  pendingId: string;
  expectedVersion: number;
  before: { status: 'pending'; local_date: string; original_amount: number };
  patch: { status: 'paid'; local_date: string; original_amount: number };
}

export interface ImportLimit {
  accountId: string;
  expectedVersion: number;
  before: { overdraft_limit?: number | null; credit_limit?: number | null };
  patch: { overdraft_limit?: number; credit_limit?: number };
}

export interface ImportFinalizeVars {
  householdId: string;
  ownerId: string;
  batchId: string;
  stepId: string;
  /** Every row the chunks inserted (orphan counter-legs included). */
  insertedIds: string[];
  transferCategoryId: string | null;
  links: ImportLink[];
  markPaid: ImportMarkPaid[];
  limit: ImportLimit | null;
  profile: { accountId: string; signature: string; profile: FormatProfile; id: string } | null;
}

export interface ImportCommitInput {
  householdId: string;
  userId: string;
  homeCurrency: string;
  batchId: string;
  stepId: string;
  rows: NewTransaction[];
  finalize: Omit<ImportFinalizeVars, 'householdId' | 'ownerId' | 'batchId' | 'stepId' | 'insertedIds'>;
}

/** Builds the version-checked op list for every accepted link/mark-paid/limit (D-50/D-55/D-48). */
function buildFinalizeItems(vars: ImportFinalizeVars): BulkPatchItem[] {
  const items: BulkPatchItem[] = [];

  for (const link of vars.links) {
    const patch: Readonly<Record<string, PatchValue>> = { transfer_id: link.transferId, category_id: vars.transferCategoryId };
    items.push({
      entity: 'transactions',
      id: link.importedId,
      // A linked imported row's own insert lands at version 1; nothing else this device
      // wrote could have touched it first.
      expectedVersion: resolveExpectedVersion('transactions', link.importedId, 1),
      before: { transfer_id: null, category_id: link.importedCategoryId },
      patch,
    });
    items.push({
      entity: 'transactions',
      id: link.storedId,
      expectedVersion: resolveExpectedVersion('transactions', link.storedId, link.storedVersion),
      before: { transfer_id: null, category_id: link.storedCategoryId },
      patch,
    });
  }

  for (const m of vars.markPaid) {
    items.push({
      entity: 'transactions',
      id: m.pendingId,
      expectedVersion: resolveExpectedVersion('transactions', m.pendingId, m.expectedVersion),
      before: m.before,
      patch: m.patch,
    });
  }

  if (vars.limit) {
    items.push({
      entity: 'accounts',
      id: vars.limit.accountId,
      expectedVersion: resolveExpectedVersion('accounts', vars.limit.accountId, vars.limit.expectedVersion),
      before: vars.limit.before,
      patch: vars.limit.patch,
    });
  }

  return items;
}

export function registerImportFinalizeMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.importFinalize, {
    mutationFn: (vars: ImportFinalizeVars) =>
      guardSession(vars, async () => {
        const client = await writeClient();
        const items = buildFinalizeItems(vars);
        // D-55: a mark-paid match's row is never inserted at all (the pending row is marked
        // paid instead) -- vars.insertedIds already reflects that (the caller never included
        // it). A linked imported row is at version 2 by the time this runs (its own insert at
        // 1, then buildFinalizeItems's link patch); every other inserted row stays at 1.
        const linkedImported = new Set(vars.links.map((l) => l.importedId));
        const inserted = vars.insertedIds.map((id) => ({ id, version: linkedImported.has(id) ? 2 : 1 }));

        if (items.length === 0) {
          const step = buildStep(vars.stepId, 'imported', { n: inserted.length }, inverseOfInserts('transactions', inserted));
          await insertUndoStep(client, step);
          return [] as AppliedRow[];
        }

        const { forward, inverse } = planBulkPatch(items);
        const step = buildStep(
          vars.stepId,
          'imported',
          { n: inserted.length + vars.markPaid.length },
          inverseOfImport({ inserted, patchInverse: inverse })
        );
        const applied = await applyPatches(client, forward, step);
        // CR-A02: chain this device's own writes the same way every other version-conditional
        // write does, keyed off the exact expectedVersion this attempt used (not a
        // recomputation -- resolveExpectedVersion may have moved on by the time onSuccess runs).
        for (const row of applied) {
          const item = items.find((i) => i.entity === row.entity && i.id === row.id);
          if (item) recordWrittenVersion(row.entity, row.id, [item.expectedVersion], row.version);
        }
        return applied;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: (vars: ImportFinalizeVars) => {
      markSession(vars); // WR-A09
    },
    onSuccess: async (_rows: AppliedRow[], vars: ImportFinalizeVars) => {
      await qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(vars.householdId) });
      await qc.invalidateQueries({ queryKey: queryKeys.accounts(vars.householdId) });
      await qc.invalidateQueries({ queryKey: queryKeys.undoLog(vars.ownerId) });

      if (vars.profile) {
        try {
          const client = await writeClient();
          await saveImportProfile(client, {
            id: vars.profile.id,
            ownerId: vars.ownerId,
            accountId: vars.profile.accountId,
            signature: vars.profile.signature,
            profile: vars.profile.profile,
          });
        } catch {
          // D-42: best-effort. A failed remembered-reading save never reaches the
          // failed-writes list or error reporting -- the next import just asks again.
        }
      }
    },
    onError: async (err: unknown, vars: ImportFinalizeVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'conflict' && cls !== 'rejected' && cls !== 'not-found') return;
      // T-02-15-07: ids and counts only -- never amounts, names or raw strings.
      await qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(vars.householdId) });
      await recordFailedWrite({
        entity: 'transactions',
        entityId: `import:${vars.batchId}`,
        kind: cls,
        code: cls === 'conflict' ? 'version-conflict' : settledWriteErrorCode(err),
        attempted: { import_batch_id: vars.batchId, stage: 'finalize', links: vars.links.length, markPaid: vars.markPaid.length },
      });
    },
  });
}

export function useImportCommit(): { commit(input: ImportCommitInput): void } {
  const { enqueue } = useImportChunks();
  const mutation = useMutation<AppliedRow[], unknown, ImportFinalizeVars>({
    mutationKey: mutationKeys.importFinalize,
    scope: WRITE_SCOPE,
  });

  return {
    commit(input: ImportCommitInput): void {
      if (input.finalize.links.length > 0 && !input.finalize.transferCategoryId) {
        throw new TypeError('useImportCommit: transferCategoryId is required when links are present');
      }

      // C-WR-09: every row this commit inserts belongs to this batch (REC-14 provenance,
      // dedupe by batch, History). Stamped here so it never depends on the caller setting the
      // optional field -- otherwise the optimistic row showed the batch and the saved one lost it.
      const rows = input.rows.map((r) => ({ ...r, import_batch_id: input.batchId }));
      const insertedIds = rows.map((r) => r.id);
      enqueue({
        householdId: input.householdId,
        batchId: input.batchId,
        rows,
        homeCurrency: input.homeCurrency,
        userId: input.userId,
      });
      mutation.mutate({
        householdId: input.householdId,
        ownerId: input.userId,
        batchId: input.batchId,
        stepId: input.stepId,
        insertedIds,
        ...input.finalize,
      });
    },
  };
}
