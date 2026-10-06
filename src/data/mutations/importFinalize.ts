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
  type UndoConflict,
} from '@/engine/undo';
import type { FormatProfile } from '@/engine/statement';
import { applyPatches, BAD_RESPONSE, type AppliedRow } from '@/db/patches';
import { DbError, VersionConflictError } from '@/db/errors';
import { IMPORT_CHUNK_MAX, insertTransactionsBatch } from '@/db/transactions';
import { fetchUndoLog, insertUndoStep } from '@/db/undoLog';
import { saveImportProfile } from '@/db/importProfiles';
import type { DbClient, NewTransaction } from '@/db/rows';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import {
  classifySettledWriteError,
  classifyWriteError,
  settledWriteErrorCode,
  shouldRetryWrite,
  writeRetryDelay,
} from '@/data/sync/writeErrors';
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
  /**
   * E-WR-06: the stored leg's own transfer_id as of the preview. A leg already in a transfer
   * is never linked again -- one stored leg must never end up in two transfers.
   */
  storedTransferId: string | null;
}

export interface ImportMarkPaid {
  pendingId: string;
  expectedVersion: number;
  before: { status: 'pending'; local_date: string; original_amount: number };
  patch: { status: 'paid'; local_date: string; original_amount: number };
  /**
   * C-CR-01: the statement line this match stands for, exactly as it would have been
   * inserted. D-55 never inserts it while the pending row is marked paid instead; when the
   * mark-paid cannot be applied (the pending row changed since preview, or the server
   * refused the batch), the line is inserted as an ordinary row so it is never lost.
   */
  line: NewTransaction;
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

/**
 * C-CR-01: what a finalize had to leave out, so onSuccess can tell the user (D-19). Ids and
 * counts only (T-02-15-07) -- a set-aside mark-paid's line is not lost, it was inserted as an
 * ordinary row (`recordedAsLines`).
 */
export interface FinalizeDropped {
  kind: 'conflict' | 'rejected';
  code: string;
  links: number;
  markPaid: number;
  limit: number;
  recordedAsLines: number;
  ids: string[];
}

export interface ImportFinalizeResult {
  applied: AppliedRow[];
  dropped: FinalizeDropped | null;
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

/**
 * C-CR-01: inserts the statement lines whose mark-paid was set aside, as ordinary rows. The
 * batch upsert ignores duplicates, so a retried attempt never inserts a line twice.
 */
async function insertFallbackLines(client: DbClient, lines: readonly NewTransaction[]): Promise<void> {
  for (const chunk of chunkKeepingPairs(lines, IMPORT_CHUNK_MAX)) {
    await insertTransactionsBatch(client, chunk);
  }
}

/** `apply_patches` refused the whole batch for a reason no retry will fix. */
function isPermanentRefusal(err: unknown): boolean {
  if (classifyWriteError(err) !== 'rejected') return false;
  // A response this client could not parse may have committed: never degrade on it (a
  // fallback line could then duplicate a bill that was in fact marked paid).
  return !(err instanceof DbError && err.code === BAD_RESPONSE);
}

/**
 * C-WR-02: apply_patches records the import's undo step in the same transaction as its
 * patches, so finding the step already in the log proves an earlier attempt of this finalize
 * committed -- its response was lost to a timeout or an app kill, and the retry conflicts only
 * because it still sends the versions from before. The client-side check reads the owner's
 * newest steps (fetchUndoLog's 12); a db helper that looks the id up directly would be exact
 * (follow-up for src/db, recorded in the review).
 */
async function stepAlreadyRecorded(client: DbClient, vars: ImportFinalizeVars): Promise<boolean> {
  const steps = await fetchUndoLog(client, vars.ownerId);
  return steps.some((step) => step.id === vars.stepId);
}

interface Keep {
  link(l: ImportLink): boolean;
  markPaid(m: ImportMarkPaid): boolean;
  limit(l: ImportLimit): boolean;
}

/**
 * C-CR-01 / D-55: the finalize degrades instead of failing as a whole. apply_patches refuses
 * the entire batch on the first conflict, so on a conflict the conflicting suggestion is set
 * aside and the rest is sent again (a refused attempt changed nothing, so resending is safe).
 * On a permanent refusal (e.g. the pair trigger) every suggestion is set aside. Setting aside:
 * - a transfer link: both rows already exist as ordinary rows; only the link is not made. A
 *   link whose imported row is missing (its chunk was rejected or parked) conflicts with
 *   reason not-found and is set aside the same way -- the chunk's own failed write already
 *   names the missing rows, so a chunk failure never takes the rest of the import with it.
 * - a mark-paid: the statement line is inserted as an ordinary row instead, so it is never
 *   silently lost, and it joins the import's undo step.
 * - a statement limit: not set.
 * The import's single undo step is always recorded (REC-13), covering whatever did land.
 */
async function runFinalize(client: DbClient, vars: ImportFinalizeVars): Promise<ImportFinalizeResult> {
  let links = vars.links;
  let markPaid = vars.markPaid;
  let limit = vars.limit;
  const fallback: NewTransaction[] = [];
  let dropped: FinalizeDropped | null = null;
  let replayChecked = false;

  const setAside = (kind: FinalizeDropped['kind'], code: string, keep: Keep, id: string | null): boolean => {
    const keptLinks = links.filter((l) => keep.link(l));
    const keptMarkPaid = markPaid.filter((m) => keep.markPaid(m));
    const removedMarkPaid = markPaid.filter((m) => !keep.markPaid(m));
    const keptLimit = limit && keep.limit(limit) ? limit : null;
    if (keptLinks.length === links.length && keptMarkPaid.length === markPaid.length && keptLimit === limit) {
      return false;
    }

    const prior: FinalizeDropped | null = dropped;
    const rejected = prior?.kind === 'rejected';
    dropped = {
      kind: rejected ? 'rejected' : kind,
      code: rejected && prior ? prior.code : code,
      links: (prior?.links ?? 0) + (links.length - keptLinks.length),
      markPaid: (prior?.markPaid ?? 0) + removedMarkPaid.length,
      limit: (prior?.limit ?? 0) + (limit && !keptLimit ? 1 : 0),
      recordedAsLines: (prior?.recordedAsLines ?? 0) + removedMarkPaid.length,
      ids: id ? [...(prior?.ids ?? []), id] : (prior?.ids ?? []),
    };
    fallback.push(...removedMarkPaid.map((m) => m.line));
    links = keptLinks;
    markPaid = keptMarkPaid;
    limit = keptLimit;
    return true;
  };

  // Every pass returns, throws, or sets aside at least one suggestion, so this always ends.
  for (;;) {
    if (fallback.length > 0) await insertFallbackLines(client, fallback);

    const items = buildFinalizeItems({ ...vars, links, markPaid, limit });
    // D-55: a kept mark-paid match's row is never inserted (the pending row is marked paid
    // instead) -- vars.insertedIds never included it; a set-aside one was inserted just
    // above. A linked imported row is at version 2 by the time this runs (its own insert at
    // 1, then the link patch); every other inserted row stays at 1.
    const linkedImported = new Set(links.map((l) => l.importedId));
    const inserted = [...vars.insertedIds, ...fallback.map((l) => l.id)].map((id) => ({
      id,
      version: linkedImported.has(id) ? 2 : 1,
    }));
    // n counts every statement line the import accounted for, however it landed.
    const n = vars.insertedIds.length + vars.markPaid.length;

    if (items.length === 0) {
      await insertUndoStep(client, buildStep(vars.stepId, 'imported', { n }, inverseOfInserts('transactions', inserted)));
      return { applied: [], dropped };
    }

    const { forward, inverse } = planBulkPatch(items);
    const step = buildStep(vars.stepId, 'imported', { n }, inverseOfImport({ inserted, patchInverse: inverse }));
    try {
      const applied = await applyPatches(client, forward, step);
      // CR-A02: chain this device's own writes the same way every other version-conditional
      // write does, keyed off the exact expectedVersion this attempt used (not a
      // recomputation -- resolveExpectedVersion may have moved on by the time onSuccess runs).
      for (const row of applied) {
        const item = items.find((i) => i.entity === row.entity && i.id === row.id);
        if (item) recordWrittenVersion(row.entity, row.id, [item.expectedVersion], row.version);
      }
      return { applied, dropped };
    } catch (err) {
      if (err instanceof VersionConflictError) {
        if (!replayChecked) {
          replayChecked = true;
          if (await stepAlreadyRecorded(client, vars)) return { applied: [], dropped: null }; // C-WR-02
        }
        const conflict = err.serverRow as Partial<UndoConflict> | null;
        const id = typeof conflict?.id === 'string' ? conflict.id : null;
        const hit = (entity: string, candidate: string): boolean =>
          id !== null && conflict?.entity === entity && candidate === id;
        const keep: Keep = {
          link: (l) => !hit('transactions', l.importedId) && !hit('transactions', l.storedId),
          markPaid: (m) => !hit('transactions', m.pendingId),
          limit: (l) => !hit('accounts', l.accountId),
        };
        if (setAside('conflict', 'version-conflict', keep, id)) continue;
        throw err; // a conflict on nothing this finalize sent: never guess
      }
      const none: Keep = { link: () => false, markPaid: () => false, limit: () => false };
      if (isPermanentRefusal(err) && setAside('rejected', settledWriteErrorCode(err), none, null)) continue;
      throw err;
    }
  }
}

export function registerImportFinalizeMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.importFinalize, {
    mutationFn: (vars: ImportFinalizeVars) => guardSession(vars, async () => runFinalize(await writeClient(), vars)),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: (vars: ImportFinalizeVars) => {
      markSession(vars); // WR-A09
    },
    onSuccess: async (result: ImportFinalizeResult, vars: ImportFinalizeVars) => {
      await qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(vars.householdId) });
      await qc.invalidateQueries({ queryKey: queryKeys.accounts(vars.householdId) });
      await qc.invalidateQueries({ queryKey: queryKeys.undoLog(vars.ownerId) });

