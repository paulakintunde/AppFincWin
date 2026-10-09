// SYN-02/MON-08: the same paused-mutation shape as transactions.ts but with no FX --
// accounts never carry a rate.
import * as Crypto from 'expo-crypto';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { VersionConflictError } from '@/db/errors';
import { insertAccount, updateAccount } from '@/db/accounts';
import type { AccountPatch, AccountRow, NewAccount } from '@/db/rows';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import type { WithPending } from '@/data/types';
import {
  classifySettledWriteError,
  settledWriteErrorCode,
  shouldRetryWrite,
  writeRetryDelay,
} from '@/data/sync/writeErrors';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { writeClient } from './writeClient';
import { guardSession, markSession } from '@/data/sync/sessionEpoch';
import { acceptIfAlreadyApplied, upsertRow } from './cacheRows';
import { recordWrittenVersion, resolveExpectedVersion } from '@/data/sync/versionChain';
import { buildStep, inverseOfInserts, inverseOfPatches, type PatchValue } from '@/engine/undo';
import { recordUndoStepSafely } from './undoCapture';
import { runAccountRateCheck } from './accountRateChecks';

/** REC-11: the caller-minted step id and owner; the label is fixed by the action. */
export interface AccountUndo {
  stepId: string;
  ownerId: string;
}

/** 02-DECISION-fx-on-demand.md item 3b: set for a foreign-currency account; carried in the persisted vars. */
export interface AccountRateCheckRequest {
  homeCurrency: string;
  openingDate: string;
  userId: string;
}

export interface AddAccountVars {
  row: NewAccount;
  undo?: AccountUndo;
  rateCheck?: AccountRateCheckRequest;
}

export interface EditAccountVars {
  id: string;
  householdId: string;
  expectedVersion: number;
  patch: AccountPatch;
  /** Set by useEditAccount's wrapper, which captures `before` itself. */
  undo?: AccountUndo & { name: string; before: Readonly<Record<string, PatchValue>> };
}

type AccountList = WithPending<AccountRow>[];

// WR-A01: writes go through ./writeClient (lazy require + session check).

function patchAccountsCache(
  qc: QueryClient,
  householdId: string,
  updater: (rows: AccountList) => AccountList
): void {
  qc.setQueryData<AccountList>(queryKeys.accounts(householdId), (old) => updater(old ?? []));
}

export function registerAccountMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.addAccount, {
    mutationFn: (vars: AddAccountVars) =>
      guardSession(vars, async () => {
        const client = await writeClient();
        const row = await insertAccount(client, vars.row);
        if (vars.undo) {
          const step = buildStep(
            vars.undo.stepId,
            'accountAdded',
            { name: row.name },
            inverseOfInserts('accounts', [{ id: row.id, version: row.version }])
          );
          await recordUndoStepSafely(qc, client, step, vars.undo.ownerId);
        }
        return row;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: AddAccountVars) => {
      markSession(vars); // WR-A09
      const key = queryKeys.accounts(vars.row.household_id);
      await qc.cancelQueries({ queryKey: key });

      const now = new Date().toISOString();
      const optimisticRow: WithPending<AccountRow> = {
        id: vars.row.id,
        household_id: vars.row.household_id,
        created_by: null,
        name: vars.row.name,
        kind: vars.row.kind,
        currency: vars.row.currency,
        opening_balance: vars.row.opening_balance,
        archived_at: null,
        updated_by: null,
        overdraft_limit: vars.row.overdraft_limit ?? null,
        credit_limit: vars.row.credit_limit ?? null,
        deleted_at: null,
        is_sample: false,
        version: 1,
        created_at: now,
        updated_at: now,
        pending: true,
      };
      patchAccountsCache(qc, vars.row.household_id, (rows) => [...rows, optimisticRow]);
    },
    onSuccess: (row: AccountRow, vars: AddAccountVars) => {
      // WR-A04: upsert, not replace -- a refetch may have dropped the optimistic row.
      patchAccountsCache(qc, vars.row.household_id, (rows) => upsertRow(rows, row, 'end'));
      // Item 3b: the insert succeeded (online, or after an offline flush); ask for the opening date's rate.
      if (vars.rateCheck) void runAccountRateCheck(qc, { ...vars.rateCheck, accountId: row.id, currency: row.currency });
    },
    onError: async (err: unknown, vars: AddAccountVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return;
      patchAccountsCache(qc, vars.row.household_id, (rows) => rows.filter((r) => r.id !== vars.row.id));
      await recordFailedWrite({
        entity: 'accounts',
        entityId: vars.row.id,
        kind: cls,
        code: settledWriteErrorCode(err),
        attempted: { ...vars.row },
      });
    },
  });

  qc.setMutationDefaults(mutationKeys.editAccount, {
    mutationFn: (vars: EditAccountVars) =>
      guardSession(vars, async () => {
        // CR-A02: an earlier queued edit of this same row may already have bumped its version.
        const expected = resolveExpectedVersion('accounts', vars.id, vars.expectedVersion);
        const client = await writeClient();
        // WR-A13: a replayed edit that already landed resolves as applied, not a conflict.
        const row = await updateAccount(client, vars.id, expected, vars.patch).catch((err: unknown) =>
          acceptIfAlreadyApplied<AccountRow>(err, vars.patch)
        );
        recordWrittenVersion('accounts', vars.id, [vars.expectedVersion, expected], row.version);
        if (vars.undo) {
          const step = buildStep(
            vars.undo.stepId,
            'accountEdited',
            { name: vars.undo.name },
            inverseOfPatches('accounts', [{ id: row.id, before: vars.undo.before, versionAfter: row.version }])
          );
          await recordUndoStepSafely(qc, client, step, vars.undo.ownerId);
        }
        return row;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: EditAccountVars) => {
      markSession(vars); // WR-A09
      const key = queryKeys.accounts(vars.householdId);
      await qc.cancelQueries({ queryKey: key });
      patchAccountsCache(qc, vars.householdId, (rows) =>
        rows.map((r) => (r.id === vars.id ? { ...r, ...vars.patch, pending: true } : r))
      );
    },
    onSuccess: (row: AccountRow, vars: EditAccountVars) => {
      patchAccountsCache(qc, vars.householdId, (rows) => rows.map((r) => (r.id === row.id ? row : r)));
    },
    onError: async (err: unknown, vars: EditAccountVars) => {
      const cls = classifySettledWriteError(err);
      if (cls === 'conflict' && err instanceof VersionConflictError) {
        const serverRow = err.serverRow as AccountRow;
        patchAccountsCache(qc, vars.householdId, (rows) => rows.map((r) => (r.id === vars.id ? serverRow : r)));
        await recordFailedWrite({
          entity: 'accounts',
          entityId: vars.id,
          kind: 'conflict',
          code: 'version-conflict',
          attempted: vars.patch,
        });
        return;
      }
      if (cls === 'rejected' || cls === 'not-found') {
        await qc.invalidateQueries({ queryKey: queryKeys.accounts(vars.householdId) });
        await recordFailedWrite({
          entity: 'accounts',
          entityId: vars.id,
          kind: cls,
          code: settledWriteErrorCode(err),
          attempted: vars.patch,
        });
      }
    },
  });
}

