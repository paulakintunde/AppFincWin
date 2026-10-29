// 05-122 (D-103, R18.4): the housing marker on a loan. A paused-mutation write, version-conditional with the undo
// step id as the replay key, optimistic on the debts cache so the hero and the Lines value change at once. One undo
// step (apply_patches, entity debts, label debtHousingChanged). A version conflict is parked in the failed-writes
// list ("edit changed on another device"). Cards are never housing (the guard forces the flag off for them).
import * as Crypto from 'expo-crypto';
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { buildStep, inverseOfInserts, inverseOfPatches, type PatchValue } from '@/engine/undo';
import { VersionConflictError } from '@/db/errors';
import { insertDebt, updateDebt, type DebtPatch, type DebtRow, type NewDebt } from '@/db/debts';
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
import { writeClient } from './writeClient';
import { localDateIn } from '@/engine/time';
import { getDeviceTimeZone } from '@/services/locale/deviceLocale';
import { acceptIfAlreadyApplied, upsertRow } from './cacheRows';
import { newStepId, recordUndoStepSafely } from './undoCapture';

type DebtList = WithPending<DebtRow>[];

export interface SetDebtHousingVars {
  id: string;
  ownerId: string;
  householdId: string;
  expectedVersion: number;
  isHousing: boolean;
  before: boolean;
  stepId: string;
}

export type PaysInFull = 'yes' | 'sometimes' | 'no' | null;

export interface SetDebtPaysInFullVars {
  id: string;
  ownerId: string;
  householdId: string;
  expectedVersion: number;
  value: PaysInFull;
  before: PaysInFull;
  /** The Undo wording for setupStepSaved ({{name}}), supplied by the caller from i18n. */
  stepTitle: string | null;
  stepId: string;
}

/** 05.2-43: the fields the loan and card sheet may change on an existing debt. */
export type EditableDebtPatch = Pick<DebtPatch, 'name' | 'balance' | 'apr' | 'minimum_payment' | 'pays_in_full'>;
const EDITABLE_KEYS = ['name', 'balance', 'apr', 'minimum_payment', 'pays_in_full'] as const;
const MAX_MINOR = 10_000_000_000_000;

export interface AddDebtVars {
  ownerId: string;
  householdId: string;
  row: NewDebt;
  stepId: string;
}

export interface EditDebtVars {
  id: string;
  ownerId: string;
  householdId: string;
  expectedVersion: number;
  patch: EditableDebtPatch;
  before: Record<string, PatchValue>;
  /** The name shown in the Undo wording. */
  name: string;
  stepId: string;
}

export interface SetDebtPaidOffVars {
  id: string;
  ownerId: string;
  householdId: string;
  expectedVersion: number;
  date: string;
  name: string;
  stepId: string;
}

function validName(name: string): boolean {
  const n = name.trim();
  return n.length >= 1 && n.length <= 80;
}
function validMinor(n: number): boolean {
  return Number.isSafeInteger(n) && n >= 0 && n <= MAX_MINOR;
}
function validApr(apr: string | null): boolean {
  if (apr === null) return true;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(apr)) return false;
  return Number(apr) <= 100;
}
function assertDebtFields(f: { name?: string; balance?: number; apr?: string | null; minimum_payment?: number }, where: string): void {
  if (f.name !== undefined && !validName(f.name)) throw new RangeError(`${where}: name must be 1-80 characters`);
  if (f.balance !== undefined && !validMinor(f.balance)) throw new RangeError(`${where}: balance out of range`);
  if (f.minimum_payment !== undefined && !validMinor(f.minimum_payment)) throw new RangeError(`${where}: minimum payment out of range`);
  if (f.apr !== undefined && !validApr(f.apr)) throw new RangeError(`${where}: apr must be 0-100 with at most 2 decimals`);
}

function invalidateDebts(qc: QueryClient, householdId: string): void {
  void qc.invalidateQueries({ queryKey: queryKeys.debts(householdId) });
}

