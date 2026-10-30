// 05.3 DSV-13 (P-01): Record as bought for v3. Built from Purchase and Result only; never imports decideGoAhead or the old engine.
// ONE record_decide_go call carries the rows (client uuids) and the step id (replay key; 'already-applied' is success).
// Household share: every written amount is MY part, through the engine's own share helper (myShareOf), so the day-one
// row equals Purchase.dayOne exactly. The schedule is on the full lender amount; each payment is shared once here.
import * as Crypto from 'expo-crypto';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { myShareOf } from '@/engine/decide/v3';
import type { Cadence, Purchase, Result } from '@/engine/decide/v3';
import type { MinorUnits } from '@/engine/money/types';
import { occurrenceDate } from '@/engine/recurring/schedule';
import type { RecurringFreq } from '@/engine/recurring/schedule';
import { monthOf } from '@/engine/time';
import { getAnalytics } from '@/services/analytics';
import { captureError } from '@/services/errors/errorReporter';
import {
  DECIDE_GO_MAX_ROWS,
  DECIDE_GO_MAX_SERIES,
  recordDecideGo,
  type DecideGoDebt,
  type DecideGoDecision,
  type DecideGoEndSeries,
  type DecideLinkRole,
} from '@/db/decideOutcomes';
import type { DecideCheckRow } from '@/db/decideChecks';
import type { NewRecurringSeries } from '@/db/recurringSeries';
import type { NewTransaction } from '@/db/rows';
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
import { showToast } from '@/state/undoToast';
import type { BoughtContext } from '@/features/decide/v3/record/recordMutations';
import { writeClient } from './writeClient';
import { optimisticTransactionRow } from './batchInsert';
import { newStepId } from './undoCapture';
import { invalidateDerivedReads, patchMonthCacheIfLoaded, placeRowInMonth } from './transactionCache';

export type { BoughtContext };

export interface BoughtWrite {
  rows: NewTransaction[];
  series: NewRecurringSeries[];
  endSeries: DecideGoEndSeries[];
  debt: DecideGoDebt | null;
  decision: DecideGoDecision;
}

// Every refusal buildBoughtWrite throws on purpose is recorded here, so a dry run can tell "cannot write" from a bug.
const refusals = new WeakSet<Error>();
function refuse<E extends Error>(error: E): E {
  refusals.add(error);
  return error;
}
/** True for an error buildBoughtWrite threw to refuse a write (bad inputs or missing context), not a bug. */
export function isBoughtRefusal(error: unknown): boolean {
  return error instanceof Error && refusals.has(error);
}

function assertSafeInteger(label: string, n: number): void {
  if (!Number.isSafeInteger(n)) throw refuse(new RangeError(`buildBoughtWrite: ${label} is not a safe integer`));
}

/** The recurring frequency an instalment cadence falls on; any other cadence cannot be written as a series. */
function freqOf(c: Cadence): RecurringFreq {
  if (c.unit === 'week' && c.every === 1) return 'weekly';
  if (c.unit === 'week' && c.every === 2) return 'fortnightly';
  if (c.unit === 'month' && c.every === 1) return 'monthly';
  if (c.unit === 'month' && c.every === 3) return 'quarterly';
  if (c.unit === 'month' && c.every === 12) return 'yearly';
  throw refuse(new RangeError('buildBoughtWrite: this payment cadence cannot be written as a recurring series'));
}