/** D-48: a limit is null (none) or a non-negative safe integer in minor units; the DB check is the backstop. */
function assertLimit(label: string, value: number | null | undefined): void {
  if (value === undefined || value === null) return;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be null or a non-negative safe integer, got ${value}`);
  }
}

export function useAddAccount(): {
  add(input: Omit<NewAccount, 'id'>, undo?: AccountUndo, rateCheck?: AccountRateCheckRequest): string;
} {
  const mutation = useMutation<AccountRow, unknown, AddAccountVars>({
    mutationKey: mutationKeys.addAccount,
    scope: WRITE_SCOPE,
  });

  return {
    add(input: Omit<NewAccount, 'id'>, undo?: AccountUndo, rateCheck?: AccountRateCheckRequest): string {
      assertLimit('overdraft_limit', input.overdraft_limit);
      assertLimit('credit_limit', input.credit_limit);
      const id = Crypto.randomUUID();
      const foreign = rateCheck !== undefined && input.currency !== rateCheck.homeCurrency;
      mutation.mutate({ row: { id, ...input }, ...(undo ? { undo } : {}), ...(foreign ? { rateCheck } : {}) });
      return id;
    },
  };
}

export function useEditAccount(): {
  /** Returns whether an undo step will be recorded (false when none was asked for, or the account is not cached). */
  edit(vars: EditAccountVars, undo?: AccountUndo): boolean;
} {
  const mutation = useMutation<AccountRow, unknown, EditAccountVars>({
    mutationKey: mutationKeys.editAccount,
    scope: WRITE_SCOPE,
  });
  const qc = useQueryClient();

  return {
    edit(vars: EditAccountVars, undo?: AccountUndo): boolean {
      assertLimit('overdraft_limit', vars.patch.overdraft_limit);
      assertLimit('credit_limit', vars.patch.credit_limit);
      if (!undo) {
        mutation.mutate(vars);
        return false;
      }
      // REC-11: before-state is read now, for exactly the keys this edit patches.
      const current = qc.getQueryData<AccountList>(queryKeys.accounts(vars.householdId))?.find((r) => r.id === vars.id);
      if (!current) {
        // Nothing honest to capture a before-state from: send without a step rather than guess.
        mutation.mutate(vars);
        return false;
      }
      const source = current as unknown as Record<string, PatchValue | undefined>;
      const before: Record<string, PatchValue> = {};
      for (const key of Object.keys(vars.patch)) before[key] = source[key] ?? null;
      mutation.mutate({ ...vars, undo: { ...undo, name: vars.patch.name ?? current.name, before } });
      return true;
    },
  };
}

