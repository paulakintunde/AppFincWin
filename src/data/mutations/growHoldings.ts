// 06-14 (GRW-05, GRW-06, GRW-10, GRW-11, D-09..D-12, D-24): queued writes for Grow's investments. Same shape as debts.ts and
// growGoals.ts: paused-mutation defaults registered once at start, optimistic cache, ONE undo step per action, a version
// conflict parked in the failed-writes list (ids and field names only, never a name or an amount).
//
//   useAddHolding       a simple holding: name, type, what was put in, what it is worth now (the DB seeds the first value entry)
//   useEditHolding      change a holding, or remove it (soft delete)
//   useAddHoldingLot    a buy, sale, dividend or fee, or "Update value" (kind 'value'); a sale beyond the units held is refused
//   useEditHoldingLot   change or remove an entry
//   useSetAccountRate   an account's interest rate (APY)
//
// A 'value' entry makes the server move the holding's value and version (trigger), so the holdings list is refetched after
// any entry write rather than assuming a version. Call refreshHoldingReads after Undo for the same reason.
import * as Crypto from 'expo-crypto';
import { useMutation } from '@tanstack/react-query';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { replayLots, type LotEntry } from '@/engine/grow';
import { minorUnits } from '@/engine/money';
import { percent } from '@/engine/payoff';
import { localDateIn } from '@/engine/time';
import { buildStep, inverseOfInserts, inverseOfPatches, type PatchValue, type UndoLabelKey } from '@/engine/undo';
import { VersionConflictError, type WriteEntity } from '@/db/errors';
import { updateAccount } from '@/db/accounts';
import {
  insertHoldingLot,
  updateHoldingLot,
  type HoldingLotKind,
  type HoldingLotPatch,
  type HoldingLotRow,
  type NewHoldingLot,
} from '@/db/holdingLots';
import { insertHolding, updateHolding, type HoldingPatch, type HoldingRow, type HoldingType, type NewHolding } from '@/db/holdings';
import type { AccountRow } from '@/db/rows';
import { mutationKeys, queryKeys, WRITE_SCOPE } from '@/data/keys';
import type { WithPending } from '@/data/types';
import { classifySettledWriteError, settledWriteErrorCode, shouldRetryWrite, writeRetryDelay } from '@/data/sync/writeErrors';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { guardSession, markSession } from '@/data/sync/sessionEpoch';
import { recordWrittenVersion, resolveExpectedVersion } from '@/data/sync/versionChain';
import { getDeviceTimeZone } from '@/services/locale/deviceLocale';
import { writeClient } from './writeClient';
import { acceptIfAlreadyApplied, upsertRow } from './cacheRows';
import { newStepId, recordUndoStepSafely } from './undoCapture';

type HoldingList = WithPending<HoldingRow>[];
type LotList = WithPending<HoldingLotRow>[];
type AccountList = WithPending<AccountRow>[];

const MAX_MINOR = 10_000_000_000_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UNITS_RE = /^\d{1,12}(\.\d{1,8})?$/;

export const HOLDING_TYPES: readonly HoldingType[] = ['brokerage', 'retirement', 'pension', 'crypto', 'other'];
export const HOLDING_LOT_KINDS: readonly HoldingLotKind[] = ['buy', 'sell', 'dividend', 'fee', 'value'];

export interface HoldingCacheKey {
  userId: string;
  householdId: string;
}

/** Refresh the holdings, their entries and the undo list. Call after Undo of any holding step (a value entry moves the holding). */
export function refreshHoldingReads(qc: QueryClient, cache: HoldingCacheKey): void {
  void qc.invalidateQueries({ queryKey: queryKeys.holdings(cache.userId, cache.householdId) });
  void qc.invalidateQueries({ queryKey: queryKeys.holdingLots(cache.userId, cache.householdId) });
  void qc.invalidateQueries({ queryKey: queryKeys.undoLog(cache.userId) });
}

