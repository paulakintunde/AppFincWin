// 05-20 (D-09): Go ahead = ONE record_decide_go call carrying the rows (client uuids) and the step id (replay key;
// 'already-applied' is success). WR-A02 (20261021000100): the server inserts the rows in the same transaction as the
// decision, so a refusal leaves nothing written. One undo step removes everything. Vars are JSON only.
//
// 06.1-36: the old Assessment path (buildGoAheadWrite, useGoAhead) is gone; goAheadInputOfV3 / useGoAheadV3 below are the only writers.
// A sample check's Go ahead writes ordinary, non-sample rows: once committed they are the user's own records.
import * as Crypto from 'expo-crypto';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { myShareOf, type Cadence, type CheckV2, type Evaluation, type RunningCostLine, type StoppedCost } from '@/engine/decide/v3';
import { addDays } from '@/engine/time/calendar';
import type { MinorUnits } from '@/engine/money/types';
import { buildTransferLegs } from '@/engine/transfer';
import { occurrenceDate } from '@/engine/recurring/schedule';
import type { RecurringFreq } from '@/engine/recurring/schedule';
import { monthOf } from '@/engine/time';
import type { CheckInputs } from '@/features/decide/snapshot/types';
import * as reminders from '@/features/decide/notifications/waitReminder';
import { getAnalytics } from '@/services/analytics';
import {
  DECIDE_GO_MAX_ROWS,
  DECIDE_GO_MAX_SERIES,
  recordDecideGo,
  type DecideGoDebt,
  type DecideGoDecision,
  type DecideGoEndSeries,
  type DecideGoGoalClose,
  type DecideGoPayoff,
  type DecideGoRow,
  type DecideGoSale,
  type DecideLinkRole,
} from '@/db/decideOutcomes';
import type { DecideCheckRow } from '@/db/decideChecks';
import type { NewRecurringSeries } from '@/db/recurringSeries';
import type { NewTransaction, RecurringSeriesRow } from '@/db/rows';
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
import { writeClient } from './writeClient';
import { optimisticTransactionRow } from './batchInsert';
import { newStepId } from './undoCapture';
import { runningCostBillOf } from './runningCostBills';
import { coolingOffAt } from './coolingOff';
import { invalidateDerivedReads, patchMonthCacheIfLoaded, placeRowInMonth } from './transactionCache';

export interface GoAheadWrite {
  /** 08.1-09 (D-10, D-11): only the parts the user ticked; null = not ticked, nothing written for it. */
  sale: DecideGoSale | null;
  payoff: DecideGoPayoff | null;
  goalClose: DecideGoGoalClose | null;
  rows: DecideGoRow[];
  series: NewRecurringSeries[];
  endSeries: DecideGoEndSeries[];
  debt: DecideGoDebt | null;
  decision: DecideGoDecision;
}

// WR-D11: every refusal goAheadInputOfV3 throws on purpose is recorded here, so a dry run can tell "this check cannot
// be written" from a programming error, which it reports instead of hiding.
const refusals = new WeakSet<Error>();
function refuse<E extends Error>(error: E): E {
  refusals.add(error);
  return error;
}
/** True for an error goAheadInputOfV3 threw to refuse a write (bad inputs or missing context), not a bug. */
export function isGoAheadRefusal(error: unknown): boolean {
  return error instanceof Error && refusals.has(error);
}


function assertSafeInteger(label: string, n: number): void {
  if (!Number.isSafeInteger(n)) throw refuse(new RangeError(`buildGoAheadWrite: ${label} is not a safe integer`));
}

export { coolingOffAt };

/** The persisted variables of a Go ahead (JSON only). */
export interface GoAheadVars {
  sale?: DecideGoSale | null;
  payoff?: DecideGoPayoff | null;
  goalClose?: DecideGoGoalClose | null;
  checkId: string;
  ownerId: string;
  householdId: string;
  homeCurrency: string;
  name: string;
  rows: DecideGoRow[];
  series: NewRecurringSeries[];
  endSeries: DecideGoEndSeries[];
  debt: DecideGoDebt | null;
  decision: DecideGoDecision;
  stepId: string;
}

type CheckList = WithPending<DecideCheckRow>[];

