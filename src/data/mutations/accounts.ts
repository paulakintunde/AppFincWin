// SYN-02/MON-08: the same paused-mutation shape as transactions.ts but with no FX --
// accounts never carry a rate.
import * as Crypto from 'expo-crypto';
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { VersionConflictError } from '@/db/errors';
import { insertAccount, updateAccount } from '@/db/accounts';
import type { AccountPatch, AccountRow, DbClient, NewAccount } from '@/db/rows';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import type { WithPending } from '@/data/types';
import { classifyWriteError, shouldRetryWrite, writeRetryDelay } from '@/data/sync/writeErrors';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { recordWrittenVersion, resolveExpectedVersion } from '@/data/sync/versionChain';

export interface AddAccountVars {
  row: NewAccount;
}

export interface EditAccountVars {
  id: string;
  householdId: string;
  expectedVersion: number;
  patch: AccountPatch;
}

type AccountList = WithPending<AccountRow>[];

// See transactions.ts's lazySupabaseClient for why require() replaces the plan's originally
// specified `await import(...)` (Rule 3 -- dynamic import throws under this Jest config).
function lazySupabaseClient(): DbClient {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('@/services/supabase') as typeof import('@/services/supabase')).supabase;
}

function patchAccountsCache(
  qc: QueryClient,
  householdId: string,
  updater: (rows: AccountList) => AccountList
): void {
  qc.setQueryData<AccountList>(queryKeys.accounts(householdId), (old) => updater(old ?? []));
}

function errorCode(err: unknown): string {
  return err instanceof Error && 'code' in err ? String((err as { code: unknown }).code) : '';
}

export function registerAccountMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.addAccount, {
    mutationFn: (vars: AddAccountVars) => insertAccount(lazySupabaseClient(), vars.row),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: AddAccountVars) => {
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
        version: 1,
        created_at: now,
        updated_at: now,
        pending: true,
      };
      patchAccountsCache(qc, vars.row.household_id, (rows) => [...rows, optimisticRow]);
    },
    onSuccess: (row: AccountRow, vars: AddAccountVars) => {
      patchAccountsCache(qc, vars.row.household_id, (rows) => rows.map((r) => (r.id === row.id ? row : r)));
    },
    onError: async (err: unknown, vars: AddAccountVars) => {
      const cls = classifyWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return;
      patchAccountsCache(qc, vars.row.household_id, (rows) => rows.filter((r) => r.id !== vars.row.id));
      await recordFailedWrite({
        entity: 'accounts',
        entityId: vars.row.id,
        kind: cls,
        code: errorCode(err),
        attempted: { ...vars.row },
      });
    },
  });

  qc.setMutationDefaults(mutationKeys.editAccount, {
    mutationFn: async (vars: EditAccountVars) => {
      // CR-A02: an earlier queued edit of this same row may already have bumped its version.
      const expected = resolveExpectedVersion('accounts', vars.id, vars.expectedVersion);
      const row = await updateAccount(lazySupabaseClient(), vars.id, expected, vars.patch);
      recordWrittenVersion('accounts', vars.id, [vars.expectedVersion, expected], row.version);
      return row;
    },
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: EditAccountVars) => {
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
      const cls = classifyWriteError(err);
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
          code: errorCode(err),
          attempted: vars.patch,
        });
      }
    },
  });
}

export function useAddAccount(): { add(input: Omit<NewAccount, 'id'>): string } {
  const mutation = useMutation<AccountRow, unknown, AddAccountVars>({
    mutationKey: mutationKeys.addAccount,
    scope: WRITE_SCOPE,
  });

  return {
    add(input: Omit<NewAccount, 'id'>): string {
      const id = Crypto.randomUUID();
      mutation.mutate({ row: { id, ...input } });
      return id;
    },
  };
}

export function useEditAccount(): { edit(vars: EditAccountVars): void } {
  const mutation = useMutation<AccountRow, unknown, EditAccountVars>({
    mutationKey: mutationKeys.editAccount,
    scope: WRITE_SCOPE,
  });

  return {
    edit(vars: EditAccountVars): void {
      mutation.mutate(vars);
    },
  };
}