function validName(name: string): boolean {
  const n = name.trim();
  return n.length >= 1 && n.length <= 80;
}
function validMinor(n: number): boolean {
  return Number.isSafeInteger(n) && n >= 0 && n <= MAX_MINOR;
}
function validPercentText(rate: string): boolean {
  try {
    percent(rate);
    return Number(rate) <= 100;
  } catch {
    return false;
  }
}

/** Replays the entries (the opening put-in counts as the first buy). Returns the engine's error code, or null when they hold up. */
export function lotsReplayError(
  holding: Pick<HoldingRow, 'opening_put_in' | 'value'>,
  lots: readonly Pick<HoldingLotRow, 'kind' | 'amount' | 'units' | 'local_date'>[]
): 'sell-exceeds-units' | 'bad-units' | null {
  const entries: LotEntry[] = [];
  if (holding.opening_put_in > 0) {
    entries.push({ kind: 'buy', amount: minorUnits(holding.opening_put_in), units: null, localDate: '0000-01-01' });
  }
  for (const l of lots) {
    if (l.kind === 'value') continue;
    entries.push({ kind: l.kind, amount: minorUnits(l.amount), units: l.units, localDate: l.local_date, valueBefore: minorUnits(holding.value) });
  }
  const res = replayLots(entries);
  return res.ok ? null : res.error;
}