export function registerDecideGoAheadMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.decideGoAhead, {
    mutationFn: (vars: GoAheadVars) =>
      guardSession(vars, async () =>
        recordDecideGo(await writeClient(), {
          checkId: vars.checkId,
          rows: vars.rows,
          series: vars.series,
          endSeries: vars.endSeries,
          debt: vars.debt,
          decision: vars.decision,
          sale: vars.sale ?? null,
          payoff: vars.payoff ?? null,
          goalClose: vars.goalClose ?? null,
          undo: { id: vars.stepId, labelKey: 'decisionWritten', labelParams: { name: vars.name } },
        })
      ),
    scope: WRITE_SCOPE,
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelay,
    onMutate: async (vars: GoAheadVars) => {
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
    onSuccess: (_result: unknown, vars: GoAheadVars) => {
      void qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(vars.householdId) });
      void qc.invalidateQueries({ queryKey: queryKeys.recurringSeries(vars.householdId) });
      void qc.invalidateQueries({ queryKey: queryKeys.decideChecks(vars.ownerId, vars.householdId) });
      void qc.invalidateQueries({ queryKey: queryKeys.debts(vars.householdId) });
      void qc.invalidateQueries({ queryKey: queryKeys.decideLinks(vars.ownerId, vars.householdId) });
      if (vars.goalClose != null) void qc.invalidateQueries({ queryKey: queryKeys.savingsGoals(vars.ownerId, vars.householdId) });
      void qc.invalidateQueries({ queryKey: queryKeys.undoLog(vars.ownerId) });
      invalidateDerivedReads(qc, vars.householdId);
    },
    onError: async (err: unknown, vars: GoAheadVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return;
      // One transaction (WR-A02): a refusal wrote nothing, so the optimistic rows leave every loaded month.
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
      // The check stays open after a refusal, so the cooling-off reminder scheduled at tap time must not fire.
      void reminders.cancelCheckReminders(vars.checkId).catch(() => undefined);
      showToast({ kind: 'refusal', text: { key: 'decide.toast.outcomeFailed' } });
    },
  });
}


// ---- 06.1-13 (ARC-24): I bought it from a v3 check -------------------------------------------------------------------------

/** The part of a recorded bill the stop needs. */
export type StoppableSeries = Pick<RecurringSeriesRow, 'id' | 'version' | 'anchor_date' | 'end_date'>;

/**
 * 05.5-13 (ARC-23): the recorded bills a purchase's costs-that-stop end. One entry per bill, ending the day before the stop date
 * (the same end_date the Activity Stopped action writes, seriesStatusPatch) with end_reason 'stopped'. An everyday stop names no bill
 * and writes nothing (it lowers usual spending through the check's replaces). A bill that is not recorded, or already ended on or
 * before that day, is left alone. 08.1-09: the one place this is worked out (the Bought screen, the harness and the save all call it).
 */
export function endSeriesOf(stops: readonly StoppedCost[] | undefined, recorded: readonly StoppableSeries[] | undefined): DecideGoEndSeries[] {
  const out: DecideGoEndSeries[] = [];
  const seen = new Set<string>();
  for (const stop of stops ?? []) {
    if (stop.source.kind !== 'bill') continue;
    const id = stop.source.seriesId;
    if (seen.has(id)) continue;
    const series = recorded?.find((r) => r.id === id);
    if (series === undefined) continue;
    seen.add(id);
    let endDate = addDays(stop.stopDate, -1);
    if (endDate < series.anchor_date) endDate = series.anchor_date;
    if (series.end_date !== null && series.end_date <= endDate) continue;
    out.push({ id, expected_version: series.version, end_date: endDate, end_reason: 'stopped' });
  }
  return out;
}

/**
 * 08.1-09 (D-09..D-11): the parts of Record as bought the user ticked, each its own row on the screen. Anything not passed is not
 * written: the app applies nothing on its own (T-08.1-22).
 * - runningCosts: a fixed line becomes a bill (an exact series); a line that varies becomes an 'expected' series (D-09). Never a row.
 * - stops + recorded: the bills that end (endSeriesOf), end_reason 'stopped'.
 * - sale: the money in from selling the old one. payoff: the old loan's final payment (names the loan and the version the screen read).
 * - goalId: close the goal this check made (D-11).
 */