interface PatchVars {
  id: string;
  ownerId: string;
  householdId: string;
  expectedVersion: number;
  stepId: string;
  before?: Record<string, PatchValue>;
}

/** Shared default for the two version-conditional debt patches (edit and paid off); one undo step each. */
function patchDefaults<V extends PatchVars>(
  qc: QueryClient,
  label: 'debtEdited' | 'debtPaidOff',
  patchOf: (v: V) => DebtPatch,
  nameOf: (v: V) => string
) {
  const beforeOf = (v: V): Record<string, PatchValue> => v.before ?? { paid_off_on: null };
  return {
    mutationFn: (vars: V) =>
      guardSession(vars, async () => {
        const expected = resolveExpectedVersion('debts', vars.id, vars.expectedVersion);
        const client = await writeClient();
        const patch = patchOf(vars);
        const row = await updateDebt(client, vars.id, expected, patch).catch((err: unknown) =>
          acceptIfAlreadyApplied<DebtRow>(err, patch)
        );
        recordWrittenVersion('debts', vars.id, [vars.expectedVersion, expected], row.version);
        const step = buildStep(
          vars.stepId,
          label,
          { name: nameOf(vars) },
          inverseOfPatches('debts', [{ id: row.id, before: beforeOf(vars), versionAfter: row.version }])
        );
        await recordUndoStepSafely(qc, client, step, vars.ownerId);
        return row;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: V) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.debts(vars.householdId) });
      const patch = patchOf(vars);
      qc.setQueryData<DebtList>(queryKeys.debts(vars.householdId), (old) =>
        (old ?? []).map((r) => (r.id === vars.id ? { ...r, ...patch, pending: true } : r))
      );
    },
    onSuccess: (row: DebtRow, vars: V) => {
      qc.setQueryData<DebtList>(queryKeys.debts(vars.householdId), (old) => (old ?? []).map((r) => (r.id === row.id ? row : r)));
      invalidateDebts(qc, vars.householdId);
    },
    onError: async (err: unknown, vars: V) => {
      const cls = classifySettledWriteError(err);
      if (cls === 'conflict' && err instanceof VersionConflictError) {
        const serverRow = err.serverRow as DebtRow | null;
        if (serverRow && typeof serverRow === 'object' && 'id' in serverRow) {
          qc.setQueryData<DebtList>(queryKeys.debts(vars.householdId), (old) =>
            serverRow.deleted_at ? (old ?? []).filter((r) => r.id !== vars.id) : (old ?? []).map((r) => (r.id === vars.id ? serverRow : r))
          );
        } else {
          invalidateDebts(qc, vars.householdId);
        }
      } else if (cls === 'rejected' || cls === 'not-found') {
        invalidateDebts(qc, vars.householdId);
      } else {
        return;
      }
      await recordFailedWrite({
        entity: 'debts',
        entityId: vars.id,
        kind: cls,
        code: cls === 'conflict' ? 'version-conflict' : settledWriteErrorCode(err),
        // Field names only, never an amount or a name.
        attempted: { labelKey: label, fields: Object.keys(patchOf(vars)) },
      });
    },
  };
}