      if (result.dropped) {
        // C-CR-01 / D-19: nothing set aside is silent. T-02-15-07: ids and counts only.
        const d = result.dropped;
        await recordFailedWrite({
          entity: 'transactions',
          entityId: `import:${vars.batchId}`,
          kind: d.kind,
          code: d.code,
          attempted: {
            import_batch_id: vars.batchId,
            stage: 'finalize',
            links: d.links,
            markPaid: d.markPaid,
            limit: d.limit,
            recordedAsLines: d.recordedAsLines,
            ids: d.ids,
          },
        });
      }

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
      await qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(vars.householdId) });
      await recordFailedWrite({
        entity: 'transactions',
        entityId: `import:${vars.batchId}`,
        kind: cls,
        code: cls === 'conflict' ? 'version-conflict' : settledWriteErrorCode(err),
        attempted: {
          import_batch_id: vars.batchId,
          stage: 'finalize',
          links: vars.links.length,
          markPaid: vars.markPaid.length,
          // C-CR-01 / D-19: the finalize could not run at all (server errors past the retry
          // budget, or a response it could not read). A mark-paid line exists nowhere else
          // (D-55 never inserted it), so it is kept here to be re-entered rather than lost.
          // A deliberate exception to T-02-15-07's counts-only rule for this one case: the
          // store is encrypted at rest (T-01-09-01) and the failure reporter never sees
          // `attempted`.
          ...(vars.markPaid.length > 0 ? { unrecordedLines: vars.markPaid.map((m) => ({ ...m.line })) } : {}),
        },
      });
    },
  });
}

export function useImportCommit(): { commit(input: ImportCommitInput): void } {
  const { enqueue } = useImportChunks();
  const mutation = useMutation<ImportFinalizeResult, unknown, ImportFinalizeVars>({
    mutationKey: mutationKeys.importFinalize,
    scope: WRITE_SCOPE,
  });

  return {
    commit(input: ImportCommitInput): void {
      if (input.finalize.links.length > 0 && !input.finalize.transferCategoryId) {
        throw new TypeError('useImportCommit: transferCategoryId is required when links are present');
      }
      // E-WR-06: refused before anything is enqueued. The link op's version check only catches
      // a leg that changed after the preview, not one that was already linked at preview time.
      const linkedLegs = new Set<string>();
      for (const link of input.finalize.links) {
        if (link.storedTransferId !== null) {
          throw new TypeError(`useImportCommit: stored leg ${link.storedId} is already in a transfer`);
        }
        for (const leg of [link.storedId, link.importedId]) {
          if (linkedLegs.has(leg)) throw new TypeError(`useImportCommit: leg ${leg} is named by two links`);
          linkedLegs.add(leg);
        }
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