export interface GoAheadExtras {
  runningCosts?: readonly { readonly line: RunningCostLine; readonly name: string }[];
  stops?: readonly StoppedCost[];
  recorded?: readonly StoppableSeries[];
  sale?: { readonly amount: number; readonly name: string } | null;
  payoff?: { readonly amount: number; readonly name: string; readonly debtId: string; readonly version: number } | null;
  goalId?: string | null;
}

/** A leg's name is 1..200 characters on the server. */
function legName(name: string, fallback: string): string {
  const n = name.trim().slice(0, 200).trim();
  return n === '' ? fallback : n;
}

export interface GoAheadV3Context {
  householdId: string;
  /** The currency of the cash account. */
  currency: string;
  timeZone: string;
  /** 'YYYY-MM-DD': the household's today (the record context's, in its time zone). Rows on or before it are paid. */
  today: string;
  /**
   * 06.1-77 (DC-3, OQ-77-2 A): 'YYYY-MM-DD', the day it was bought, as the Bought screen shows it. Absent = today. A day after
   * today is held at today, so the day-one row is never a future, unpaid row. The planned purchase date is not used here.
   */
  date?: string;
  /** What the user calls the purchase; the check itself carries no name. */
  name: string;
  /** The Debt category, when the plan is a loan (payment series carry it); null otherwise. */
  debtCategoryId?: string | null;
  coolingOff?: boolean;
  mint: () => string;
}

/** The recurring frequency a plan cadence maps to, or null when the series machinery has no such frequency. */
function freqOfCadence(c: Cadence): RecurringFreq | null {
  if (c.unit === 'week') return c.every === 1 ? 'weekly' : c.every === 2 ? 'fortnightly' : null;
  return c.every === 1 ? 'monthly' : c.every === 3 ? 'quarterly' : c.every === 12 ? 'yearly' : null;
}

/** Date of the i-th payment on a cadence the recurring frequencies cannot express (every N weeks or months). */
function stepByCadence(first: string, c: Cadence, i: number): string {
  const base: RecurringFreq = c.unit === 'week' ? 'weekly' : 'monthly';
  let d = first;
  for (let k = 0; k < i * c.every; k++) d = occurrenceDate(d, base, 1);
  return d;
}