export function registerDebtMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.addDebt, {
    mutationFn: (vars: AddDebtVars) =>
      guardSession(vars, async () => {
        const client = await writeClient();
        // A duplicate client id (23505) is read back by insertDebt: this exact write already landed.
        const row = await insertDebt(client, vars.row);
        const step = buildStep(
          vars.stepId,
          'debtAdded',
          { name: vars.row.name },
          inverseOfInserts('debts', [{ id: row.id, version: row.version }])
        );
        await recordUndoStepSafely(qc, client, step, vars.ownerId);
        return row;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: AddDebtVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.debts(vars.householdId) });
      const now = new Date().toISOString();
      const optimistic: WithPending<DebtRow> = {
        ...vars.row,
        check_id: null,
        paid_off_on: null,
        is_housing: false,
        is_sample: false,
        deleted_at: null,
        version: 1,
        updated_by: vars.ownerId,
        created_at: now,
        updated_at: now,
        pending: true,
      };
      qc.setQueryData<DebtList>(queryKeys.debts(vars.householdId), (old) => upsertRow(old ?? [], optimistic, 'end'));
    },
    onSuccess: (row: DebtRow, vars: AddDebtVars) => {
      qc.setQueryData<DebtList>(queryKeys.debts(vars.householdId), (old) => upsertRow(old ?? [], row, 'end'));
      invalidateDebts(qc, vars.householdId);
    },
    onError: async (err: unknown, vars: AddDebtVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return;
      qc.setQueryData<DebtList>(queryKeys.debts(vars.householdId), (old) => (old ?? []).filter((r) => r.id !== vars.row.id));
      await recordFailedWrite({
        entity: 'debts',
        entityId: vars.row.id,
        kind: cls,
        code: settledWriteErrorCode(err),
        attempted: { labelKey: 'debtAdded', fields: 1 },
      });
    },
  });

  qc.setMutationDefaults(
    mutationKeys.editDebt,
    patchDefaults<EditDebtVars>(qc, 'debtEdited', (v) => v.patch, (v) => v.name)
  );
  qc.setMutationDefaults(
    mutationKeys.setDebtPaidOff,
    patchDefaults<SetDebtPaidOffVars>(qc, 'debtPaidOff', (v) => ({ paid_off_on: v.date }), (v) => v.name)
  );

  // 05.2-15 (DSU-06): how a card is paid off each month. Same shape as the housing write; label setupStepSaved.
  qc.setMutationDefaults(mutationKeys.setDebtPaysInFull, {
    mutationFn: (vars: SetDebtPaysInFullVars) =>
      guardSession(vars, async () => {
        const expected = resolveExpectedVersion('debts', vars.id, vars.expectedVersion);
        const client = await writeClient();
        const patch = { pays_in_full: vars.value };
        const row = await updateDebt(client, vars.id, expected, patch).catch((err: unknown) =>
          acceptIfAlreadyApplied<DebtRow>(err, patch)
        );
        recordWrittenVersion('debts', vars.id, [vars.expectedVersion, expected], row.version);
        const step = buildStep(
          vars.stepId,
          'setupStepSaved',
          vars.stepTitle ? { name: vars.stepTitle } : {},
          inverseOfPatches('debts', [{ id: row.id, before: { pays_in_full: vars.before }, versionAfter: row.version }])
        );
        await recordUndoStepSafely(qc, client, step, vars.ownerId);
        return row;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: SetDebtPaysInFullVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.debts(vars.householdId) });
      qc.setQueryData<DebtList>(queryKeys.debts(vars.householdId), (old) =>
        (old ?? []).map((r) => (r.id === vars.id ? { ...r, pays_in_full: vars.value, pending: true } : r))
      );
    },
    onSuccess: (row: DebtRow, vars: SetDebtPaysInFullVars) => {
      qc.setQueryData<DebtList>(queryKeys.debts(vars.householdId), (old) =>
        (old ?? []).map((r) => (r.id === row.id ? row : r))
      );
      invalidateDebts(qc, vars.householdId);
    },
    onError: async (err: unknown, vars: SetDebtPaysInFullVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'conflict' && cls !== 'rejected' && cls !== 'not-found') return;
      invalidateDebts(qc, vars.householdId);
      await recordFailedWrite({
        entity: 'debts',
        entityId: vars.id,
        kind: cls,
        code: cls === 'conflict' ? 'version-conflict' : settledWriteErrorCode(err),
        attempted: { labelKey: 'setupStepSaved', fields: 1 },
      });
    },
  });

  qc.setMutationDefaults(mutationKeys.setDebtHousing, {
    mutationFn: (vars: SetDebtHousingVars) =>
      guardSession(vars, async () => {
        const expected = resolveExpectedVersion('debts', vars.id, vars.expectedVersion);
        const client = await writeClient();
        const patch = { is_housing: vars.isHousing };
        const row = await updateDebt(client, vars.id, expected, patch).catch((err: unknown) =>
          acceptIfAlreadyApplied<DebtRow>(err, patch)
        );
        recordWrittenVersion('debts', vars.id, [vars.expectedVersion, expected], row.version);
        const step = buildStep(
          vars.stepId,
          'debtHousingChanged',
          {},
          inverseOfPatches('debts', [{ id: row.id, before: { is_housing: vars.before }, versionAfter: row.version }])
        );
        await recordUndoStepSafely(qc, client, step, vars.ownerId);
        return row;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: SetDebtHousingVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.debts(vars.householdId) });
      qc.setQueryData<DebtList>(queryKeys.debts(vars.householdId), (old) =>
        (old ?? []).map((r) => (r.id === vars.id ? { ...r, is_housing: vars.isHousing, pending: true } : r))
      );
    },
    onSuccess: (row: DebtRow, vars: SetDebtHousingVars) => {
      qc.setQueryData<DebtList>(queryKeys.debts(vars.householdId), (old) =>
        (old ?? []).map((r) => (r.id === row.id ? row : r))
      );
      invalidateDebts(qc, vars.householdId);
    },
    onError: async (err: unknown, vars: SetDebtHousingVars) => {
      const cls = classifySettledWriteError(err);
      if (cls === 'conflict' && err instanceof VersionConflictError) {
        const serverRow = err.serverRow as DebtRow | null;
        if (serverRow && typeof serverRow === 'object' && 'id' in serverRow) {
          qc.setQueryData<DebtList>(queryKeys.debts(vars.householdId), (old) =>
            serverRow.deleted_at
              ? (old ?? []).filter((r) => r.id !== vars.id)
              : (old ?? []).map((r) => (r.id === vars.id ? serverRow : r))
          );
        } else {
          invalidateDebts(qc, vars.householdId);
        }
        await recordFailedWrite({
          entity: 'debts',
          entityId: vars.id,
          kind: 'conflict',
          code: 'version-conflict',
          attempted: { labelKey: 'debtHousingChanged', fields: 1 },
        });
        return;
      }
      if (cls === 'rejected' || cls === 'not-found') {
        invalidateDebts(qc, vars.householdId);
        await recordFailedWrite({
          entity: 'debts',
          entityId: vars.id,
          kind: cls,
          code: settledWriteErrorCode(err),
          attempted: { labelKey: 'debtHousingChanged', fields: 1 },
        });
      }
    },
  });
}

