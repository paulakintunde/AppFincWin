// 08-15 (HH-04, HH-05, HH-06, D-14): the sharing writes that wait in the offline queue and replay version-checked:
// mark a line shared, change a split, change who paid, make a line private, and set your own category on a shared line.
// (Settle-up calls are different: they never queue, see settlements.ts.)
//
// The server answers an RPC with { ok: false, reason } rather than an HTTP error, so each mutation turns a refusal into a
// typed error here: version_conflict becomes a VersionConflictError that carries who changed the line first (updated_by,
// D-14), not_found a NotFoundError, and every other reason a HouseholdRejectedError. Neither is ever retried (the write
// queue only retries connectivity failures), and the reason code is what the failed-writes list shows (failedWriteLabels).
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { NotFoundError, VersionConflictError } from '@/db/errors';
import type { RpcResult } from '@/db/householdMembers';
import type { DbClient, TransactionRow } from '@/db/rows';
import {
  deleteMyLineCategory,
  makeLinePrivate,
  setLineSplit,
  setPaidBy,
  shareTransaction,
  upsertMyLineCategory,
  type SplitRule,
  type SplitSnapshot,
} from '@/db/transactionSplits';
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
import { patchMonthCacheIfLoaded } from './transactionCache';
import { writeClient } from './writeClient';

type TransactionList = WithPending<TransactionRow>[];

/** A household RPC refused the write for a reason that retrying cannot change. `code` is the reason, so it is what gets parked. */
export class HouseholdRejectedError extends Error {
  readonly code: string;

  constructor(
    readonly reason: string,
    readonly detail: Record<string, unknown> = {}
  ) {
    super(`Household write refused: ${reason}`);
    this.name = 'HouseholdRejectedError';
    this.code = reason;
  }
}

/** The row the server reports on a version conflict: who changed the line first, and its version now (D-14). */
export interface ConflictServerRow {
  version: number | null;
  updated_by: string | null;
}

/** Throws the typed error for a refusal; returns the success payload otherwise. */
export function unwrapRpc<T extends object>(res: RpcResult<T>, id: string): Extract<RpcResult<T>, { ok: true }> {
  if (res.ok) return res;
  const reason = res.reason;
  if (reason === 'version_conflict') {
    const serverRow: ConflictServerRow = {
      version: typeof res.current_version === 'number' ? res.current_version : null,
      updated_by: typeof res.updated_by === 'string' ? res.updated_by : null,
    };
    throw new VersionConflictError('transactions', id, serverRow);
  }
  if (reason === 'not_found') throw new NotFoundError('transactions', id);
  throw new HouseholdRejectedError(reason, res);
}

interface LineVars {
  householdId: string;
  /** The line's month ('YYYY-MM'), so its cache entry can be patched and refreshed. */
  month: string;
  id: string;
  /** The line's version in the cache when the change was made. */
  expectedVersion: number;
}

export interface ShareLineVars extends LineVars {
  rule?: SplitRule;
  participants?: string[];
  amounts?: Record<string, number>;
  seriesScope?: 'one' | 'series';
}

export interface SetLineSplitVars extends LineVars {
  rule: SplitRule;
  participants: string[];
  amounts?: Record<string, number>;
}

export type MakeLinePrivateVars = LineVars;

export interface SetPaidByVars extends LineVars {
  userId: string;
}

export interface SetMyLineCategoryVars {
  householdId: string;
  month: string;
  /** The signed-in user: only their own row is ever written. */
  userId: string;
  transactionId: string;
  /** Null clears the choice. */
  categoryId: string | null;
}

function patchLine(qc: QueryClient, v: { householdId: string; month: string; id: string }, patch: Partial<TransactionRow>): void {
  patchMonthCacheIfLoaded(qc, v.householdId, v.month, (rows: TransactionList) =>
    rows.map((r) => (r.id === v.id ? { ...r, ...patch, pending: true } : r))
  );
}

/** Not awaited: query-core holds the write scope while handlers are awaited, and a refetch must never delay the next write. */
function refreshAfterLineWrite(qc: QueryClient, v: { householdId: string; month: string }): void {
  void qc.invalidateQueries({ queryKey: queryKeys.transactionsMonth(v.householdId, v.month) });
  void qc.invalidateQueries({ queryKey: queryKeys.householdBalances(v.householdId) });
}