/** Pure: exactly the rows, series, debt and decision that Record as bought writes. */
export function buildBoughtWrite(args: {
  purchase: Purchase | null;
  result: Pick<Result, 'legacyState' | 'facts'>;
  ctx: BoughtContext;
  mint: () => string;
}): BoughtWrite {
  const { purchase, result, ctx, mint } = args;
  if (purchase === null) throw refuse(new TypeError('buildBoughtWrite: a purchase is required'));
  if (ctx.cashAccountId === null) throw refuse(new TypeError('buildBoughtWrite: cashAccountId is required'));
  const cashAccountId = ctx.cashAccountId;
  const name = ctx.name.trim();
  const mine = (n: number): number => myShareOf(n as MinorUnits, purchase.share);

  const rows: NewTransaction[] = [];
  const rowRoles: DecideLinkRole[] = [];
  const series: NewRecurringSeries[] = [];
  const seriesRoles: DecideLinkRole[] = [];
  let debt: DecideGoDebt | null = null;

  const addRow = (amount: number, date: string, role: DecideLinkRole, categoryId: string | null): void => {
    assertSafeInteger('a row amount', amount);
    rows.push({
      id: mint(),
      household_id: ctx.householdId,
      account_id: cashAccountId,
      original_amount: amount,
      original_currency: ctx.currency,
      local_date: date,
      time_zone: ctx.timeZone,
      note: null,
      name,
      category_id: categoryId,
      status: 'pending',
      // The day-one lump won't recur, so it is a one-off and stays out of later averages. Payment rows stay regular.
      ...(role === 'day_one' ? { one_off: true } : {}),
    });
    rowRoles.push(role);
  };

  const addSeries = (
    amount: number,
    anchor: string,
    count: number | null,
    categoryId: string | null,
    role: DecideLinkRole,
    freq: RecurringFreq
  ): string => {
    assertSafeInteger('a series amount', amount);
    const id = mint();
    series.push({
      id,
      household_id: ctx.householdId,
      account_id: cashAccountId,
      name,
      amount,
      currency: ctx.currency,
      category_id: categoryId,
      payment_type: null,
      freq,
      anchor_date: anchor,
      time_zone: ctx.timeZone,
      end_date: null,
      occurrence_count: count,
    });
    seriesRoles.push(role);
    return id;
  };

  if (purchase.dayOne > 0) addRow(-purchase.dayOne, ctx.today, 'day_one', purchase.categoryId);

  const schedule = purchase.schedule;
  let monthlyPayment = 0;
  if (purchase.financed && schedule !== null && schedule.financed > 0) {
    if (ctx.debtCategoryId === null) throw refuse(new TypeError('buildBoughtWrite: debtCategoryId is required'));
    const debtCategory = ctx.debtCategoryId;
    const freq = freqOf(schedule.cadence);
    const perPeriod = schedule.fees.perPeriod;
    const payAmt = mine(schedule.payment + perPeriod);
    const finalAmt = mine(schedule.finalPayment + perPeriod + schedule.fees.end);
    // A first payment dated today is already inside Purchase.dayOne (v3 section 4.5); the series starts at the second one.
    const skip = schedule.firstDate === ctx.today ? 1 : 0;
    const paying = schedule.lastPaying - skip;
    let firstSeriesId: string | null = null;
    if (paying > 0) {
      const sameFinal = finalAmt === payAmt;
      const level = sameFinal ? paying : paying - 1;
      if (level >= 2) {
        firstSeriesId = addSeries(-payAmt, occurrenceDate(schedule.firstDate, freq, skip), level, debtCategory, 'payment', freq);
      } else if (level === 1) {
        addRow(-payAmt, occurrenceDate(schedule.firstDate, freq, skip), 'payment', debtCategory);
      }
      if (!sameFinal) addRow(-finalAmt, occurrenceDate(schedule.firstDate, freq, skip + level), 'payment', debtCategory);
    }
    assertSafeInteger('the financed balance', schedule.financed);
    const apr = ctx.aprText ?? '';
    debt = {
      id: mint(),
      account_id: null,
      series_id: firstSeriesId,
      name,
      kind: 'loan',
      currency: ctx.currency,
      balance: mine(schedule.financed),
      apr: apr === '' ? null : apr,
      minimum_payment: payAmt,
      secured: purchase.secured,
      term_months: freq === 'monthly' ? schedule.count : null,
      start_date: schedule.firstDate,
    };
    monthlyPayment = mine(schedule.monthlyEquivalent);
  }

  if (purchase.runningMonthly > 0) {
    addSeries(
      -purchase.runningMonthly,
      ctx.today,
      null,
      ctx.runningCostCategoryId ?? purchase.categoryId,
      'running_cost',
      'monthly'
    );
  }

  if (rows.length > DECIDE_GO_MAX_ROWS) {
    throw refuse(new RangeError(`buildBoughtWrite: ${rows.length} rows is over ${DECIDE_GO_MAX_ROWS}`));
  }
  if (series.length > DECIDE_GO_MAX_SERIES) {
    throw refuse(new RangeError(`buildBoughtWrite: more than ${DECIDE_GO_MAX_SERIES} series`));
  }

  const decision: DecideGoDecision = {
    verdict: result.legacyState,
    estimate_day_one: purchase.dayOne,
    estimate_monthly: purchase.monthly,
    estimate_monthly_payment: monthlyPayment,
    estimate_running: purchase.runningMonthly,
    broke_line: result.facts.some((f) => f.code === 'line_crossed'),
    cooling_off: false,
    row_roles: rowRoles,
    series_roles: seriesRoles,
  };
  return { rows, series, endSeries: [], debt, decision };
}

/** The persisted variables of a Record as bought (JSON only). */
export interface BoughtVars {
  checkId: string;
  ownerId: string;
  householdId: string;
  homeCurrency: string;
  name: string;
  rows: NewTransaction[];
  series: NewRecurringSeries[];
  endSeries: DecideGoEndSeries[];
  debt: DecideGoDebt | null;
  decision: DecideGoDecision;
  stepId: string;
}

type CheckList = WithPending<DecideCheckRow>[];

