// 05-19 (D-12, D-36, 04 D-07, D-40, OQ3): paused-mutation defaults and hooks for the links between a check and
// the lines it wrote or was matched to, a card's own rate and minimum terms, and statement coverage periods.
//   attachLine / unlinkLine     decide_links insert (replay key: client id) and soft delete (one undo step).
//   saveCardRate / saveCardTerms the card's OWN debts record, created when the card has none. Only text the user typed
//                                and confirmed is stored; nothing is defaulted or invented.
//   recordStatementPeriod        an import that states its period (a duplicate id is success).
// Failed-write records carry ids, kinds and field names only, never names or amounts (privacy).
import * as Crypto from 'expo-crypto';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { buildStep, inverseOfPatches, type PatchValue } from '@/engine/undo';
import { VersionConflictError } from '@/db/errors';
import { insertDebt, updateDebt, type DebtPatch, type DebtRow } from '@/db/debts';
import {
  insertDecideLink,
  updateDecideLink,
  type DecideLinkRoleValue,
  type DecideLinkRow,
} from '@/db/decideLinks';
import { insertStatementPeriod, type StatementPeriodRow } from '@/db/statementPeriods';
import { attachRoleFor } from '@/features/decide/journal/pastDecisions';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import {
  classifySettledWriteError,
  settledWriteErrorCode,
  shouldRetryWrite,
  writeRetryDelay,
} from '@/data/sync/writeErrors';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { guardSession, markSession } from '@/data/sync/sessionEpoch';
import { recordWrittenVersion, resolveExpectedVersion } from '@/data/sync/versionChain';
import { writeClient } from './writeClient';
import { acceptIfAlreadyApplied, upsertRow } from './cacheRows';
import { newStepId, recordUndoStepSafely } from './undoCapture';

/** The percent grammar shared by a card's rate and its minimum percent: digits, an optional short fraction. */
export const PERCENT_TEXT_RE = /^\d{1,4}(\.\d{1,10})?$/;

export interface AttachLineVars {
  userId: string;
  id: string;
  householdId: string;
  checkId: string;
  entity: 'transactions' | 'recurring_series' | 'debts';
  targetId: string;
  role: DecideLinkRoleValue | null;
}

export interface UnlinkLineVars {
  id: string;
  ownerId: string;
  householdId: string;
  checkId: string;
  expectedVersion: number;
  stepId: string;
  name: string;
}

export interface DebtWriteVars {
  userId: string;
  householdId: string;
  /** Client id for the insert, minted before the mutation so a replay is idempotent. */
  newId: string;
  existing: { id: string; version: number } | null;
  accountId: string;
  accountName: string;
  currency: string;
  patch: DebtPatch;
}

export interface RecordStatementPeriodVars {
  id: string;
  householdId: string;
  accountId: string;
  start: string;
  end: string;
}

type DebtList = DebtRow[];

function invalidateLinks(qc: QueryClient, userId: string, householdId: string, checkId: string): void {
  void qc.invalidateQueries({ queryKey: queryKeys.decideLinks(userId, householdId) });
  void qc.invalidateQueries({ queryKey: queryKeys.decideLinkedLines(householdId, checkId) });
}

function newDebtRow(vars: DebtWriteVars) {
  return {
    id: vars.newId,
    household_id: vars.householdId,
    account_id: vars.accountId,
    series_id: null,
    name: vars.accountName,
    kind: 'card' as const,
    currency: vars.currency,
    balance: 0,
    apr: vars.patch.apr ?? null,
    minimum_payment: 0,
    secured: false,
    term_months: null,
    start_date: null,
    min_percent: vars.patch.min_percent ?? null,
    min_interest_added: vars.patch.min_interest_added ?? null,
    min_floor: vars.patch.min_floor ?? null,
    paid_in_full: vars.patch.paid_in_full ?? false,
  };
}