/**
 * Turn the housing marker on or off for a loan. Returns the undo step id (the caller toasts "Housing setting
 * changed" with Undo). A card is refused: cards are never housing and the switch is not offered for them.
 */
export function useSetDebtHousing(): { setHousing(debt: DebtRow, isHousing: boolean, ownerId: string): string } {
  const mutation = useMutation<DebtRow, unknown, SetDebtHousingVars>({
    mutationKey: mutationKeys.setDebtHousing,
    scope: WRITE_SCOPE,
  });
  return {
    setHousing(debt, isHousing, ownerId) {
      if (debt.kind === 'card') throw new RangeError('set debt housing: a card is never housing');
      const stepId = newStepId();
      mutation.mutate({
        id: debt.id,
        ownerId,
        householdId: debt.household_id,
        expectedVersion: debt.version,
        isHousing,
        before: debt.is_housing,
        stepId,
      });
      return stepId;
    },
  };
}

/** Save how a card is paid each month (yes, sometimes, no). Returns the undo step id. */
export function useSetDebtPaysInFull(): { setPaysInFull(debt: DebtRow, value: PaysInFull, ownerId: string, stepTitle?: string): string } {
  const mutation = useMutation<DebtRow, unknown, SetDebtPaysInFullVars>({
    mutationKey: mutationKeys.setDebtPaysInFull,
    scope: WRITE_SCOPE,
  });
  return {
    setPaysInFull(debt, value, ownerId, stepTitle) {
      const stepId = newStepId();
      mutation.mutate({
        id: debt.id,
        ownerId,
        householdId: debt.household_id,
        expectedVersion: debt.version,
        value,
        before: debt.pays_in_full ?? null,
        stepTitle: stepTitle ?? null,
        stepId,
      });
      return stepId;
    },
  };
}

