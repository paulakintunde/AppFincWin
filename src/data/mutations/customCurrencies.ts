// MON-04/MON-13/D-07: paused-mutation defaults for adding and hand-editing a custom
// currency, plus the useAddCustomCurrency/useEditCustomCurrency hooks. Validation
// (engine/money's validateCustomCurrency) runs before mutate() ever fires, so an invalid
// input never reaches the write queue at all.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import {
  formatRate,
  parseDecimalString,
  parseRate,
  RATE_SCALE,
  validateCustomCurrency,
  type CustomCurrencyError,
  type CustomCurrencyInput,
  type ValidateCustomCurrencyContext,
} from '@/engine/money';
import { insertCustomCurrency, updateCustomCurrency, type CustomCurrencyPatch, type NewCustomCurrency } from '@/db/customCurrencies';
import { VersionConflictError } from '@/db/errors';
import type { CustomCurrencyRow } from '@/db/rows';
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
import { recordWrittenVersion, resolveExpectedVersion } from '@/data/sync/versionChain';
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

// WR-A01: writes go through ./writeClient (lazy require + session check).

function patchCustomCurrenciesCache(
  qc: QueryClient,
  userId: string,
  updater: (rows: CustomCurrencyList) => CustomCurrencyList
): void {
  qc.setQueryData<CustomCurrencyList>(queryKeys.customCurrencies(userId), (old) => updater(old ?? []));
}

export function registerCustomCurrencyMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.addCustomCurrency, {
    mutationFn: async (vars: AddCustomCurrencyVars) => insertCustomCurrency(await writeClient(), vars.row),
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
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return; // an insert never conflicts; a duplicate-id insert already resolved to success in db/
      patchCustomCurrenciesCache(qc, vars.userId, (rows) => rows.filter((r) => r.id !== vars.row.id));
      await recordFailedWrite({
        entity: 'custom_currencies',
        entityId: vars.row.id,
        kind: cls,
        code: settledWriteErrorCode(err),
        attempted: { ...vars.row },
      });
    },
  });

  qc.setMutationDefaults(mutationKeys.editCustomCurrency, {
    mutationFn: async (vars: EditCustomCurrencyVars) => {
      // CR-A02: an earlier queued edit of this same row may already have bumped its version.
      const expected = resolveExpectedVersion('custom_currencies', vars.id, vars.expectedVersion);
      const row = await updateCustomCurrency(await writeClient(), vars.id, expected, vars.patch);
      recordWrittenVersion('custom_currencies', vars.id, [vars.expectedVersion, expected], row.version);
      return row;
    },
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
      const cls = classifySettledWriteError(err);
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
          code: settledWriteErrorCode(err),
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

export type EditCustomCurrencyResult = { ok: true } | { ok: false; errors: CustomCurrencyError[] };

/**
 * WR-A03: normalizes a hand-edited unit value to the same canonical 10-dp string add stores,
 * so a malformed value never reaches the optimistic cache (where the provisional stamp would
 * read it) or the server. With `locale`, the raw text is read region-aware exactly as add
 * reads it; without one it must already be a plain ASCII decimal ('2.5').
 */
function normalizeUnitValue(raw: string, locale: string | undefined): string | null {
  let decimal = raw.trim();
  if (locale !== undefined) {
    const parsed = parseDecimalString(raw, { locale, maxFractionDigits: RATE_SCALE });
    if (!parsed.ok) return null;
    decimal = parsed.value;
  }
  try {
    return formatRate(parseRate(decimal));
  } catch {
    return null;
  }
}

export function useEditCustomCurrency(userId: string): {
  edit(
    vars: { id: string; expectedVersion: number; patch: CustomCurrencyPatch },
    opts?: { locale?: string }
  ): EditCustomCurrencyResult;
} {
  const mutation = useMutation<CustomCurrencyRow, unknown, EditCustomCurrencyVars>({
    mutationKey: mutationKeys.editCustomCurrency,
    scope: WRITE_SCOPE,
  });

  return {
    edit(
      vars: { id: string; expectedVersion: number; patch: CustomCurrencyPatch },
      opts?: { locale?: string }
    ): EditCustomCurrencyResult {
      const patch: CustomCurrencyPatch = { ...vars.patch };
      if (patch.unit_value !== undefined) {
        const unitValue = normalizeUnitValue(patch.unit_value, opts?.locale);
        if (unitValue === null) return { ok: false, errors: ['value-invalid'] };
        patch.unit_value = unitValue;
      }
      mutation.mutate({ ...vars, patch, userId });
      return { ok: true };
    },
  };
}