function registerDebtWrite(qc: QueryClient, key: readonly unknown[]): void {
  qc.setMutationDefaults(key, {
    mutationFn: (vars: DebtWriteVars) =>
      guardSession(vars, async () => {
        const client = await writeClient();
        if (vars.existing === null) return insertDebt(client, newDebtRow(vars));
        const expected = resolveExpectedVersion('debts', vars.existing.id, vars.existing.version);
        const row = await updateDebt(client, vars.existing.id, expected, vars.patch).catch((err: unknown) =>
          acceptIfAlreadyApplied<DebtRow>(err, vars.patch)
        );
        recordWrittenVersion('debts', vars.existing.id, [vars.existing.version, expected], row.version);
        return row;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: DebtWriteVars) => {
      markSession(vars);
      const cacheKey = queryKeys.debts(vars.householdId);
      await qc.cancelQueries({ queryKey: cacheKey });
      const now = new Date().toISOString();
      qc.setQueryData<DebtList>(cacheKey, (old) => {
        const rows = old ?? [];
        if (vars.existing !== null) {
          const id = vars.existing.id;
          return rows.map((r) => (r.id === id ? { ...r, ...vars.patch } : r));
        }
        const inserted: DebtRow = {
          ...newDebtRow(vars),
          check_id: null,
          is_sample: false,
          deleted_at: null,
          version: 1,
          updated_by: null,
          created_at: now,
          updated_at: now,
        };
        return upsertRow(rows, inserted, 'end');
      });
    },
    onSuccess: (row: DebtRow, vars: DebtWriteVars) => {
      qc.setQueryData<DebtList>(queryKeys.debts(vars.householdId), (old) => upsertRow(old ?? [], row, 'end'));
    },
    onError: async (err: unknown, vars: DebtWriteVars) => {
      const cls = classifySettledWriteError(err);
      const isConflict = cls === 'conflict' && err instanceof VersionConflictError;
      if (!isConflict && cls !== 'rejected' && cls !== 'not-found') return;
      // The snapshot recomputes from the server copy; the failed attempt is parked below.
      void qc.invalidateQueries({ queryKey: queryKeys.debts(vars.householdId) });
      await recordFailedWrite({
        entity: 'debts',
        entityId: vars.existing?.id ?? vars.newId,
        kind: isConflict ? 'conflict' : (cls as 'rejected' | 'not-found'),
        code: isConflict ? 'version-conflict' : settledWriteErrorCode(err),
        attempted: { fields: Object.keys(vars.patch) },
      });
    },
  });
}

export function registerDecideLinkMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.attachLine, {
    mutationFn: (vars: AttachLineVars) =>
      guardSession(vars, async () =>
        insertDecideLink(await writeClient(), {
          id: vars.id,
          household_id: vars.householdId,
          check_id: vars.checkId,
          entity: vars.entity,
          target_id: vars.targetId,
          ...(vars.role ? { role: vars.role } : {}),
        })
      ),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: (vars: AttachLineVars) => {
      markSession(vars);
    },
    onSuccess: (_row: DecideLinkRow, vars: AttachLineVars) => {
      invalidateLinks(qc, vars.userId, vars.householdId, vars.checkId);
    },
    onError: async (err: unknown, vars: AttachLineVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return;
      invalidateLinks(qc, vars.userId, vars.householdId, vars.checkId);
      await recordFailedWrite({
        entity: 'decide_links',
        entityId: vars.id,
        kind: cls,
        code: settledWriteErrorCode(err),
        attempted: { entity: vars.entity },
      });
    },
  });

  qc.setMutationDefaults(mutationKeys.editLink, {
    mutationFn: (vars: UnlinkLineVars) =>
      guardSession(vars, async () => {
        const patch = { deleted_at: new Date().toISOString() };
        const expected = resolveExpectedVersion('decide_links', vars.id, vars.expectedVersion);
        const client = await writeClient();
        const row = await updateDecideLink(client, vars.id, expected, patch).catch((err: unknown) =>
          // A replay after the first attempt landed finds the link already deleted.
          acceptIfAlreadyDeleted(err)
        );
        recordWrittenVersion('decide_links', vars.id, [vars.expectedVersion, expected], row.version);
        const before: Readonly<Record<string, PatchValue>> = { deleted_at: null };
        const step = buildStep(
          vars.stepId,
          'lineUnlinked',
          { name: vars.name },
          inverseOfPatches('decide_links', [{ id: row.id, before, versionAfter: row.version }])
        );
        await recordUndoStepSafely(qc, client, step, vars.ownerId);
        return row;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: (vars: UnlinkLineVars) => {
      markSession(vars);
      // Every cached link list sits under this prefix; the unlinked link leaves them at once.
      qc.setQueriesData<DecideLinkRow[]>({ queryKey: ['decide-links', vars.ownerId, vars.householdId] }, (old) =>
        Array.isArray(old) ? old.filter((l) => l.id !== vars.id) : old
      );
    },
    onSuccess: (_row: DecideLinkRow, vars: UnlinkLineVars) => {
      invalidateLinks(qc, vars.ownerId, vars.householdId, vars.checkId);
    },
    onError: async (err: unknown, vars: UnlinkLineVars) => {
      const cls = classifySettledWriteError(err);
      const isConflict = cls === 'conflict' && err instanceof VersionConflictError;
      if (!isConflict && cls !== 'rejected' && cls !== 'not-found') return;
      invalidateLinks(qc, vars.ownerId, vars.householdId, vars.checkId);
      await recordFailedWrite({
        entity: 'decide_links',
        entityId: vars.id,
        kind: isConflict ? 'conflict' : (cls as 'rejected' | 'not-found'),
        code: isConflict ? 'version-conflict' : settledWriteErrorCode(err),
        attempted: { fields: ['deleted_at'] },
      });
    },
  });

  registerDebtWrite(qc, mutationKeys.saveCardRate);
  registerDebtWrite(qc, mutationKeys.saveCardTerms); // D-40

  qc.setMutationDefaults(mutationKeys.recordStatementPeriod, {
    mutationFn: (vars: RecordStatementPeriodVars) =>
      guardSession(vars, async () =>
        // 23505 on the id means this exact period already landed: success (insertStatementPeriod returns null).
        insertStatementPeriod(await writeClient(), {
          id: vars.id,
          household_id: vars.householdId,
          account_id: vars.accountId,
          period_start: vars.start,
          period_end: vars.end,
        })
      ),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: (vars: RecordStatementPeriodVars) => {
      markSession(vars);
    },
    onSuccess: (_row: StatementPeriodRow | null, vars: RecordStatementPeriodVars) => {
      void qc.invalidateQueries({ queryKey: queryKeys.statementPeriods(vars.householdId) });
    },
    onError: async (err: unknown, vars: RecordStatementPeriodVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return;
      await recordFailedWrite({
        entity: 'statement_periods',
        entityId: vars.id,
        kind: cls,
        code: settledWriteErrorCode(err),
        attempted: { accountId: vars.accountId },
      });
    },
  });
}

/** An unlink that finds the link already soft-deleted (a replay) is the result we wanted. */
function acceptIfAlreadyDeleted(err: unknown): DecideLinkRow {
  if (err instanceof VersionConflictError) {
    const server = err.serverRow as DecideLinkRow | null;
    if (server && typeof server === 'object' && server.deleted_at) return server;
  }
  throw err;
}

export function useAttachLine(): {
  attach(input: {
    userId: string;
    checkId: string;
    householdId: string;
    entity: 'transactions' | 'recurring_series' | 'debts';
    targetId: string;
    decidedAt: string;
    lineDate: string;
  }): string;
} {
  const mutation = useMutation<DecideLinkRow, unknown, AttachLineVars>({
    mutationKey: mutationKeys.attachLine,
    scope: WRITE_SCOPE,
  });
  return {
    attach(input) {
      const id = Crypto.randomUUID();
      // Part 2 (D-36, A17): a line gets its role from its date; there is no input for it.
      const role = input.entity === 'transactions' ? attachRoleFor(input.decidedAt, input.lineDate) : null;
      mutation.mutate({
        userId: input.userId,
        id,
        householdId: input.householdId,
        checkId: input.checkId,
        entity: input.entity,
        targetId: input.targetId,
        role,
      });
      return id;
    },
  };
}

export function useUnlinkLine(): { unlink(link: DecideLinkRow, name: string): string } {
  const mutation = useMutation<DecideLinkRow, unknown, UnlinkLineVars>({
    mutationKey: mutationKeys.editLink,
    scope: WRITE_SCOPE,
  });
  return {
    unlink(link, name) {
      const stepId = newStepId();
      mutation.mutate({
        id: link.id,
        ownerId: link.created_by,
        householdId: link.household_id,
        checkId: link.check_id,
        expectedVersion: link.version,
        stepId,
        name,
      });
      return stepId;
    },
  };
}

interface CardInput {
  userId: string;
  householdId: string;
  accountId: string;
  existing: DebtRow | null;
  currency: string;
  accountName: string;
}

/**
 * A card with no record yet may already have one queued (a second save before the first synced): reuse that
 * pending row instead of inserting a second debt for the same card.
 */
function resolveExisting(qc: QueryClient, input: CardInput): { id: string; version: number } | null {
  if (input.existing) return { id: input.existing.id, version: input.existing.version };
  const cached = qc
    .getQueryData<DebtList>(queryKeys.debts(input.householdId))
    ?.find((d) => d.kind === 'card' && d.account_id === input.accountId && d.deleted_at === null);
  return cached ? { id: cached.id, version: cached.version } : null;
}

function debtVars(qc: QueryClient, input: CardInput, patch: DebtPatch): DebtWriteVars {
  return {
    userId: input.userId,
    householdId: input.householdId,
    newId: Crypto.randomUUID(),
    existing: resolveExisting(qc, input),
    accountId: input.accountId,
    accountName: input.accountName,
    currency: input.currency,
    patch,
  };
}

/** 04 D-07: the rate typed in step 2 saves to that card's own debt record, never a default. */
export function useSaveCardRate(): {
  save(input: CardInput & { aprText: string }): void;
} {
  const qc = useQueryClient();
  const mutation = useMutation<DebtRow, unknown, DebtWriteVars>({
    mutationKey: mutationKeys.saveCardRate,
    scope: WRITE_SCOPE,
  });
  return {
    save(input) {
      const apr = input.aprText.trim();
      if (!PERCENT_TEXT_RE.test(apr)) throw new RangeError('card rate is not a percentage');
      mutation.mutate(debtVars(qc, input, { apr }));
    },
  };
}

export interface CardTermsInput {
  percentText: string | null;
  interestAdded: boolean | null;
  floor: number | null;
  paidInFull: boolean;
}

/**
 * D-40: the card's minimum terms and its 'Paid in full monthly' flag, saved from the card terms sheet.
 * All three minimum fields null together is 'Use the standard terms' (the per-market pre-fill applies again).
 */
export function useSaveCardTerms(): {
  save(input: CardInput & { terms: CardTermsInput }): void;
} {
  const qc = useQueryClient();
  const mutation = useMutation<DebtRow, unknown, DebtWriteVars>({
    mutationKey: mutationKeys.saveCardTerms,
    scope: WRITE_SCOPE,
  });
  return {
    save(input) {
      const { terms } = input;
      const percent = terms.percentText === null ? null : terms.percentText.trim();
      if (percent !== null && !PERCENT_TEXT_RE.test(percent)) throw new RangeError('minimum percent is not a percentage');
      if (terms.floor !== null && (!Number.isSafeInteger(terms.floor) || terms.floor < 0)) {
        throw new RangeError('minimum floor is not a whole number of minor units');
      }
      const set = [percent !== null, terms.interestAdded !== null, terms.floor !== null];
      const partial = set.some(Boolean) && !set.every(Boolean);
      if (partial && !terms.paidInFull) throw new RangeError('card terms are all set or all cleared');
      mutation.mutate(
        debtVars(qc, input, {
          min_percent: percent,
          min_interest_added: terms.interestAdded,
          min_floor: terms.floor,
          paid_in_full: terms.paidInFull,
        })
      );
    },
  };
}

/** OQ3: an import that states its period records it. Returns false (and queues nothing) for an unusable period. */
export function useRecordStatementPeriod(): {
  record(input: { householdId: string; accountId: string; start: string; end: string }): boolean;
} {
  const mutation = useMutation<StatementPeriodRow | null, unknown, RecordStatementPeriodVars>({
    mutationKey: mutationKeys.recordStatementPeriod,
    scope: WRITE_SCOPE,
  });
  return {
    record(input) {
      if (input.end < input.start) return false;
      mutation.mutate({ id: Crypto.randomUUID(), ...input });
      return true;
    },
  };
}
