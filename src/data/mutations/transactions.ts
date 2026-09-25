// SYN-02/MON-08: paused-mutation defaults for transactions, plus the useAddTransaction/
// useEditTransaction hooks that build a client UUID (MON-08) before mutate() ever runs.
//
// Registering these defaults (rather than passing an inline write function to useMutation)
// is what lets a mutation restored from the persisted cache resume with real code after an
// app restart (Pitfall 3,
// RESEARCH.md) -- registerTransactionMutations must run once, at module scope, before
// PersistQueryClientProvider restores (wired in src/data/QueryProvider.tsx, this plan's
// Task 3).
import * as Crypto from 'expo-crypto';
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { localDateIn, monthOf } from '@/engine/time';
import type { MinorUnits } from '@/engine/money';
import { VersionConflictError } from '@/db/errors';
import { insertTransaction, requestRateResolution, updateTransaction } from '@/db/transactions';
import type { CustomCurrencyRow, DbClient, FxLatestRow, NewTransaction, TransactionPatch, TransactionRow } from '@/db/rows';
import { getDeviceTimeZone } from '@/services/locale/deviceLocale';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import type { WithPending } from '@/data/types';
import { classifyWriteError, shouldRetryWrite, writeRetryDelay } from '@/data/sync/writeErrors';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { recordWrittenVersion, resolveExpectedVersion } from '@/data/sync/versionChain';
import { provisionalStamp } from './provisional';

export interface AddTransactionVars {
  row: NewTransaction;
  optimistic: { homeCurrency: string; createdBy: string; month: string };
}

export interface EditTransactionVars {
  id: string;
  householdId: string;
  month: string;
  expectedVersion: number;
  patch: TransactionPatch;
  homeCurrency: string;
}

type TransactionList = WithPending<TransactionRow>[];

// Deviation (Rule 3 - blocking): the plan specifies a lazy `await import('@/services/supabase')`
// inside the write function (mirroring 00-10's checkConnection pattern), so importing this
// module in tests or before env is ready never triggers services/supabase's eager getEnv()
// call. Under this project's Jest config (CommonJS transform, no --experimental-vm-modules),
// a dynamic `import()` call throws "A dynamic import callback was invoked without
// --experimental-vm-modules" the moment it actually runs -- unlike connection.ts's identical
// pattern, this plan's own tests genuinely exercise the lazy-load path (the write function
// always runs), so the bug surfaces here where it stayed latent there. `require()` is exactly
// as lazy (evaluated at call time, not module load) and is fully supported by both Jest and
// Metro (which compiles `import` to `require` under the hood anyway).
function lazySupabaseClient(): DbClient {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('@/services/supabase') as typeof import('@/services/supabase')).supabase;
}

function patchMonthCache(
  qc: QueryClient,
  householdId: string,
  month: string,
  updater: (rows: TransactionList) => TransactionList
): void {
  qc.setQueryData<TransactionList>(queryKeys.transactionsMonth(householdId, month), (old) => updater(old ?? []));
}

/** After a write comes back rate_pending, calls resolve-rate and writes the restamped row in. */
async function followUpIfRatePending(qc: QueryClient, householdId: string, month: string, row: TransactionRow): Promise<void> {
  if (!row.rate_pending) return;
  try {
    const resolved = await requestRateResolution(lazySupabaseClient(), row.id);
    if (resolved) {
      patchMonthCache(qc, householdId, month, (rows) => rows.map((r) => (r.id === resolved.id ? resolved : r)));
    }
  } catch {
    // Network/function failure: the row stays rate_pending; fx-monitor reports stuck rows.
  }
}

function errorCode(err: unknown): string {
  return err instanceof Error && 'code' in err ? String((err as { code: unknown }).code) : '';
}