/** After a settled failure: take the optimistic change back by re-reading the month, and park the failure for the list. */
async function handleFailure(
  qc: QueryClient,
  err: unknown,
  v: { householdId: string; month: string },
  entityId: string,
  labelKey: string
): Promise<void> {
  const cls = classifySettledWriteError(err);
  if (cls !== 'conflict' && cls !== 'rejected' && cls !== 'not-found') return;
  void qc.invalidateQueries({ queryKey: queryKeys.transactionsMonth(v.householdId, v.month) });
  const attempted: Record<string, unknown> = { labelKey };
  if (err instanceof VersionConflictError) {
    const server = err.serverRow as ConflictServerRow | null;
    attempted.updated_by = server?.updated_by ?? null;
  }
  await recordFailedWrite({
    entity: 'transactions',
    entityId,
    kind: cls,
    code: cls === 'conflict' ? 'version-conflict' : settledWriteErrorCode(err),
    attempted,
  });
}

/** Runs one version-checked line RPC and records the version this device moved the line to (the CR-A02 chain). */
async function runLineRpc(
  vars: LineVars,
  call: (client: DbClient, expected: number) => Promise<RpcResult<{ version?: number }>>
): Promise<{ version: number | null }> {
  const expected = resolveExpectedVersion('transactions', vars.id, vars.expectedVersion);
  const client = await writeClient();
  const ok = unwrapRpc(await call(client, expected), vars.id);
  const version = typeof ok.version === 'number' ? ok.version : null;
  if (version !== null) recordWrittenVersion('transactions', vars.id, [vars.expectedVersion, expected], version);
  return { version };
}

export interface SetSplitResult {
  version: number | null;
  /** The split as it was before this change: what Undo sends back (D-14). Null when the server gave none. */
  before: SplitSnapshot | null;
}

