// 06-14 (GRW-04, GRW-07..09, D-15, D-16): queued writes for Grow's debts. Same shape as debts.ts and growGoals.ts: paused-mutation
// defaults registered once at start, optimistic debts cache, ONE undo step per action, a version conflict parked in the
// failed-writes list (field names only, never an amount or a name).
//
//   useSaveGrowDebt     add or edit a loan or card from Grow (insert / version-conditional update); labels debtAdded / debtEdited
//   useSaveDebtPlan     the extra a month and the order: save_debt_plan, the server builds the one step (debtPlanSaved)
//   useRecordDebtSale   "I sold it": record_debt_sale, ONE rpc call for the sale and the final payment (debtSaleRecorded)
//   useRecordDebtOneOff "Use $1,000 once": record_debt_one_off, ONE Expected payment line linked to the debt (debtOneOffRecorded)
//
// extraStartDate / oneOffDate are the dates these writes use, exported so the payoff buttons name the same dates (D-30).
//
// Undo of a plan or a sale is a server-built step; it does not bump row versions as the client counts them, so call
// refreshDebtReads after Undo (like refreshGoalReads) rather than assume version + 1.
import * as Crypto from 'expo-crypto';
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { localDateIn } from '@/engine/time';
import { buildStep, inverseOfInserts, inverseOfPatches, type PatchValue } from '@/engine/undo';
import { VersionConflictError } from '@/db/errors';
import { recordDebtOneOff, recordDebtSale, saveDebtPlan, type DebtPlanSeries, type DebtSaleLeg } from '@/db/debtPlan';
import { insertDebt, updateDebt, type DebtPatch, type DebtRow, type NewDebt } from '@/db/debts';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import type { WithPending } from '@/data/types';
import { classifySettledWriteError, settledWriteErrorCode, shouldRetryWrite, writeRetryDelay } from '@/data/sync/writeErrors';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { guardSession, markSession } from '@/data/sync/sessionEpoch';
import { recordWrittenVersion, resolveExpectedVersion } from '@/data/sync/versionChain';
import { dueDateOf } from '@/features/grow/connect/debtPoint';
import { getDeviceTimeZone } from '@/services/locale/deviceLocale';
import { writeClient } from './writeClient';
import { acceptIfAlreadyApplied, upsertRow } from './cacheRows';
import { invalidateDerivedReads } from './transactionCache';
import { newStepId, recordUndoStepSafely } from './undoCapture';

type DebtList = WithPending<DebtRow>[];

const MAX_MINOR = 10_000_000_000_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface DebtCacheKey {
  userId: string;
  householdId: string;
}

/**
 * Refresh everything a debt action can change: the debts, the monthly records (payment and extra), the lines, the balances
 * and the undo list. Call it after Undo of a Grow debt step too: the plan and sale steps are built on the server, so the
 * screens refetch rather than assume version + 1.
 */
export function refreshDebtReads(qc: QueryClient, cache: DebtCacheKey): void {
  void qc.invalidateQueries({ queryKey: queryKeys.debts(cache.householdId) });
  void qc.invalidateQueries({ queryKey: queryKeys.recurringSeries(cache.householdId) });
  void qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(cache.householdId) });
  void qc.invalidateQueries({ queryKey: queryKeys.undoLog(cache.userId) });
  invalidateDerivedReads(qc, cache.householdId);
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
function validDueDay(d: number | null): boolean {
  return d === null || (Number.isInteger(d) && d >= 1 && d <= 31);
}

function patchDebts(qc: QueryClient, householdId: string, updater: (rows: DebtList) => DebtList): void {
  qc.setQueryData<DebtList>(queryKeys.debts(householdId), (old) => updater(old ?? []));
}

