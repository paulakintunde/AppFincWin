// MON-04/MON-13/D-07: paused-mutation defaults for adding and hand-editing a custom
// currency, plus the useAddCustomCurrency/useEditCustomCurrency hooks. Validation
// (engine/money's validateCustomCurrency) runs before mutate() ever fires, so an invalid
// input never reaches the write queue at all.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import {
  validateCustomCurrency,
  type CustomCurrencyError,
  type CustomCurrencyInput,
  type ValidateCustomCurrencyContext,
} from '@/engine/money';
import { insertCustomCurrency, updateCustomCurrency, type CustomCurrencyPatch, type NewCustomCurrency } from '@/db/customCurrencies';
import { VersionConflictError } from '@/db/errors';
import type { CustomCurrencyRow, DbClient } from '@/db/rows';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import type { WithPending } from '@/data/types';
import { classifyWriteError, shouldRetryWrite, writeRetryDelay } from '@/data/sync/writeErrors';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { useCurrencyOptions } from '@/data/queries/currencyOptions';

export interface AddCustomCurrencyVars {
  userId: string;
  row: NewCustomCurrency;
}

export interface EditCustomCurrencyVars {
  id: string;
  userId: string;
  expectedVersion: number;
  patch: CustomCurrencyPatch;
}

type CustomCurrencyList = WithPending<CustomCurrencyRow>[];

// See transactions.ts's lazySupabaseClient for why require() (not the plan-literal
// `await import(...)`) is used here -- dynamic import() throws under this project's Jest
// config the moment it actually runs (01-12 Deviation 1).
function lazySupabaseClient(): DbClient {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('@/services/supabase') as typeof import('@/services/supabase')).supabase;
}

function patchCustomCurrenciesCache(
  qc: QueryClient,
  userId: string,
  updater: (rows: CustomCurrencyList) => CustomCurrencyList
): void {
  qc.setQueryData<CustomCurrencyList>(queryKeys.customCurrencies(userId), (old) => updater(old ?? []));
}

function errorCode(err: unknown): string {
  return err instanceof Error && 'code' in err ? String((err as { code: unknown }).code) : '';
}

export function registerCustomCurrencyMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.addCustomCurrency, {
    mutationFn: (vars: AddCustomCurrencyVars) => insertCustomCurrency(lazySupabaseClient(), vars.row),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: AddCustomCurrencyVars) => {
      const key = queryKeys.customCurrencies(vars.userId);
      await qc.cancelQueries({ queryKey: key });

      const now = new Date().toISOString();
      const optimisticRow: WithPending<CustomCurrencyRow> = {
        id: vars.row.id,
        owner_id: vars.userId,
        code: vars.row.code,
        symbol: vars.row.symbol,
        decimals: vars.row.decimals,
        reference_currency: vars.row.reference_currency,
        unit_value: vars.row.unit_value,
        as_of: vars.row.as_of,
        version: 1,
        created_at: now,
        updated_at: now,
        pending: true,
      };
      patchCustomCurrenciesCache(qc, vars.userId, (rows) => [...rows, optimisticRow]);
    },
    onSuccess: (row: CustomCurrencyRow, vars: AddCustomCurrencyVars) => {
      patchCustomCurrenciesCache(qc, vars.userId, (rows) => rows.map((r) => (r.id === row.id ? row : r)));
    },
    onError: async (err: unknown, vars: AddCustomCurrencyVars) => {
      const cls = classifyWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return; // transient retries; already-applied is a success path
      patchCustomCurrenciesCache(qc, vars.userId, (rows) => rows.filter((r) => r.id !== vars.row.id));
      await recordFailedWrite({
        entity: 'custom_currencies',
        entityId: vars.row.id,
        kind: cls,
        code: errorCode(err),
        attempted: { ...vars.row },
      });
    },
  });

  qc.setMutationDefaults(mutationKeys.editCustomCurrency, {
    mutationFn: (vars: EditCustomCurrencyVars) =>
      updateCustomCurrency(lazySupabaseClient(), vars.id, vars.expectedVersion, vars.patch),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: EditCustomCurrencyVars) => {
      const key = queryKeys.customCurrencies(vars.userId);
      await qc.cancelQueries({ queryKey: key });
      patchCustomCurrenciesCache(qc, vars.userId, (rows) =>
        rows.map((r) => (r.id === vars.id ? { ...r, ...vars.patch, pending: true } : r))
      );
    },
    onSuccess: (row: CustomCurrencyRow, vars: EditCustomCurrencyVars) => {
      patchCustomCurrenciesCache(qc, vars.userId, (rows) => rows.map((r) => (r.id === row.id ? row : r)));
    },
    onError: async (err: unknown, vars: EditCustomCurrencyVars) => {
      const cls = classifyWriteError(err);
      if (cls === 'conflict' && err instanceof VersionConflictError) {
        const serverRow = err.serverRow as CustomCurrencyRow;
        patchCustomCurrenciesCache(qc, vars.userId, (rows) => rows.map((r) => (r.id === vars.id ? serverRow : r)));
        await recordFailedWrite({
          entity: 'custom_currencies',
          entityId: vars.id,
          kind: 'conflict',
          code: 'version-conflict',
          attempted: vars.patch,
        });
        return;
      }
      if (cls === 'rejected' || cls === 'not-found') {
        await qc.invalidateQueries({ queryKey: queryKeys.customCurrencies(vars.userId) });
        await recordFailedWrite({
          entity: 'custom_currencies',
          entityId: vars.id,
          kind: cls,
          code: errorCode(err),
          attempted: vars.patch,
        });
      }
    },
  });
}

