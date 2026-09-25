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
import {
  classifySettledWriteError,
  settledWriteErrorCode,
  shouldRetryWrite,
  writeRetryDelay,
} from '@/data/sync/writeErrors';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { writeClient } from './writeClient';
import { upsertRow } from './cacheRows';
import { recordWrittenVersion, resolveExpectedVersion } from '@/data/sync/versionChain';
import { editStamp, provisionalStamp } from './provisional';

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
  /**
   * @deprecated Ignored. WR-A06/D-05: an edit's optimistic stamp uses the row's own
   * `home_currency` (the server pins it on update), never the current preference. Kept
   * optional so existing callers still type-check.
   */
  homeCurrency?: string;
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

function patchMonthCacheIfLoaded(
  qc: QueryClient,
  householdId: string,
  month: string,
  updater: (rows: TransactionList) => TransactionList
): void {
  // Never creates a month list that was not loaded: a one-row list would pass for the whole
  // month (status success, fresh dataUpdatedAt) and show wrong totals.
  if (qc.getQueryData<TransactionList>(queryKeys.transactionsMonth(householdId, month)) === undefined) return;
  patchMonthCache(qc, householdId, month, updater);
}

/** The month an edit leaves the row in: the patched local_date's month, else the original. */
function targetMonth(vars: EditTransactionVars): string {
  return vars.patch.local_date !== undefined ? monthOf(vars.patch.local_date) : vars.month;
}

/**
 * WR-A05: puts `row` into the month its own local_date belongs to (replacing it in place if
 * it is already there) and removes it from every other month in `fromMonths`. An edit that
 * moves a transaction's date across a month boundary would otherwise leave it in the old
 * month's list and missing from the new one, so both months' totals are wrong.
 */
function placeRowInMonth(
  qc: QueryClient,
  householdId: string,
  row: WithPending<TransactionRow>,
  fromMonths: readonly string[]
): void {
  const month = monthOf(row.local_date);
  for (const from of new Set(fromMonths)) {
    if (from !== month) patchMonthCacheIfLoaded(qc, householdId, from, (rows) => rows.filter((r) => r.id !== row.id));
  }
  patchMonthCacheIfLoaded(qc, householdId, month, (rows) => upsertRow(rows, row, 'start'));
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

export function registerTransactionMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.addTransaction, {
    mutationFn: async (vars: AddTransactionVars) => insertTransaction(await writeClient(), vars.row),
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
      // WR-A04: upsert, not replace -- a refetch may have dropped the optimistic row.
      patchMonthCache(qc, vars.row.household_id, vars.optimistic.month, (rows) => upsertRow(rows, row, 'start'));
      await followUpIfRatePending(qc, vars.row.household_id, vars.optimistic.month, row);
    },
    onError: async (err: unknown, vars: AddTransactionVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return; // an insert never conflicts; a duplicate-id insert already resolved to success in db/
      patchMonthCache(qc, vars.row.household_id, vars.optimistic.month, (rows) =>
        rows.filter((r) => r.id !== vars.row.id)
      );
      await recordFailedWrite({
        entity: 'transactions',
        entityId: vars.row.id,
        kind: cls,
        code: settledWriteErrorCode(err),
        attempted: { ...vars.row },
      });
    },
  });

  qc.setMutationDefaults(mutationKeys.editTransaction, {
    mutationFn: async (vars: EditTransactionVars) => {
      // CR-A02: an earlier queued edit of this same row may already have bumped its version.
      const expected = resolveExpectedVersion('transactions', vars.id, vars.expectedVersion);
      const row = await updateTransaction(await writeClient(), vars.id, expected, vars.patch);
      recordWrittenVersion('transactions', vars.id, [vars.expectedVersion, expected], row.version);
      return row;
    },
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: EditTransactionVars) => {
      const toMonth = targetMonth(vars);
      await qc.cancelQueries({ queryKey: queryKeys.transactionsMonth(vars.householdId, vars.month) });
      if (toMonth !== vars.month) {
        await qc.cancelQueries({ queryKey: queryKeys.transactionsMonth(vars.householdId, toMonth) });
      }

      const current = qc
        .getQueryData<TransactionList>(queryKeys.transactionsMonth(vars.householdId, vars.month))
        ?.find((r) => r.id === vars.id);
      if (!current) return;

      // WR-A06: mirror the server's D-04/D-05 rules (keep the row's own home currency; an
      // amount-only edit keeps the stored rate) instead of re-rating at today's rate.
      const rates = qc.getQueryData<FxLatestRow[]>(queryKeys.fxLatest()) ?? [];
      const customs = qc.getQueryData<CustomCurrencyRow[]>(queryKeys.customCurrencies(current.created_by ?? '')) ?? [];
      const stamp = editStamp(current, vars.patch, rates, customs);
      const patched: WithPending<TransactionRow> = { ...current, ...vars.patch, ...stamp, pending: true };
      placeRowInMonth(qc, vars.householdId, patched, [vars.month]);
    },
    onSuccess: async (row: TransactionRow, vars: EditTransactionVars) => {
      const toMonth = targetMonth(vars);
      placeRowInMonth(qc, vars.householdId, row, [vars.month, toMonth]);
      if (toMonth !== vars.month || monthOf(row.local_date) !== toMonth) {
        // WR-A05: the row changed months; refetch both so their totals come from the server.
        await qc.invalidateQueries({ queryKey: queryKeys.transactionsMonth(vars.householdId, vars.month) });
        await qc.invalidateQueries({ queryKey: queryKeys.transactionsMonth(vars.householdId, monthOf(row.local_date)) });
      }
      await followUpIfRatePending(qc, vars.householdId, monthOf(row.local_date), row);
    },
    onError: async (err: unknown, vars: EditTransactionVars) => {
      const cls = classifySettledWriteError(err);
      if (cls === 'conflict' && err instanceof VersionConflictError) {
        const serverRow = err.serverRow as TransactionRow;
        placeRowInMonth(qc, vars.householdId, serverRow, [vars.month, targetMonth(vars)]);
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
        if (targetMonth(vars) !== vars.month) {
          await qc.invalidateQueries({ queryKey: queryKeys.transactionsMonth(vars.householdId, targetMonth(vars)) });
        }
        await recordFailedWrite({
          entity: 'transactions',
          entityId: vars.id,
          kind: cls,
          code: settledWriteErrorCode(err),
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