export function registerHouseholdSharingMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.shareLine, {
    mutationFn: (vars: ShareLineVars) =>
      guardSession(vars, () =>
        runLineRpc(vars, (client, expected) =>
          shareTransaction(client, {
            id: vars.id,
            expectedVersion: expected,
            rule: vars.rule,
            participants: vars.participants,
            amounts: vars.amounts,
            seriesScope: vars.seriesScope,
          })
        )
      ),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: ShareLineVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.transactionsMonth(vars.householdId, vars.month) });
      patchLine(qc, vars, { is_shared: true, ...(vars.rule ? { split_rule: vars.rule } : {}) });
    },
    onSuccess: (_res: { version: number | null }, vars: ShareLineVars) => refreshAfterLineWrite(qc, vars),
    onError: (err: unknown, vars: ShareLineVars) => handleFailure(qc, err, vars, vars.id, 'shareLine'),
  });

  qc.setMutationDefaults(mutationKeys.setLineSplit, {
    mutationFn: (vars: SetLineSplitVars) =>
      guardSession(vars, async (): Promise<SetSplitResult> => {
        const expected = resolveExpectedVersion('transactions', vars.id, vars.expectedVersion);
        const client = await writeClient();
        const ok = unwrapRpc(
          await setLineSplit(client, {
            id: vars.id,
            expectedVersion: expected,
            rule: vars.rule,
            participants: vars.participants,
            amounts: vars.amounts,
          }),
          vars.id
        );
        const version = typeof ok.version === 'number' ? ok.version : null;
        if (version !== null) recordWrittenVersion('transactions', vars.id, [vars.expectedVersion, expected], version);
        return { version, before: ok.before ?? null };
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: SetLineSplitVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.transactionsMonth(vars.householdId, vars.month) });
      patchLine(qc, vars, { split_rule: vars.rule, split_manual: true });
    },
    onSuccess: (_res: SetSplitResult, vars: SetLineSplitVars) => refreshAfterLineWrite(qc, vars),
    onError: (err: unknown, vars: SetLineSplitVars) => handleFailure(qc, err, vars, vars.id, 'setLineSplit'),
  });

  qc.setMutationDefaults(mutationKeys.makeLinePrivate, {
    mutationFn: (vars: MakeLinePrivateVars) =>
      guardSession(vars, () => runLineRpc(vars, (client, expected) => makeLinePrivate(client, vars.id, expected))),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: MakeLinePrivateVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.transactionsMonth(vars.householdId, vars.month) });
      patchLine(qc, vars, { is_shared: false, split_rule: null, split_manual: false });
    },
    onSuccess: (_res: { version: number | null }, vars: MakeLinePrivateVars) => refreshAfterLineWrite(qc, vars),
    onError: (err: unknown, vars: MakeLinePrivateVars) => handleFailure(qc, err, vars, vars.id, 'makeLinePrivate'),
  });

  qc.setMutationDefaults(mutationKeys.setPaidBy, {
    mutationFn: (vars: SetPaidByVars) =>
      guardSession(vars, () => runLineRpc(vars, (client, expected) => setPaidBy(client, vars.id, expected, vars.userId))),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: SetPaidByVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.transactionsMonth(vars.householdId, vars.month) });
      patchLine(qc, vars, { paid_by: vars.userId });
    },
    onSuccess: (_res: { version: number | null }, vars: SetPaidByVars) => refreshAfterLineWrite(qc, vars),
    onError: (err: unknown, vars: SetPaidByVars) => handleFailure(qc, err, vars, vars.id, 'setPaidBy'),
  });

  // A member's own category on a shared line (D-33). No version: the row is the caller's own and the last write wins.
  qc.setMutationDefaults(mutationKeys.setMyLineCategory, {
    mutationFn: (vars: SetMyLineCategoryVars) =>
      guardSession(vars, async () => {
        const client = await writeClient();
        if (vars.categoryId === null) {
          await deleteMyLineCategory(client, vars.transactionId, vars.userId);
        } else {
          await upsertMyLineCategory(client, {
            transaction_id: vars.transactionId,
            user_id: vars.userId,
            household_id: vars.householdId,
            category_id: vars.categoryId,
          });
        }
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: (vars: SetMyLineCategoryVars) => {
      markSession(vars);
    },
    onSuccess: (_res: void, vars: SetMyLineCategoryVars) => {
      void qc.invalidateQueries({ queryKey: queryKeys.transactionsMonth(vars.householdId, vars.month) });
      void qc.invalidateQueries({ queryKey: queryKeys.myLineCategories(vars.householdId, vars.userId) }); // 07 D-33: Decide and Insights
    },
    onError: (err: unknown, vars: SetMyLineCategoryVars) =>
      handleFailure(qc, err, vars, vars.transactionId, 'setMyLineCategory'),
  });
}

export function useShareLine() {
  return useMutation<{ version: number | null }, unknown, ShareLineVars>({ mutationKey: mutationKeys.shareLine, scope: WRITE_SCOPE });
}

export function useSetLineSplit() {
  return useMutation<SetSplitResult, unknown, SetLineSplitVars>({ mutationKey: mutationKeys.setLineSplit, scope: WRITE_SCOPE });
}

export function useMakeLinePrivate() {
  return useMutation<{ version: number | null }, unknown, MakeLinePrivateVars>({
    mutationKey: mutationKeys.makeLinePrivate,
    scope: WRITE_SCOPE,
  });
}

export function useSetPaidBy() {
  return useMutation<{ version: number | null }, unknown, SetPaidByVars>({ mutationKey: mutationKeys.setPaidBy, scope: WRITE_SCOPE });
}

export function useSetMyLineCategory() {
  return useMutation<void, unknown, SetMyLineCategoryVars>({ mutationKey: mutationKeys.setMyLineCategory, scope: WRITE_SCOPE });
}

/**
 * Undo for a split change (D-14): the same call again with the split the server reported as `before`. `result` is what the
 * set-split mutation resolved with, so the version is the one the change produced. Null when there is nothing to go back to
 * (the server gave no previous rule, or no participants).
 */
export function splitUndoVars(
  original: Pick<SetLineSplitVars, 'householdId' | 'month' | 'id'>,
  result: SetSplitResult
): SetLineSplitVars | null {
  const before = result.before;
  if (!before || before.rule === null || result.version === null || before.participants.length === 0) return null;
  return {
    householdId: original.householdId,
    month: original.month,
    id: original.id,
    expectedVersion: result.version,
    rule: before.rule,
    participants: before.participants,
    // Only exact amounts need their per-person figures sent back; the other rules recompute from weights or evenly.
    ...(before.rule === 'amount' ? { amounts: before.shares } : {}),
  };
}