export function registerTransactionMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.addTransaction, {
    mutationFn: (vars: AddTransactionVars) => insertTransaction(lazySupabaseClient(), vars.row),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: AddTransactionVars) => {
      const monthKey = queryKeys.transactionsMonth(vars.row.household_id, vars.optimistic.month);
      await qc.cancelQueries({ queryKey: monthKey });

      const rates = qc.getQueryData<FxLatestRow[]>(queryKeys.fxLatest()) ?? [];
      const customs = qc.getQueryData<CustomCurrencyRow[]>(queryKeys.customCurrencies(vars.optimistic.createdBy)) ?? [];
      const stamp = provisionalStamp(
        {
          amount: vars.row.original_amount,
          currency: vars.row.original_currency,
          homeCurrency: vars.optimistic.homeCurrency,
        },
        rates,
        customs
      );
      const now = new Date().toISOString();
      const optimisticRow: WithPending<TransactionRow> = {
        id: vars.row.id,
        household_id: vars.row.household_id,
        account_id: vars.row.account_id,
        created_by: vars.optimistic.createdBy,
        original_amount: vars.row.original_amount,
        original_currency: vars.row.original_currency,
        home_currency: vars.optimistic.homeCurrency,
        home_amount: stamp.home_amount,
        rate: stamp.rate,
        orig_per_eur: stamp.orig_per_eur,
        home_per_eur: stamp.home_per_eur,
        rate_date: stamp.rate_date,
        rate_source: stamp.rate_source,
        rate_pending: stamp.rate_pending,
        local_date: vars.row.local_date,
        time_zone: vars.row.time_zone,
        note: vars.row.note,
        version: 1,
        created_at: now,
        updated_at: now,
        pending: true,
      };
      patchMonthCache(qc, vars.row.household_id, vars.optimistic.month, (rows) => [optimisticRow, ...rows]);
    },
    onSuccess: async (row: TransactionRow, vars: AddTransactionVars) => {
      patchMonthCache(qc, vars.row.household_id, vars.optimistic.month, (rows) =>
        rows.map((r) => (r.id === row.id ? row : r))
      );
      await followUpIfRatePending(qc, vars.row.household_id, vars.optimistic.month, row);
    },
    onError: async (err: unknown, vars: AddTransactionVars) => {
      const cls = classifyWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return; // transient retries; already-applied is a success path
      patchMonthCache(qc, vars.row.household_id, vars.optimistic.month, (rows) =>
        rows.filter((r) => r.id !== vars.row.id)
      );
      await recordFailedWrite({
        entity: 'transactions',
        entityId: vars.row.id,
        kind: cls,
        code: errorCode(err),
        attempted: { ...vars.row },
      });
    },
  });

  qc.setMutationDefaults(mutationKeys.editTransaction, {
    mutationFn: async (vars: EditTransactionVars) => {
      // CR-A02: an earlier queued edit of this same row may already have bumped its version.
      const expected = resolveExpectedVersion('transactions', vars.id, vars.expectedVersion);
      const row = await updateTransaction(lazySupabaseClient(), vars.id, expected, vars.patch);
      recordWrittenVersion('transactions', vars.id, [vars.expectedVersion, expected], row.version);
      return row;
    },
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: EditTransactionVars) => {
      const monthKey = queryKeys.transactionsMonth(vars.householdId, vars.month);
      await qc.cancelQueries({ queryKey: monthKey });

      const recomputesRate =
        vars.patch.original_amount !== undefined ||
        vars.patch.original_currency !== undefined ||
        vars.patch.local_date !== undefined;

      patchMonthCache(qc, vars.householdId, vars.month, (rows) =>
        rows.map((r) => {
          if (r.id !== vars.id) return r;
          const patched: WithPending<TransactionRow> = { ...r, ...vars.patch, pending: true };
          if (!recomputesRate) return patched;

          const rates = qc.getQueryData<FxLatestRow[]>(queryKeys.fxLatest()) ?? [];
          const customs = qc.getQueryData<CustomCurrencyRow[]>(queryKeys.customCurrencies(r.created_by ?? '')) ?? [];
          const stamp = provisionalStamp(
            {
              amount: patched.original_amount,
              currency: patched.original_currency,
              homeCurrency: vars.homeCurrency,
            },
            rates,
            customs
          );
          return { ...patched, ...stamp };
        })
      );
    },
    onSuccess: async (row: TransactionRow, vars: EditTransactionVars) => {
      patchMonthCache(qc, vars.householdId, vars.month, (rows) => rows.map((r) => (r.id === row.id ? row : r)));
      await followUpIfRatePending(qc, vars.householdId, vars.month, row);
    },
    onError: async (err: unknown, vars: EditTransactionVars) => {
      const cls = classifyWriteError(err);
      if (cls === 'conflict' && err instanceof VersionConflictError) {
        const serverRow = err.serverRow as TransactionRow;
        patchMonthCache(qc, vars.householdId, vars.month, (rows) => rows.map((r) => (r.id === vars.id ? serverRow : r)));
        await qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(vars.householdId) });
        await recordFailedWrite({
          entity: 'transactions',
          entityId: vars.id,
          kind: 'conflict',
          code: 'version-conflict',
          attempted: vars.patch,
        });
        return;
      }
      if (cls === 'rejected' || cls === 'not-found') {
        await qc.invalidateQueries({ queryKey: queryKeys.transactionsMonth(vars.householdId, vars.month) });
        await recordFailedWrite({
          entity: 'transactions',
          entityId: vars.id,
          kind: cls,
          code: errorCode(err),
          attempted: vars.patch,
        });
      }
    },
  });
}

export interface AddTransactionInput {
  householdId: string;
  accountId: string;
  amount: MinorUnits;
  currency: string;
  homeCurrency: string;
  userId: string;
  note?: string | null;
  localDate?: string;
  timeZone?: string;
}

export function useAddTransaction(): { add(input: AddTransactionInput): string } {
  const mutation = useMutation<TransactionRow, unknown, AddTransactionVars>({
    mutationKey: mutationKeys.addTransaction,
    scope: WRITE_SCOPE,
  });

  return {
    add(input: AddTransactionInput): string {
      const id = Crypto.randomUUID();
      const timeZone = input.timeZone ?? getDeviceTimeZone();
      const localDate = input.localDate ?? localDateIn(new Date(), timeZone);
      const month = monthOf(localDate);

      const row: NewTransaction = {
        id,
        household_id: input.householdId,
        account_id: input.accountId,
        original_amount: input.amount,
        original_currency: input.currency,
        local_date: localDate,
        time_zone: timeZone,
        note: input.note ?? null,
      };

      mutation.mutate({ row, optimistic: { homeCurrency: input.homeCurrency, createdBy: input.userId, month } });
      return id;
    },
  };
}

export function useEditTransaction(): { edit(vars: EditTransactionVars): void } {
  const mutation = useMutation<TransactionRow, unknown, EditTransactionVars>({
    mutationKey: mutationKeys.editTransaction,
    scope: WRITE_SCOPE,
  });

  return {
    edit(vars: EditTransactionVars): void {
      mutation.mutate(vars);
    },
  };
}