/** Add a loan or card. Returns the new id and the undo step id (Undo soft-deletes the row). */
export function useAddDebt(): {
  add(input: { householdId: string; ownerId: string; row: Omit<NewDebt, 'id' | 'household_id'> }): { id: string; stepId: string };
} {
  const mutation = useMutation<DebtRow, unknown, AddDebtVars>({ mutationKey: mutationKeys.addDebt, scope: WRITE_SCOPE });
  return {
    add(input) {
      assertDebtFields(input.row, 'add debt');
      if (input.row.pays_in_full != null && input.row.kind !== 'card') throw new RangeError('add debt: pays_in_full is for cards only');
      const id = Crypto.randomUUID();
      const stepId = newStepId();
      mutation.mutate({
        ownerId: input.ownerId,
        householdId: input.householdId,
        row: { ...input.row, name: input.row.name.trim(), id, household_id: input.householdId },
        stepId,
      });
      return { id, stepId };
    },
  };
}

/** Edit name, balance, rate, minimum payment and (cards) how the card is paid. Writes only the keys given. Returns the undo step id. */
export function useEditDebt(): { edit(debt: DebtRow, patch: EditableDebtPatch, ownerId: string): string } {
  const mutation = useMutation<DebtRow, unknown, EditDebtVars>({ mutationKey: mutationKeys.editDebt, scope: WRITE_SCOPE });
  return {
    edit(debt, patch, ownerId) {
      const keys = Object.keys(patch);
      if (keys.length === 0) throw new RangeError('edit debt: empty patch');
      for (const k of keys) {
        if (!(EDITABLE_KEYS as readonly string[]).includes(k)) throw new RangeError(`edit debt: ${k} is not editable here`);
      }
      if (patch.pays_in_full !== undefined && debt.kind !== 'card') throw new RangeError('edit debt: pays_in_full is for cards only');
      assertDebtFields(patch, 'edit debt');
      const clean: EditableDebtPatch = patch.name !== undefined ? { ...patch, name: patch.name.trim() } : patch;
      const before: Record<string, PatchValue> = {};
      for (const k of Object.keys(clean) as (keyof EditableDebtPatch)[]) before[k] = debt[k] ?? null;
      const stepId = newStepId();
      mutation.mutate({
        id: debt.id,
        ownerId,
        householdId: debt.household_id,
        expectedVersion: debt.version,
        patch: clean,
        before,
        name: clean.name ?? debt.name,
        stepId,
      });
      return stepId;
    },
  };
}

/** Mark a debt paid off on a local date (never after today). One Undo puts paid_off_on back to null. Returns the undo step id. */
export function useSetDebtPaidOff(): { setPaidOff(debt: DebtRow, date: string, ownerId: string): string } {
  const mutation = useMutation<DebtRow, unknown, SetDebtPaidOffVars>({ mutationKey: mutationKeys.setDebtPaidOff, scope: WRITE_SCOPE });
  // The household's local date (never the UTC date), the same way the record context derives it.
  const today = (): string => localDateIn(new Date(), getDeviceTimeZone());
  return {
    setPaidOff(debt, date, ownerId) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RangeError('set paid off: malformed date');
      if (date > today()) throw new RangeError('set paid off: date is after today');
      if (debt.paid_off_on != null) throw new RangeError('set paid off: already paid off');
      const stepId = newStepId();
      mutation.mutate({
        id: debt.id,
        ownerId,
        householdId: debt.household_id,
        expectedVersion: debt.version,
        date,
        name: debt.name,
        stepId,
      });
      return stepId;
    },
  };
}