const DAY_MS = 86_400_000;
const utcDay = (d: string): number => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / DAY_MS;
/** 'YYYY-MM-DD' moved by a whole number of days (calendar days, no time zone involved). */
function shiftDays(d: string, days: number): string {
  return days === 0 ? d : new Date((utcDay(d) + days) * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Pure adapter (replaces the old Assessment input): the rows and series that "I bought it" writes for a v3 check, in the shape
 * recordDecideGo takes. Cash: one paid row of the whole price with tax and one-off fees (my share, exactly Purchase.whole)
 * on the bought date. Plan: the up-front part (Purchase.dayOne, my share) on the bought date, then the payments from the
 * first payment date, each my share of the lender's amount including the per-period and end fees. Running costs are NOT
 * written here: the user adds each as a bill by their own tap (APP-29). No debt row is made (Grow records debts).
 */
export function goAheadInputOfV3(check: CheckV2, evaluation: Evaluation, accountId: string, ctx: GoAheadV3Context, extras: GoAheadExtras = {}): GoAheadWrite {
  const purchase = evaluation.purchase;
  if (purchase === null) throw refuse(new TypeError('goAheadInputOfV3: the check has no purchase to write'));
  // 06.1-77 (DC-3): the date written and the today it is compared with come from the same clock (the caller's ctx).
  const date = ctx.date === undefined || ctx.date > ctx.today ? ctx.today : ctx.date;
  const name = ctx.name.trim();
  // 08.1-12 (D-12): a Household purchase is one shared line at its FULL amount; the share is applied only by Phase 8's readers (T-08.1-32).
  const shared = check.share.kind === 'household';
  const full = shared ? purchase.full : undefined;
  const wholeOf = full?.whole ?? purchase.whole;
  const dayOneOf = full?.dayOne ?? purchase.dayOne;

  const rows: DecideGoRow[] = [];
  const rowRoles: DecideLinkRole[] = [];
  const series: NewRecurringSeries[] = [];
  const seriesRoles: DecideLinkRole[] = [];

  const addRow = (amount: number, localDate: string, role: DecideLinkRole): void => {
    assertSafeInteger('a row amount', amount);
    rows.push({
      id: ctx.mint(),
      household_id: ctx.householdId,
      account_id: accountId,
      original_amount: amount,
      original_currency: ctx.currency,
      local_date: localDate,
      time_zone: ctx.timeZone,
      note: null,
      name,
      category_id: role === 'payment' && purchase.financed ? (ctx.debtCategoryId ?? null) : null,
      // 06.1-77 (DC-3), owner 2026-10-31: rows dated today or earlier are paid; later instalments stay pending.
      status: localDate <= ctx.today ? 'paid' : 'pending',
      // D-66 (WR-A06): the up-front money won't recur, so it is a one-off and stays out of later spending averages.
      ...(role === 'day_one' ? { one_off: true } : {}),
      ...(shared ? { is_shared: true as const } : {}),
    });
    rowRoles.push(role);
  };

  const sched = purchase.schedule;
  // 06.1-81 (review item 6): the schedule's first payment is spaced from today (the engine's day). A purchase the Bought screen
  // dates earlier moves the first payment back by the same number of days, so it keeps its spacing from the purchase; the rest
  // follow the plan's cadence from there. Rows on or before today are still written as paid (06.1-77).
  // Re-review A: only the kinds spaced from the purchase ('today', 'one_period') move. A 'deferred' first payment is a date the
  // user picked, so it keeps that date; moving it could mark payments that were never made as paid.
  const userPickedFirst = check.pay.mode === 'plan' && check.pay.firstPayment?.kind === 'deferred';
  const first = sched === null ? '' : userPickedFirst ? sched.firstDate : shiftDays(sched.firstDate, utcDay(date) - utcDay(ctx.today));
  if (check.pay.mode === 'once' || sched === null) {
    if (wholeOf > 0) addRow(-wholeOf, date, 'day_one');
  } else {
    if (dayOneOf > 0) addRow(-dayOneOf, date, 'day_one');
    const freq = freqOfCadence(sched.cadence);
    // A payment's amount on the lender's full schedule, with fees, then my share (types.ts SHARE CONVENTION).
    const mine = (amount: number): number => (shared ? amount : myShareOf(amount as MinorUnits, purchase.share));
    const regular = mine(sched.payment + sched.fees.perPeriod);
    const last = mine(sched.finalPayment + sched.fees.perPeriod + sched.fees.end);
    const n = sched.lastPaying;
    if (n >= 1) {
      const runOfRegular = regular === last ? n : n - 1;
      if (freq !== null) {
        if (runOfRegular >= 2) {
          assertSafeInteger('a series amount', regular);
          series.push({
            id: ctx.mint(),
            household_id: ctx.householdId,
            account_id: accountId,
            name,
            amount: -regular,
            currency: ctx.currency,
            category_id: purchase.financed ? (ctx.debtCategoryId ?? null) : null,
            payment_type: null,
            freq,
            anchor_date: first,
            time_zone: ctx.timeZone,
            end_date: null,
            occurrence_count: runOfRegular,
            ...(shared ? { is_shared: true } : {}),
          });
          seriesRoles.push('payment');
        } else if (runOfRegular === 1) {
          addRow(-regular, first, 'payment');
        }
        if (runOfRegular < n) addRow(-last, occurrenceDate(first, freq, runOfRegular), 'payment');
      } else {
        // A cadence the series machinery cannot repeat: one pending row per payment.
        for (let i = 0; i < n; i++) addRow(-(i === n - 1 ? last : regular), stepByCadence(first, sched.cadence, i), 'payment');
      }
    }
  }

  // 08.1-09 (D-09): each ticked running cost is one series. Fixed = a bill; varies = expected spending, never a transaction (T-08.1-20).
  for (const { line, name } of extras.runningCosts ?? []) {
    const bill = runningCostBillOf(line, ctx.name, check.categoryId, { householdId: ctx.householdId, accountId, currency: ctx.currency, timeZone: ctx.timeZone, label: name, mint: ctx.mint });
    if (bill === null) continue;
    const kinded = line.varies === true ? { ...bill, amount_kind: 'expected' as const } : bill;
    series.push(shared ? { ...kinded, is_shared: true } : kinded);
    seriesRoles.push('running_cost');
  }

  if (rows.length > DECIDE_GO_MAX_ROWS) {
    throw refuse(new RangeError(`goAheadInputOfV3: ${rows.length} rows is over ${DECIDE_GO_MAX_ROWS}`));
  }
  if (rows.length + series.length === 0) throw refuse(new RangeError('goAheadInputOfV3: nothing to write'));

  const decision: DecideGoDecision = {
    verdict: evaluation.result.legacyState,
    estimate_day_one: purchase.dayOne,
    estimate_monthly: purchase.monthly,
    estimate_monthly_payment: purchase.monthly - purchase.runningMonthly,
    estimate_running: purchase.runningMonthly,
    broke_line: evaluation.result.legacyState !== 'fits',
    cooling_off: ctx.coolingOff ?? false,
    row_roles: rowRoles,
    series_roles: seriesRoles,
  };
  if (series.length > DECIDE_GO_MAX_SERIES) throw refuse(new RangeError(`goAheadInputOfV3: ${series.length} series is over ${DECIDE_GO_MAX_SERIES}`));
  const endSeries = endSeriesOf(extras.stops, extras.recorded);
  if (endSeries.length > DECIDE_GO_MAX_SERIES) throw refuse(new RangeError(`goAheadInputOfV3: more than ${DECIDE_GO_MAX_SERIES} ended series`));

  // 08.1-09 (D-10): the sale money in and the old loan's payoff are legs of the same save. The sale names the loan too when the payoff
  // is ticked, so the two read as one sale that paid the loan off (the same pair Grow's "I sold it" writes).
  const leg = (amount: number, name: string, fallback: string) => {
    assertSafeInteger('a sale or payoff amount', amount);
    if (amount < 1) throw refuse(new RangeError('goAheadInputOfV3: a sale or payoff amount must be at least 1'));
    return { id: ctx.mint(), account_id: accountId, amount, currency: ctx.currency, local_date: date, time_zone: ctx.timeZone, name: legName(name, fallback) };
  };
  const payoff: DecideGoPayoff | null =
    extras.payoff == null ? null : { ...leg(extras.payoff.amount, extras.payoff.name, ctx.name), debt_id: extras.payoff.debtId, expected_version: extras.payoff.version };
  const sale: DecideGoSale | null =
    extras.sale == null
      ? null
      : { ...leg(extras.sale.amount, extras.sale.name, ctx.name), ...(payoff === null ? {} : { debt_id: payoff.debt_id, expected_version: payoff.expected_version }) };
  const goalClose: DecideGoGoalClose | null = extras.goalId == null ? null : { goal_id: extras.goalId };
  return { rows, series, endSeries, debt: null, decision, sale, payoff, goalClose };
}

export interface GoAheadV3Args {
  checkId: string;
  ownerId: string;
  homeCurrency: string;
  check: CheckV2;
  evaluation: Evaluation;
  accountId: string;
  ctx: GoAheadV3Context;
  /** 08.1-09: the ticked rows of the Bought screen; absent = just the purchase. */
  extras?: GoAheadExtras;
}

/** 06.1 ARC-24: "I bought it" on a v3 check: ONE record_decide_go call, one Undo. Returns the undo step id. */
export function useGoAheadV3(): { goAhead(args: GoAheadV3Args): string } {
  const qc = useQueryClient();
  const mutation = useMutation<unknown, unknown, GoAheadVars>({ mutationKey: mutationKeys.decideGoAhead, scope: WRITE_SCOPE });
  return {
    goAhead(args): string {
      const queued = qc
        .getMutationCache()
        .findAll({ mutationKey: mutationKeys.decideGoAhead, status: 'pending' })
        .map((m) => m.state.variables as GoAheadVars | undefined)
        .find((v) => v?.checkId === args.checkId);
      if (queued) return queued.stepId;
      const write = goAheadInputOfV3(args.check, args.evaluation, args.accountId, args.ctx, args.extras);
      const stepId = newStepId();
      mutation.mutate({
        checkId: args.checkId,
        ownerId: args.ownerId,
        householdId: args.ctx.householdId,
        homeCurrency: args.homeCurrency,
        name: args.ctx.name.trim(),
        rows: write.rows,
        series: write.series,
        endSeries: write.endSeries,
        debt: write.debt,
        decision: write.decision,
        sale: write.sale,
        payoff: write.payoff,
        goalClose: write.goalClose,
        stepId,
      });
      getAnalytics().track('decision_recorded', { decision: 'go' });
      return stepId;
    },
  };
}