export function registerRecordBoughtMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.recordBought, {
    mutationFn: (vars: BoughtVars) =>
      guardSession(vars, async () =>
        recordDecideGo(await writeClient(), {
          checkId: vars.checkId,
          rows: vars.rows,
          series: vars.series,
          endSeries: vars.endSeries,
          debt: vars.debt,
          decision: vars.decision,
          undo: { id: vars.stepId, labelKey: 'decisionWritten', labelParams: { name: vars.name } },
        })
      ),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: BoughtVars) => {
      markSession(vars);
      await qc.cancelQueries({ queryKey: queryKeys.decideChecks(vars.ownerId, vars.householdId) });
      const now = new Date().toISOString();
      for (const row of vars.rows) {
        placeRowInMonth(
          qc,
          vars.householdId,
          optimisticTransactionRow(qc, { ownerId: vars.ownerId, homeCurrency: vars.homeCurrency }, row, now),
          []
        );
      }
      qc.setQueryData<CheckList>(queryKeys.decideChecks(vars.ownerId, vars.householdId), (old) =>
        (old ?? []).map((r) =>
          r.id === vars.checkId
            ? {
                ...r,
                status: 'bought' as const,
                verdict_at_decision: vars.decision.verdict,
                estimate_day_one: vars.decision.estimate_day_one,
                estimate_monthly: vars.decision.estimate_monthly,
                broke_line: vars.decision.broke_line,
                pending: true,
              }
            : r
        )
      );
    },
    onSuccess: (_result: unknown, vars: BoughtVars) => {
      void qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(vars.householdId) });
      void qc.invalidateQueries({ queryKey: queryKeys.recurringSeries(vars.householdId) });
      void qc.invalidateQueries({ queryKey: queryKeys.decideChecks(vars.ownerId, vars.householdId) });
      void qc.invalidateQueries({ queryKey: queryKeys.debts(vars.householdId) });
      void qc.invalidateQueries({ queryKey: queryKeys.decideLinks(vars.ownerId, vars.householdId) });
      void qc.invalidateQueries({ queryKey: queryKeys.undoLog(vars.ownerId) });
      invalidateDerivedReads(qc, vars.householdId);
    },
    onError: async (err: unknown, vars: BoughtVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return;
      // One transaction: a refusal wrote nothing, so the optimistic rows leave every loaded month.
      const ids = new Set(vars.rows.map((r) => r.id));
      for (const month of new Set(vars.rows.map((r) => monthOf(r.local_date)))) {
        patchMonthCacheIfLoaded(qc, vars.householdId, month, (rows) => rows.filter((r) => !ids.has(r.id)));
      }
      void qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(vars.householdId) });
      void qc.invalidateQueries({ queryKey: queryKeys.decideChecks(vars.ownerId, vars.householdId) });
      void qc.invalidateQueries({ queryKey: queryKeys.recurringSeries(vars.householdId) });
      invalidateDerivedReads(qc, vars.householdId);
      // Ids and counts only: never names or amounts.
      await recordFailedWrite({
        entity: 'decide_checks',
        entityId: vars.checkId,
        kind: cls,
        code: settledWriteErrorCode(err),
        attempted: { checkId: vars.checkId, count: vars.rows.length },
      });
      showToast({ kind: 'refusal', text: { key: 'decide.toast.outcomeFailed' } });
    },
  });
}

export interface RecordBoughtArgs {
  check: DecideCheckRow;
  purchase: Purchase;
  result: Result;
  ctx: BoughtContext;
}

let dryRunId = 0;
const dryMint = (): string => `dry-run-${++dryRunId}`;

export function useRecordBought(): {
  /** Returns the undo step id (minted once so a paused-mutation replay reuses it), or null when nothing was sent. */
  record(args: RecordBoughtArgs): { stepId: string } | null;
  canRecord(args: { purchase: Purchase | null; result: Result; ctx: BoughtContext }): boolean;
} {
  const qc = useQueryClient();
  const mutation = useMutation<unknown, unknown, BoughtVars>({
    mutationKey: mutationKeys.recordBought,
    scope: WRITE_SCOPE,
  });

  return {
    record(args) {
      // A record for this check is already queued (double tap, or a tap while offline): send nothing more.
      const queued = qc
        .getMutationCache()
        .findAll({ mutationKey: mutationKeys.recordBought, status: 'pending' })
        .map((m) => m.state.variables as BoughtVars | undefined)
        .find((v) => v?.checkId === args.check.id);
      if (queued) return null;

      let write: BoughtWrite;
      try {
        write = buildBoughtWrite({
          purchase: args.purchase,
          result: args.result,
          ctx: args.ctx,
          mint: () => Crypto.randomUUID(),
        });
      } catch (error) {
        if (isBoughtRefusal(error)) return null;
        throw error;
      }
      const stepId = newStepId();
      mutation.mutate({
        checkId: args.check.id,
        ownerId: args.check.created_by,
        householdId: args.ctx.householdId,
        homeCurrency: args.ctx.currency,
        name: args.ctx.name.trim(),
        rows: write.rows,
        series: write.series,
        endSeries: write.endSeries,
        debt: write.debt,
        decision: write.decision,
        stepId,
      });
      getAnalytics().track('decide_recorded', { outcome: 'bought' });
      return { stepId };
    },
    canRecord(args) {
      try {
        buildBoughtWrite({ purchase: args.purchase, result: args.result, ctx: args.ctx, mint: dryMint });
        return true;
      } catch (error) {
        if (!isBoughtRefusal(error)) captureError(error, { area: 'ui' });
        return false;
      }
    },
  };
}