async function parkFailure(debtId: string, err: unknown, attempted: Record<string, unknown>, onRefresh: () => void): Promise<void> {
  const cls = classifySettledWriteError(err);
  if (cls !== 'conflict' && cls !== 'rejected' && cls !== 'not-found') return;
  onRefresh();
  await recordFailedWrite({
    entity: 'debts',
    entityId: debtId,
    kind: cls,
    code: cls === 'conflict' ? 'version-conflict' : settledWriteErrorCode(err),
    attempted,
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Add or edit a loan or card (saveGrowDebt)
// ---------------------------------------------------------------------------------------------------------------------

export type GrowPaysInFull = 'yes' | 'sometimes' | 'no' | null;

/** What a new loan or card is made of. A card paid in full each month needs no rate or minimum (D-15). */
export interface NewGrowDebtFields {
  name: string;
  kind: 'loan' | 'card' | 'other';
  currency: string;
  balance: number;
  apr?: string | null;
  minimum_payment?: number;
  due_day?: number | null;
  /** The balance when first recorded, for the paid-off bar. Defaults to `balance`. */
  started_balance?: number | null;
  /** Cards only. 'yes' stays out of the payoff plan; null ("Not sure") is treated as a carried balance. */
  pays_in_full?: GrowPaysInFull;
  account_id?: string | null;
  secured?: boolean;
}

/** What an existing debt may change from Grow. */
export type EditGrowDebtFields = Partial<
  Pick<NewGrowDebtFields, 'name' | 'balance' | 'apr' | 'minimum_payment' | 'due_day' | 'pays_in_full' | 'started_balance'>
>;
const EDIT_KEYS = ['name', 'balance', 'apr', 'minimum_payment', 'due_day', 'pays_in_full', 'started_balance'] as const;

export type SaveGrowDebtVars =
  | { mode: 'add'; ownerId: string; householdId: string; row: NewDebt; stepId: string }
  | {
      mode: 'edit';
      id: string;
      ownerId: string;
      householdId: string;
      expectedVersion: number;
      patch: DebtPatch;
      before: Record<string, PatchValue>;
      name: string;
      stepId: string;
    };

export type SaveGrowDebtInput =
  | { ownerId: string; householdId: string; existing?: undefined; fields: NewGrowDebtFields }
  | { ownerId: string; householdId?: undefined; existing: DebtRow; fields: EditGrowDebtFields };

function assertFields(f: Partial<NewGrowDebtFields>, where: string): void {
  if (f.name !== undefined && !validName(f.name)) throw new RangeError(`${where}: name must be 1-80 characters`);
  if (f.balance !== undefined && !validMinor(f.balance)) throw new RangeError(`${where}: balance out of range`);
  if (f.minimum_payment !== undefined && !validMinor(f.minimum_payment)) throw new RangeError(`${where}: minimum payment out of range`);
  if (f.started_balance != null && !validMinor(f.started_balance)) throw new RangeError(`${where}: started balance out of range`);
  if (f.apr !== undefined && !validApr(f.apr)) throw new RangeError(`${where}: rate must be 0-100 with at most 2 decimals`);
  if (f.due_day !== undefined && !validDueDay(f.due_day)) throw new RangeError(`${where}: due day must be 1-31`);
}

export function registerGrowDebtMutations(qc: QueryClient): void {
  registerSaveGrowDebt(qc);
  registerSaveDebtPlan(qc);
  registerRecordDebtSale(qc);
  registerRecordDebtOneOff(qc);
}

function registerSaveGrowDebt(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.saveGrowDebt, {
    mutationFn: (vars: SaveGrowDebtVars) =>
      guardSession(vars, async () => {
        const client = await writeClient();
        if (vars.mode === 'add') {
          // A duplicate client id (23505) is read back by insertDebt: this exact write already landed.
          const row = await insertDebt(client, vars.row);
          const step = buildStep(vars.stepId, 'debtAdded', { name: vars.row.name }, inverseOfInserts('debts', [{ id: row.id, version: row.version }]));
          await recordUndoStepSafely(qc, client, step, vars.ownerId);
          return row;
        }
        const expected = resolveExpectedVersion('debts', vars.id, vars.expectedVersion);
        const row = await updateDebt(client, vars.id, expected, vars.patch).catch((err: unknown) =>
          acceptIfAlreadyApplied<DebtRow>(err, vars.patch)
        );
        recordWrittenVersion('debts', vars.id, [vars.expectedVersion, expected], row.version);
        const step = buildStep(
          vars.stepId,
          'debtEdited',
          { name: vars.name },
          inverseOfPatches('debts', [{ id: row.id, before: vars.before, versionAfter: row.version }])
        );
        await recordUndoStepSafely(qc, client, step, vars.ownerId);
        return row;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: SaveGrowDebtVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.debts(vars.householdId) });
      if (vars.mode === 'add') {
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
        patchDebts(qc, vars.householdId, (rows) => upsertRow(rows, optimistic, 'end'));
      } else {
        patchDebts(qc, vars.householdId, (rows) => rows.map((r) => (r.id === vars.id ? { ...r, ...vars.patch, pending: true } : r)));
      }
    },
    onSuccess: (row: DebtRow, vars: SaveGrowDebtVars) => {
      patchDebts(qc, vars.householdId, (rows) => upsertRow(rows, row, 'end'));
      void qc.invalidateQueries({ queryKey: queryKeys.debts(vars.householdId) });
    },
    onError: async (err: unknown, vars: SaveGrowDebtVars) => {
      const cls = classifySettledWriteError(err);
      if (vars.mode === 'add') {
        if (cls === 'rejected' || cls === 'not-found') patchDebts(qc, vars.householdId, (rows) => rows.filter((r) => r.id !== vars.row.id));
        await parkFailure(vars.row.id, err, { labelKey: 'debtAdded', fields: 1 }, () => undefined);
        return;
      }
      if (cls === 'conflict' && err instanceof VersionConflictError) {
        const serverRow = err.serverRow as DebtRow | null;
        if (serverRow && typeof serverRow === 'object' && 'id' in serverRow) {
          patchDebts(qc, vars.householdId, (rows) =>
            serverRow.deleted_at ? rows.filter((r) => r.id !== vars.id) : rows.map((r) => (r.id === vars.id ? serverRow : r))
          );
        }
      }
      await parkFailure(vars.id, err, { labelKey: 'debtEdited', fields: Object.keys(vars.patch) }, () =>
        void qc.invalidateQueries({ queryKey: queryKeys.debts(vars.householdId) })
      );
    },
  });
}

/**
 * Add a loan or card, or change one, from Grow. Returns the new id (add) and the undo step id. A card paid in full each
 * month ('yes') is saved with no rate and no minimum and stays out of the payoff plan (D-15); "Not sure" (null) is kept as
 * null and counts as a carried balance.
 */
export function useSaveGrowDebt(): { save(input: SaveGrowDebtInput): { id: string; stepId: string } } {
  const mutation = useMutation<DebtRow, unknown, SaveGrowDebtVars>({ mutationKey: mutationKeys.saveGrowDebt, scope: WRITE_SCOPE });
  return {
    save(input) {
      const stepId = newStepId();
      if (input.existing === undefined) {
        const f = input.fields;
        assertFields(f, 'add debt');
        if (!/^[A-Z0-9]{2,4}$/.test(f.currency)) throw new RangeError('add debt: currency must be a code');
        if (f.pays_in_full != null && f.kind !== 'card') throw new RangeError('add debt: pays_in_full is for cards only');
        const paysFull = f.kind === 'card' && f.pays_in_full === 'yes';
        const id = Crypto.randomUUID();
        const row: NewDebt = {
          id,
          household_id: input.householdId,
          account_id: f.account_id ?? null,
          series_id: null,
          name: f.name.trim(),
          kind: f.kind,
          currency: f.currency,
          balance: f.balance,
          apr: paysFull ? null : f.apr ?? null,
          minimum_payment: paysFull ? 0 : f.minimum_payment ?? 0,
          secured: f.secured ?? false,
          term_months: null,
          start_date: null,
          min_percent: null,
          min_interest_added: null,
          min_floor: null,
          paid_in_full: false,
          pays_in_full: f.kind === 'card' ? f.pays_in_full ?? null : null,
          due_day: f.due_day ?? null,
          started_balance: f.started_balance ?? f.balance,
          payoff_order: null,
        };
        mutation.mutate({ mode: 'add', ownerId: input.ownerId, householdId: input.householdId, row, stepId });
        return { id, stepId };
      }
      const debt = input.existing;
      const f = input.fields;
      const keys = Object.keys(f);
      if (keys.length === 0) throw new RangeError('edit debt: empty patch');
      for (const k of keys) {
        if (!(EDIT_KEYS as readonly string[]).includes(k)) throw new RangeError(`edit debt: ${k} is not editable here`);
      }
      if (f.pays_in_full !== undefined && debt.kind !== 'card') throw new RangeError('edit debt: pays_in_full is for cards only');
      assertFields(f, 'edit debt');
      const patch: DebtPatch = { ...f, ...(f.name !== undefined ? { name: f.name.trim() } : {}) };
      const before: Record<string, PatchValue> = {};
      for (const k of Object.keys(patch) as (keyof DebtPatch)[]) before[k] = (debt[k as keyof DebtRow] ?? null) as PatchValue;
      mutation.mutate({
        mode: 'edit',
        id: debt.id,
        ownerId: input.ownerId,
        householdId: debt.household_id,
        expectedVersion: debt.version,
        patch,
        before,
        name: patch.name ?? debt.name,
        stepId,
      });
      return { id: debt.id, stepId };
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Start dates (D-30: the button names its start date)
// ---------------------------------------------------------------------------------------------------------------------

/**
 * The first date of a monthly extra: the debt's next due date (this month's if it has not passed, else next month's, clamped
 * to the month's last day), or `today` when no due day is set. useSaveDebtPlan anchors the extra's monthly record on it.
 */
export function extraStartDate(debt: Pick<DebtRow, 'due_day'>, today: string): string {
  return debt.due_day != null ? dueDateOf(today, debt.due_day, 0) : today;
}

/** The date of a one-off payment: today, in the device's time zone. useRecordDebtOneOff dates the line with it. */
export function oneOffDate(today: string = localDateIn(new Date(), getDeviceTimeZone())): string {
  return today;
}

// ---------------------------------------------------------------------------------------------------------------------
// The payoff plan (save_debt_plan)
// ---------------------------------------------------------------------------------------------------------------------

export interface SaveDebtPlanVars {
  ownerId: string;
  cache: DebtCacheKey;
  debtId: string;
  expectedVersion: number;
  extra: number;
  order: 'rate' | 'balance' | null;
  series: DebtPlanSeries | null;
  name: string;
  stepId: string;
}

function registerSaveDebtPlan(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.saveDebtPlan, {
    mutationFn: (vars: SaveDebtPlanVars) =>
      guardSession(vars, async () => {
        const expected = resolveExpectedVersion('debts', vars.debtId, vars.expectedVersion);
        // The server builds the one Undo step from what it wrote (the old extra, the old record, the old order).
        const client = await writeClient();
        return saveDebtPlan(client, {
          debtId: vars.debtId,
          expectedVersion: expected,
          extra: vars.extra,
          order: vars.order,
          series: vars.series,
          undoStep: { id: vars.stepId, name: vars.name },
        });
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: SaveDebtPlanVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.debts(vars.cache.householdId) });
      patchDebts(qc, vars.cache.householdId, (rows) =>
        rows.map((r) => (r.id === vars.debtId ? { ...r, payoff_extra: vars.extra, payoff_order: vars.order, pending: true } : r))
      );
    },
    onSuccess: (_res: unknown, vars: SaveDebtPlanVars) => {
      // The row version moved on the server; refetch instead of guessing it.
      refreshDebtReads(qc, vars.cache);
    },
    onError: async (err: unknown, vars: SaveDebtPlanVars) => {
      await parkFailure(vars.debtId, err, { labelKey: 'debtPlanSaved', fields: 2 }, () => refreshDebtReads(qc, vars.cache));
    },
  });
}

export interface SaveDebtPlanInput {
  ownerId: string;
  debt: DebtRow;
  /** Minor units a month on top of the minimums; 0 clears the extra. */
  extra: number;
  order: 'rate' | 'balance' | null;
  /** The account the extra is paid from. Required when extra > 0. */
  paidFromAccountId?: string | null;
  /** Name of the monthly record; defaults to the debt's name. */
  seriesName?: string;
}

/**
 * Save the extra a month and the payoff order for a debt. With an extra the monthly record is made on the debt's due day
 * (or today's date when no due day is set); with 0 it is stopped. One queued call, one Undo ('debtPlanSaved').
 */
export function useSaveDebtPlan(): { save(input: SaveDebtPlanInput): { stepId: string } } {
  const mutation = useMutation<unknown, unknown, SaveDebtPlanVars>({ mutationKey: mutationKeys.saveDebtPlan, scope: WRITE_SCOPE });
  return {
    save(input) {
      const { debt } = input;
      if (!validMinor(input.extra)) throw new RangeError('save debt plan: extra out of range');
      if (input.order !== null && input.order !== 'rate' && input.order !== 'balance') throw new RangeError('save debt plan: order');
      const tz = getDeviceTimeZone();
      let series: DebtPlanSeries | null = null;
      if (input.extra > 0) {
        if (!input.paidFromAccountId) throw new RangeError('save debt plan: choose the account the extra comes from');
        series = {
          id: Crypto.randomUUID(),
          account_id: input.paidFromAccountId,
          anchor_date: extraStartDate(debt, localDateIn(new Date(), tz)),
          time_zone: tz,
          name: (input.seriesName ?? debt.name).trim(),
          category_id: null,
        };
      }
      const stepId = newStepId();
      mutation.mutate({
        ownerId: input.ownerId,
        cache: { userId: input.ownerId, householdId: debt.household_id },
        debtId: debt.id,
        expectedVersion: debt.version,
        extra: input.extra,
        order: input.order,
        series,
        name: debt.name,
        stepId,
      });
      return { stepId };
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// The sale (record_debt_sale, D-16)
// ---------------------------------------------------------------------------------------------------------------------

export interface RecordDebtSaleVars {
  ownerId: string;
  cache: DebtCacheKey;
  debtId: string;
  expectedVersion: number;
  sale: DebtSaleLeg;
  payment: DebtSaleLeg | null;
  /** Debt balance when the sale was entered: the optimistic cache result is worked from it. */
  balanceBefore: number;
  name: string;
  stepId: string;
}

function registerRecordDebtSale(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.recordDebtSale, {
    mutationFn: (vars: RecordDebtSaleVars) =>
      guardSession(vars, async () => {
        const expected = resolveExpectedVersion('debts', vars.debtId, vars.expectedVersion);
        const client = await writeClient();
        // ONE call: both transactions and the debt change in one server transaction, with one Undo step.
        return recordDebtSale(client, {
          debtId: vars.debtId,
          expectedVersion: expected,
          sale: vars.sale,
          payment: vars.payment,
          undoStep: { id: vars.stepId, name: vars.name },
        });
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: RecordDebtSaleVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.debts(vars.cache.householdId) });
      if (vars.payment === null) return;
      const left = vars.balanceBefore - vars.payment.amount;
      patchDebts(qc, vars.cache.householdId, (rows) =>
        rows.map((r) =>
          r.id === vars.debtId
            ? { ...r, balance: Math.max(0, left), paid_off_on: left <= 0 ? vars.payment?.local_date ?? null : r.paid_off_on ?? null, pending: true }
            : r
        )
      );
    },
    onSuccess: (res: { paidOff: boolean | null; stillOwed: number | null }, vars: RecordDebtSaleVars) => {
      // The server's answer wins: still owed above zero keeps the debt open.
      if (res.paidOff === false && res.stillOwed !== null) {
        const owed = res.stillOwed;
        patchDebts(qc, vars.cache.householdId, (rows) =>
          rows.map((r) => (r.id === vars.debtId ? { ...r, balance: owed, paid_off_on: null } : r))
        );
      }
      refreshDebtReads(qc, vars.cache);
    },
    onError: async (err: unknown, vars: RecordDebtSaleVars) => {
      await parkFailure(vars.debtId, err, { labelKey: 'debtSaleRecorded', fields: vars.payment === null ? 1 : 2 }, () =>
        refreshDebtReads(qc, vars.cache)
      );
    },
  });
}

export interface RecordDebtSaleInput {
  ownerId: string;
  debt: DebtRow;
  /** What it sold for, positive minor units. */
  soldFor: number;
  /** What goes to the loan, 0 to record the sale alone. Cannot be more than the balance. */
  paidToLoan: number;
  /** The account the sale money lands in ("Left over goes to"). */
  saleAccountId: string;
  /** The account the final payment leaves. Required when paidToLoan > 0. */
  paymentAccountId?: string | null;
  saleName: string;
  paymentName: string;
  /** The local date; defaults to today. */
  date?: string;
  /** Defaults to the debt's currency. */
  currency?: string;
}

/**
 * "I sold it": the sale and the final payment in ONE call (D-16). Returns the step id and what is left over after the loan
 * (for the "Left over goes to" line). A payment that covers the balance closes the loan; less keeps it open.
 */
export function useRecordDebtSale(): { record(input: RecordDebtSaleInput): { stepId: string; leftOver: number } } {
  const mutation = useMutation<unknown, unknown, RecordDebtSaleVars>({ mutationKey: mutationKeys.recordDebtSale, scope: WRITE_SCOPE });
  return {
    record(input) {
      const { debt } = input;
      if (!Number.isSafeInteger(input.soldFor) || input.soldFor < 1 || input.soldFor > MAX_MINOR) throw new RangeError('record debt sale: sold-for out of range');
      if (!validMinor(input.paidToLoan)) throw new RangeError('record debt sale: payment out of range');
      if (input.paidToLoan > debt.balance) throw new RangeError('payment-exceeds-balance');
      if (!validName(input.saleName) || !validName(input.paymentName)) throw new RangeError('record debt sale: name must be 1-80 characters');
      const tz = getDeviceTimeZone();
      const date = input.date ?? localDateIn(new Date(), tz);
      if (!DATE_RE.test(date)) throw new RangeError('record debt sale: malformed date');
      const currency = input.currency ?? debt.currency;
      const leg = (amount: number, accountId: string, name: string): DebtSaleLeg => ({
        id: Crypto.randomUUID(),
        account_id: accountId,
        amount,
        currency,
        local_date: date,
        time_zone: tz,
        name: name.trim(),
      });
      const sale = leg(input.soldFor, input.saleAccountId, input.saleName);
      let payment: DebtSaleLeg | null = null;
      if (input.paidToLoan > 0) {
        if (!input.paymentAccountId) throw new RangeError('record debt sale: choose the account the payment leaves');
        payment = leg(input.paidToLoan, input.paymentAccountId, input.paymentName);
      }
      const stepId = newStepId();
      mutation.mutate({
        ownerId: input.ownerId,
        cache: { userId: input.ownerId, householdId: debt.household_id },
        debtId: debt.id,
        expectedVersion: debt.version,
        sale,
        payment,
        balanceBefore: debt.balance,
        name: debt.name,
        stepId,
      });
      return { stepId, leftOver: Math.max(0, input.soldFor - input.paidToLoan) };
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// A one-off payment (record_debt_one_off, D-33)
// ---------------------------------------------------------------------------------------------------------------------

export interface RecordDebtOneOffVars {
  ownerId: string;
  cache: DebtCacheKey;
  debtId: string;
  payment: DebtSaleLeg;
  name: string;
  stepId: string;
}

function registerRecordDebtOneOff(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.recordDebtOneOff, {
    mutationFn: (vars: RecordDebtOneOffVars) =>
      guardSession(vars, async () => {
        const client = await writeClient();
        // ONE call: the Expected line and its Undo step land together; a replay with the same ids is 'already-applied'.
        return recordDebtOneOff(client, { debtId: vars.debtId, payment: vars.payment, undoStep: { id: vars.stepId, name: vars.name } });
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: (vars: RecordDebtOneOffVars) => {
      // The debt's balance does not move: the line is Expected until marked paid. Nothing to patch optimistically.
      markSession(vars);
    },
    onSuccess: (_res: unknown, vars: RecordDebtOneOffVars) => {
      refreshDebtReads(qc, vars.cache);
    },
    onError: async (err: unknown, vars: RecordDebtOneOffVars) => {
      await parkFailure(vars.debtId, err, { labelKey: 'debtOneOffRecorded', fields: 1 }, () => refreshDebtReads(qc, vars.cache));
    },
  });
}

export interface RecordDebtOneOffInput {
  ownerId: string;
  debt: DebtRow;
  /** Positive minor units, at most the debt's balance. */
  amount: number;
  /** The account the payment leaves. */
  paidFromAccountId: string;
  /** The line's name, e.g. grow.debts.oneOffLineName. */
  name: string;
}

/**
 * "Use $1,000 once": one Expected payment line out of `paidFromAccountId`, dated oneOffDate() and linked to the debt.
 * One queued call, one server-built Undo ('debtOneOffRecorded'). The balance moves when the line is marked paid.
 */
export function useRecordDebtOneOff(): { record(input: RecordDebtOneOffInput): { stepId: string } } {
  const mutation = useMutation<unknown, unknown, RecordDebtOneOffVars>({ mutationKey: mutationKeys.recordDebtOneOff, scope: WRITE_SCOPE });
  return {
    record(input) {
      const { debt } = input;
      if (!Number.isSafeInteger(input.amount) || input.amount < 1 || input.amount > MAX_MINOR) throw new RangeError('record one-off: amount out of range');
      if (input.amount > debt.balance) throw new RangeError('payment-exceeds-balance');
      if (debt.paid_off_on != null || debt.deleted_at != null) throw new RangeError('record one-off: the debt is paid off or removed');
      if (!input.paidFromAccountId) throw new RangeError('record one-off: choose the account the payment leaves');
      if (!validName(input.name)) throw new RangeError('record one-off: name must be 1-80 characters');
      const tz = getDeviceTimeZone();
      const payment: DebtSaleLeg = {
        id: Crypto.randomUUID(),
        account_id: input.paidFromAccountId,
        amount: input.amount,
        currency: debt.currency,
        local_date: oneOffDate(localDateIn(new Date(), tz)),
        time_zone: tz,
        name: input.name.trim(),
      };
      const stepId = newStepId();
      mutation.mutate({
        ownerId: input.ownerId,
        cache: { userId: input.ownerId, householdId: debt.household_id },
        debtId: debt.id,
        payment,
        name: debt.name,
        stepId,
      });
      return { stepId };
    },
  };
}