async function parkFailure(
  entity: WriteEntity,
  entityId: string,
  err: unknown,
  attempted: Record<string, unknown>,
  onRefresh: () => void
): Promise<void> {
  const cls = classifySettledWriteError(err);
  if (cls !== 'conflict' && cls !== 'rejected' && cls !== 'not-found') return;
  onRefresh();
  await recordFailedWrite({
    entity,
    entityId,
    kind: cls,
    code: cls === 'conflict' ? 'version-conflict' : settledWriteErrorCode(err),
    attempted,
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Generic version-conditional patch (holdings, holding entries)
// ---------------------------------------------------------------------------------------------------------------------

interface PatchVars {
  id: string;
  ownerId: string;
  householdId: string;
  expectedVersion: number;
  patch: Record<string, PatchValue>;
  before: Record<string, PatchValue>;
  label: UndoLabelKey;
  /** The holding's name, for the Undo wording. */
  name: string;
  stepId: string;
}

interface PatchSpec<Row extends { id: string; version: number; deleted_at: string | null }> {
  entity: 'holdings' | 'holding_lots';
  cacheKey: (v: PatchVars) => QueryKey;
  update: (client: Awaited<ReturnType<typeof writeClient>>, id: string, expected: number, patch: Record<string, PatchValue>) => Promise<Row>;
}

function registerPatch<Row extends { id: string; version: number; deleted_at: string | null }>(
  qc: QueryClient,
  key: readonly string[],
  spec: PatchSpec<Row>
): void {
  const cache = (v: PatchVars): HoldingCacheKey => ({ userId: v.ownerId, householdId: v.householdId });
  const setRows = (v: PatchVars, fn: (rows: WithPending<Row>[]) => WithPending<Row>[]): void => {
    qc.setQueryData<WithPending<Row>[]>(spec.cacheKey(v), (old) => fn(old ?? []));
  };

  qc.setMutationDefaults(key, {
    mutationFn: (vars: PatchVars) =>
      guardSession(vars, async () => {
        const expected = resolveExpectedVersion(spec.entity, vars.id, vars.expectedVersion);
        const client = await writeClient();
        const row = await spec.update(client, vars.id, expected, vars.patch).catch((err: unknown) => acceptIfAlreadyApplied<Row>(err, vars.patch));
        recordWrittenVersion(spec.entity, vars.id, [vars.expectedVersion, expected], row.version);
        const step = buildStep(
          vars.stepId,
          vars.label,
          { name: vars.name },
          inverseOfPatches(spec.entity, [{ id: row.id, before: vars.before, versionAfter: row.version }])
        );
        await recordUndoStepSafely(qc, client, step, vars.ownerId);
        return row;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: PatchVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: spec.cacheKey(vars) });
      const removing = vars.patch.deleted_at != null;
      setRows(vars, (rows) =>
        removing ? rows.filter((r) => r.id !== vars.id) : rows.map((r) => (r.id === vars.id ? ({ ...r, ...vars.patch, pending: true } as WithPending<Row>) : r))
      );
    },
    onSuccess: (row: Row, vars: PatchVars) => {
      setRows(vars, (rows) => (row.deleted_at !== null ? rows.filter((r) => r.id !== row.id) : rows.map((r) => (r.id === row.id ? row : r))));
      // An entry change moves the holding's value and version on the server; a holding removal changes what its entries show.
      refreshHoldingReads(qc, cache(vars));
    },
    onError: async (err: unknown, vars: PatchVars) => {
      const cls = classifySettledWriteError(err);
      if (cls === 'conflict' && err instanceof VersionConflictError) {
        const serverRow = err.serverRow as Row | null;
        if (serverRow && typeof serverRow === 'object' && 'id' in serverRow) {
          setRows(vars, (rows) => (serverRow.deleted_at !== null ? rows.filter((r) => r.id !== vars.id) : rows.map((r) => (r.id === vars.id ? serverRow : r))));
        }
      }
      await parkFailure(spec.entity, vars.id, err, { labelKey: vars.label, fields: Object.keys(vars.patch) }, () => refreshHoldingReads(qc, cache(vars)));
    },
  });
}

export function registerGrowHoldingMutations(qc: QueryClient): void {
  registerAddHolding(qc);
  registerPatch<HoldingRow>(qc, mutationKeys.editHolding, {
    entity: 'holdings',
    cacheKey: (v) => queryKeys.holdings(v.ownerId, v.householdId),
    update: (client, id, expected, patch) => updateHolding(client, id, expected, patch as HoldingPatch),
  });
  registerAddHoldingLot(qc);
  registerPatch<HoldingLotRow>(qc, mutationKeys.editHoldingLot, {
    entity: 'holding_lots',
    cacheKey: (v) => queryKeys.holdingLots(v.ownerId, v.householdId),
    update: (client, id, expected, patch) => updateHoldingLot(client, id, expected, patch as HoldingLotPatch),
  });
  registerSetAccountRate(qc);
}

// ---------------------------------------------------------------------------------------------------------------------
// Add a holding
// ---------------------------------------------------------------------------------------------------------------------

export interface AddHoldingVars {
  ownerId: string;
  householdId: string;
  row: NewHolding;
  stepId: string;
}

function registerAddHolding(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.addHolding, {
    mutationFn: (vars: AddHoldingVars) =>
      guardSession(vars, async () => {
        const client = await writeClient();
        const row = await insertHolding(client, vars.row);
        const step = buildStep(vars.stepId, 'holdingAdded', { name: vars.row.name }, inverseOfInserts('holdings', [{ id: row.id, version: row.version }]));
        await recordUndoStepSafely(qc, client, step, vars.ownerId);
        return row;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: AddHoldingVars) => {
      markSession(vars);
      const key = queryKeys.holdings(vars.ownerId, vars.householdId);
      await qc.cancelQueries({ queryKey: key });
      const now = new Date().toISOString();
      const r = vars.row;
      const optimistic: WithPending<HoldingRow> = {
        id: r.id,
        household_id: r.household_id,
        created_by: vars.ownerId,
        updated_by: null,
        name: r.name,
        type: r.type,
        currency: r.currency,
        value: r.value,
        value_as_of: r.value_as_of,
        opening_put_in: r.opening_put_in ?? 0,
        account_id: r.account_id ?? null,
        paid_from_account_id: r.paid_from_account_id ?? null,
        monthly_amount: r.monthly_amount ?? null,
        day: r.day ?? null,
        rate: r.rate ?? null,
        is_sample: false,
        deleted_at: null,
        version: 1,
        created_at: now,
        updated_at: now,
        pending: true,
      };
      qc.setQueryData<HoldingList>(key, (old) => upsertRow(old ?? [], optimistic, 'end'));
    },
    onSuccess: (row: HoldingRow, vars: AddHoldingVars) => {
      qc.setQueryData<HoldingList>(queryKeys.holdings(vars.ownerId, vars.householdId), (old) => upsertRow(old ?? [], row, 'end'));
      // The database seeds the first value entry; read it back.
      refreshHoldingReads(qc, { userId: vars.ownerId, householdId: vars.householdId });
    },
    onError: async (err: unknown, vars: AddHoldingVars) => {
      const cls = classifySettledWriteError(err);
      if (cls === 'rejected' || cls === 'not-found') {
        qc.setQueryData<HoldingList>(queryKeys.holdings(vars.ownerId, vars.householdId), (old) => (old ?? []).filter((x) => x.id !== vars.row.id));
      }
      await parkFailure('holdings', vars.row.id, err, { labelKey: 'holdingAdded', fields: 1 }, () => undefined);
    },
  });
}

export interface AddHoldingInput {
  ownerId: string;
  householdId: string;
  name: string;
  type: HoldingType;
  currency: string;
  /** What it is worth now, minor units. */
  value: number;
  /** What was put in before the first entry, minor units. */
  openingPutIn: number;
  /** The date of `value`; defaults to today. */
  valueAsOf?: string;
  accountId?: string | null;
  paidFromAccountId?: string | null;
  monthlyAmount?: number | null;
  day?: number | null;
  /** Expected growth, a percent text such as "6.5". */
  rate?: string | null;
}

/** Add a holding (D-09). Returns the new id and the undo step id (Undo soft-deletes the holding). */
export function useAddHolding(): { add(input: AddHoldingInput): { id: string; stepId: string } } {
  const mutation = useMutation<HoldingRow, unknown, AddHoldingVars>({ mutationKey: mutationKeys.addHolding, scope: WRITE_SCOPE });
  return {
    add(input) {
      if (!validName(input.name)) throw new RangeError('add holding: name must be 1-80 characters');
      if (!HOLDING_TYPES.includes(input.type)) throw new RangeError('add holding: type must be one of the five');
      if (!/^[A-Z0-9]{2,4}$/.test(input.currency)) throw new RangeError('add holding: currency must be a code');
      if (!validMinor(input.value)) throw new RangeError('add holding: value out of range');
      if (!validMinor(input.openingPutIn)) throw new RangeError('add holding: put-in out of range');
      if (input.monthlyAmount != null && !validMinor(input.monthlyAmount)) throw new RangeError('add holding: monthly amount out of range');
      if (input.day != null && !(Number.isInteger(input.day) && input.day >= 1 && input.day <= 31)) throw new RangeError('add holding: day must be 1-31');
      if (input.rate != null && !validPercentText(input.rate)) throw new RangeError('add holding: rate must be a percent');
      const today = localDateIn(new Date(), getDeviceTimeZone());
      const asOf = input.valueAsOf ?? today;
      if (!DATE_RE.test(asOf)) throw new RangeError('add holding: malformed date');
      if (asOf > today) throw new RangeError('add holding: date is after today');
      const id = Crypto.randomUUID();
      const stepId = newStepId();
      const row: NewHolding = {
        id,
        household_id: input.householdId,
        name: input.name.trim(),
        type: input.type,
        currency: input.currency,
        value: input.value,
        value_as_of: asOf,
        opening_put_in: input.openingPutIn,
        account_id: input.accountId ?? null,
        paid_from_account_id: input.paidFromAccountId ?? null,
        monthly_amount: input.monthlyAmount ?? null,
        day: input.day ?? null,
        rate: input.rate ?? null,
      };
      mutation.mutate({ ownerId: input.ownerId, householdId: input.householdId, row, stepId });
      return { id, stepId };
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Edit or remove a holding
// ---------------------------------------------------------------------------------------------------------------------

export type EditHoldingFields = Partial<
  Pick<HoldingRow, 'name' | 'type' | 'opening_put_in' | 'account_id' | 'paid_from_account_id' | 'monthly_amount' | 'day' | 'rate'>
>;
const EDIT_HOLDING_KEYS = ['name', 'type', 'opening_put_in', 'account_id', 'paid_from_account_id', 'monthly_amount', 'day', 'rate'] as const;

export function useEditHolding(): {
  edit(holding: HoldingRow, fields: EditHoldingFields, ownerId: string, lots?: readonly HoldingLotRow[]): string;
  remove(holding: HoldingRow, ownerId: string): string;
} {
  const mutation = useMutation<HoldingRow, unknown, PatchVars>({ mutationKey: mutationKeys.editHolding, scope: WRITE_SCOPE });
  const send = (holding: HoldingRow, patch: Record<string, PatchValue>, label: UndoLabelKey, ownerId: string): string => {
    const before: Record<string, PatchValue> = {};
    for (const k of Object.keys(patch)) before[k] = ((holding as unknown as Record<string, PatchValue | undefined>)[k] ?? null) as PatchValue;
    const stepId = newStepId();
    mutation.mutate({
      id: holding.id,
      ownerId,
      householdId: holding.household_id,
      expectedVersion: holding.version,
      patch,
      before,
      label,
      name: typeof patch.name === 'string' ? patch.name : holding.name,
      stepId,
    });
    return stepId;
  };
  return {
    edit(holding, fields, ownerId, lots) {
      const keys = Object.keys(fields);
      if (keys.length === 0) throw new RangeError('edit holding: empty patch');
      for (const k of keys) {
        if (!(EDIT_HOLDING_KEYS as readonly string[]).includes(k)) throw new RangeError(`edit holding: ${k} is not editable here`);
      }
      if (fields.name !== undefined && !validName(fields.name)) throw new RangeError('edit holding: name must be 1-80 characters');
      if (fields.type !== undefined && !HOLDING_TYPES.includes(fields.type)) throw new RangeError('edit holding: type must be one of the five');
      if (fields.opening_put_in !== undefined && !validMinor(fields.opening_put_in)) throw new RangeError('edit holding: put-in out of range');
      if (fields.monthly_amount != null && !validMinor(fields.monthly_amount)) throw new RangeError('edit holding: monthly amount out of range');
      if (fields.day != null && !(Number.isInteger(fields.day) && fields.day >= 1 && fields.day <= 31)) throw new RangeError('edit holding: day must be 1-31');
      if (fields.rate != null && !validPercentText(fields.rate)) throw new RangeError('edit holding: rate must be a percent');
      if (fields.opening_put_in !== undefined && lots !== undefined) {
        const err = lotsReplayError({ opening_put_in: fields.opening_put_in, value: holding.value }, lots);
        if (err !== null) throw new RangeError(err);
      }
      const patch: Record<string, PatchValue> = { ...(fields as Record<string, PatchValue>) };
      if (fields.name !== undefined) patch.name = fields.name.trim();
      return send(holding, patch, 'holdingEdited', ownerId);
    },
    remove(holding, ownerId) {
      if (holding.deleted_at !== null) throw new RangeError('remove holding: already removed');
      return send(holding, { deleted_at: new Date().toISOString() }, 'holdingRemoved', ownerId);
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Entries: buy, sell, dividend, fee, value
// ---------------------------------------------------------------------------------------------------------------------

export interface AddHoldingLotVars {
  ownerId: string;
  householdId: string;
  row: NewHoldingLot;
  label: 'holdingEntryAdded' | 'holdingValueUpdated';
  /** The holding's name, for the Undo wording. */
  name: string;
  stepId: string;
}

function registerAddHoldingLot(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.addHoldingLot, {
    mutationFn: (vars: AddHoldingLotVars) =>
      guardSession(vars, async () => {
        const client = await writeClient();
        const row = await insertHoldingLot(client, vars.row);
        const step = buildStep(vars.stepId, vars.label, { name: vars.name }, inverseOfInserts('holding_lots', [{ id: row.id, version: row.version }]));
        await recordUndoStepSafely(qc, client, step, vars.ownerId);
        return row;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: AddHoldingLotVars) => {
      markSession(vars);
      const lotsKey = queryKeys.holdingLots(vars.ownerId, vars.householdId);
      const holdingsKey = queryKeys.holdings(vars.ownerId, vars.householdId);
      await qc.cancelQueries({ queryKey: lotsKey });
      await qc.cancelQueries({ queryKey: holdingsKey });
      const now = new Date().toISOString();
      const r = vars.row;
      const optimistic: WithPending<HoldingLotRow> = {
        id: r.id,
        holding_id: r.holding_id,
        household_id: r.household_id,
        created_by: vars.ownerId,
        updated_by: null,
        kind: r.kind,
        amount: r.amount,
        units: r.units ?? null,
        local_date: r.local_date,
        note: r.note ?? null,
        is_sample: false,
        deleted_at: null,
        version: 1,
        created_at: now,
        updated_at: now,
        pending: true,
      };
      qc.setQueryData<LotList>(lotsKey, (old) => upsertRow(old ?? [], optimistic, 'end'));
      if (r.kind === 'value') {
        // The server moves the holding's value to the latest value entry; show it at once.
        qc.setQueryData<HoldingList>(holdingsKey, (old) =>
          (old ?? []).map((h) => (h.id === r.holding_id && r.local_date >= h.value_as_of ? { ...h, value: r.amount, value_as_of: r.local_date, pending: true } : h))
        );
      }
    },
    onSuccess: (row: HoldingLotRow, vars: AddHoldingLotVars) => {
      qc.setQueryData<LotList>(queryKeys.holdingLots(vars.ownerId, vars.householdId), (old) => upsertRow(old ?? [], row, 'end'));
      refreshHoldingReads(qc, { userId: vars.ownerId, householdId: vars.householdId });
    },
    onError: async (err: unknown, vars: AddHoldingLotVars) => {
      const cls = classifySettledWriteError(err);
      if (cls === 'rejected' || cls === 'not-found') {
        qc.setQueryData<LotList>(queryKeys.holdingLots(vars.ownerId, vars.householdId), (old) => (old ?? []).filter((x) => x.id !== vars.row.id));
      }
      await parkFailure('holding_lots', vars.row.id, err, { labelKey: vars.label, fields: 1 }, () =>
        refreshHoldingReads(qc, { userId: vars.ownerId, householdId: vars.householdId })
      );
    },
  });
}

export interface AddHoldingLotInput {
  ownerId: string;
  holding: HoldingRow;
  /** The holding's current entries, to check a sale against the units held. */
  lots: readonly HoldingLotRow[];
  kind: HoldingLotKind;
  /** Minor units; for kind 'value' the new total value. */
  amount: number;
  /** Decimal text, up to 8 places. Buy and sell only. */
  units?: string | null;
  /** Local date; defaults to today and cannot be after it. */
  date?: string;
  note?: string | null;
}

function assertLotFields(f: { kind?: HoldingLotKind; amount?: number; units?: string | null; note?: string | null; date?: string }, where: string): void {
  if (f.amount !== undefined) {
    const min = f.kind === 'value' ? 0 : 1;
    if (!validMinor(f.amount) || f.amount < min) throw new RangeError(`${where}: amount out of range`);
  }
  if (f.units != null && !UNITS_RE.test(f.units)) throw new RangeError('bad-units');
  if (f.note != null && f.note.length > 200) throw new RangeError(`${where}: note is too long`);
  if (f.date !== undefined && !DATE_RE.test(f.date)) throw new RangeError(`${where}: malformed date`);
}

/**
 * Add an entry (D-12). A sale that takes out more units than were held is refused ('sell-exceeds-units'). Kind 'value' is the
 * "Update value" save. Returns the new id and the undo step id.
 */
export function useAddHoldingLot(): { add(input: AddHoldingLotInput): { id: string; stepId: string } } {
  const mutation = useMutation<HoldingLotRow, unknown, AddHoldingLotVars>({ mutationKey: mutationKeys.addHoldingLot, scope: WRITE_SCOPE });
  return {
    add(input) {
      const { holding } = input;
      if (!HOLDING_LOT_KINDS.includes(input.kind)) throw new RangeError('add entry: kind must be buy, sell, dividend, fee or value');
      assertLotFields({ kind: input.kind, amount: input.amount, units: input.units ?? null, note: input.note ?? null, ...(input.date !== undefined ? { date: input.date } : {}) }, 'add entry');
      if (input.units != null && input.kind !== 'buy' && input.kind !== 'sell') throw new RangeError('add entry: units are for a buy or a sale');
      const today = localDateIn(new Date(), getDeviceTimeZone());
      const date = input.date ?? today;
      if (date > today) throw new RangeError('add entry: date is after today');
      if (input.kind !== 'value') {
        const err = lotsReplayError(holding, [...input.lots, { kind: input.kind, amount: input.amount, units: input.units ?? null, local_date: date }]);
        if (err !== null) throw new RangeError(err);
      }
      const id = Crypto.randomUUID();
      const stepId = newStepId();
      const row: NewHoldingLot = {
        id,
        holding_id: holding.id,
        household_id: holding.household_id,
        kind: input.kind,
        amount: input.amount,
        units: input.units ?? null,
        local_date: date,
        note: input.note ?? null,
      };
      mutation.mutate({
        ownerId: input.ownerId,
        householdId: holding.household_id,
        row,
        label: input.kind === 'value' ? 'holdingValueUpdated' : 'holdingEntryAdded',
        name: holding.name,
        stepId,
      });
      return { id, stepId };
    },
  };
}

export type EditHoldingLotFields = Partial<Pick<HoldingLotRow, 'amount' | 'units' | 'local_date' | 'note'>>;
const EDIT_LOT_KEYS = ['amount', 'units', 'local_date', 'note'] as const;

/** Change or remove an entry. A change that would leave a sale larger than the units held is refused. */
export function useEditHoldingLot(): {
  edit(lot: HoldingLotRow, fields: EditHoldingLotFields, holding: HoldingRow, lots: readonly HoldingLotRow[], ownerId: string): string;
  remove(lot: HoldingLotRow, holding: HoldingRow, lots: readonly HoldingLotRow[], ownerId: string): string;
} {
  const mutation = useMutation<HoldingLotRow, unknown, PatchVars>({ mutationKey: mutationKeys.editHoldingLot, scope: WRITE_SCOPE });
  const send = (lot: HoldingLotRow, holding: HoldingRow, patch: Record<string, PatchValue>, label: UndoLabelKey, ownerId: string): string => {
    const before: Record<string, PatchValue> = {};
    for (const k of Object.keys(patch)) before[k] = ((lot as unknown as Record<string, PatchValue | undefined>)[k] ?? null) as PatchValue;
    const stepId = newStepId();
    mutation.mutate({
      id: lot.id,
      ownerId,
      householdId: lot.household_id,
      expectedVersion: lot.version,
      patch,
      before,
      label,
      name: holding.name,
      stepId,
    });
    return stepId;
  };
  return {
    edit(lot, fields, holding, lots, ownerId) {
      const keys = Object.keys(fields);
      if (keys.length === 0) throw new RangeError('edit entry: empty patch');
      for (const k of keys) {
        if (!(EDIT_LOT_KEYS as readonly string[]).includes(k)) throw new RangeError(`edit entry: ${k} is not editable here`);
      }
      assertLotFields({ kind: lot.kind, ...(fields.amount !== undefined ? { amount: fields.amount } : {}), units: fields.units ?? null, note: fields.note ?? null, ...(fields.local_date !== undefined ? { date: fields.local_date } : {}) }, 'edit entry');
      if (fields.units != null && lot.kind !== 'buy' && lot.kind !== 'sell') throw new RangeError('edit entry: units are for a buy or a sale');
      if (fields.local_date !== undefined && fields.local_date > localDateIn(new Date(), getDeviceTimeZone())) throw new RangeError('edit entry: date is after today');
      if (lot.kind !== 'value') {
        const next = lots.map((l) => (l.id === lot.id ? { ...l, ...fields } : l));
        const err = lotsReplayError(holding, next);
        if (err !== null) throw new RangeError(err);
      }
      return send(lot, holding, { ...(fields as Record<string, PatchValue>) }, 'holdingEntryEdited', ownerId);
    },
    remove(lot, holding, lots, ownerId) {
      if (lot.deleted_at !== null) throw new RangeError('remove entry: already removed');
      if (lot.kind !== 'value') {
        const err = lotsReplayError(holding, lots.filter((l) => l.id !== lot.id));
        if (err !== null) throw new RangeError(err);
      }
      return send(lot, holding, { deleted_at: new Date().toISOString() }, 'holdingEntryRemoved', ownerId);
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// An account's interest rate (GRW-11)
// ---------------------------------------------------------------------------------------------------------------------

export interface SetAccountRateVars {
  id: string;
  ownerId: string;
  householdId: string;
  expectedVersion: number;
  rate: string | null;
  before: string | null;
  name: string;
  stepId: string;
}

function registerSetAccountRate(qc: QueryClient): void {
  const patchAccounts = (householdId: string, fn: (rows: AccountList) => AccountList): void => {
    qc.setQueryData<AccountList>(queryKeys.accounts(householdId), (old) => fn(old ?? []));
  };
  qc.setMutationDefaults(mutationKeys.setAccountRate, {
    mutationFn: (vars: SetAccountRateVars) =>
      guardSession(vars, async () => {
        const expected = resolveExpectedVersion('accounts', vars.id, vars.expectedVersion);
        const client = await writeClient();
        const patch = { interest_rate: vars.rate };
        const row = await updateAccount(client, vars.id, expected, patch).catch((err: unknown) => acceptIfAlreadyApplied<AccountRow>(err, patch));
        recordWrittenVersion('accounts', vars.id, [vars.expectedVersion, expected], row.version);
        const step = buildStep(
          vars.stepId,
          'accountRateSaved',
          { name: vars.name },
          inverseOfPatches('accounts', [{ id: row.id, before: { interest_rate: vars.before }, versionAfter: row.version }])
        );
        await recordUndoStepSafely(qc, client, step, vars.ownerId);
        return row;
      }),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: SetAccountRateVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.accounts(vars.householdId) });
      patchAccounts(vars.householdId, (rows) => rows.map((r) => (r.id === vars.id ? { ...r, interest_rate: vars.rate, pending: true } : r)));
    },
    onSuccess: (row: AccountRow, vars: SetAccountRateVars) => {
      patchAccounts(vars.householdId, (rows) => rows.map((r) => (r.id === row.id ? row : r)));
    },
    onError: async (err: unknown, vars: SetAccountRateVars) => {
      const cls = classifySettledWriteError(err);
      if (cls === 'conflict' && err instanceof VersionConflictError && err.serverRow) {
        const serverRow = err.serverRow as AccountRow;
        patchAccounts(vars.householdId, (rows) => rows.map((r) => (r.id === vars.id ? serverRow : r)));
      }
      await parkFailure('accounts', vars.id, err, { labelKey: 'accountRateSaved', fields: 1 }, () =>
        void qc.invalidateQueries({ queryKey: queryKeys.accounts(vars.householdId) })
      );
    },
  });
}

/** Save an account's interest rate (APY) as a percent text, or clear it with null / empty. One Undo. Returns the step id. */
export function useSetAccountRate(): { set(account: AccountRow, rate: string | null, ownerId: string): string } {
  const mutation = useMutation<AccountRow, unknown, SetAccountRateVars>({ mutationKey: mutationKeys.setAccountRate, scope: WRITE_SCOPE });
  return {
    set(account, rate, ownerId) {
      const clean = rate === null || rate.trim() === '' ? null : rate.trim();
      if (clean !== null && !validPercentText(clean)) throw new RangeError('set account rate: rate must be a percent from 0 to 100');
      const stepId = newStepId();
      mutation.mutate({
        id: account.id,
        ownerId,
        householdId: account.household_id,
        expectedVersion: account.version,
        rate: clean,
        before: account.interest_rate ?? null,
        name: account.name,
        stepId,
      });
      return stepId;
    },
  };
}