export type AddCustomCurrencyResult = { ok: true; id: string } | { ok: false; errors: CustomCurrencyError[] };

export function useAddCustomCurrency(userId: string): {
  add(input: CustomCurrencyInput, ctx?: Partial<ValidateCustomCurrencyContext>): AddCustomCurrencyResult;
} {
  const mutation = useMutation<CustomCurrencyRow, unknown, AddCustomCurrencyVars>({
    mutationKey: mutationKeys.addCustomCurrency,
    scope: WRITE_SCOPE,
  });
  const { options } = useCurrencyOptions(userId);
  const queryClient = useQueryClient();

  return {
    add(input: CustomCurrencyInput, ctx?: Partial<ValidateCustomCurrencyContext>): AddCustomCurrencyResult {
      const isoCodes = ctx?.isoCodes ?? new Set(options.filter((o) => o.kind === 'iso').map((o) => o.code));
      const existingCustomCodes =
        ctx?.existingCustomCodes ??
        new Set(
          (queryClient.getQueryData<CustomCurrencyRow[]>(queryKeys.customCurrencies(userId)) ?? []).map((c) => c.code)
        );

      const result = validateCustomCurrency(input, { isoCodes, existingCustomCodes });
      if (!result.ok) {
        return { ok: false, errors: result.errors };
      }

      const id = Crypto.randomUUID();
      const row: NewCustomCurrency = {
        id,
        code: result.value.code,
        symbol: result.value.symbol,
        decimals: result.value.decimals,
        reference_currency: result.value.referenceCurrency,
        unit_value: result.value.unitValue,
        as_of: new Date().toISOString().slice(0, 10),
      };
      mutation.mutate({ userId, row });
      return { ok: true, id };
    },
  };
}

export function useEditCustomCurrency(userId: string): {
  edit(vars: { id: string; expectedVersion: number; patch: CustomCurrencyPatch }): void;
} {
  const mutation = useMutation<CustomCurrencyRow, unknown, EditCustomCurrencyVars>({
    mutationKey: mutationKeys.editCustomCurrency,
    scope: WRITE_SCOPE,
  });

  return {
    edit(vars: { id: string; expectedVersion: number; patch: CustomCurrencyPatch }): void {
      mutation.mutate({ ...vars, userId });
    },
  };
}
