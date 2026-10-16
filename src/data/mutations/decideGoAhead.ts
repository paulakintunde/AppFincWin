// 05-20 (D-09): Go ahead = rows inserted with client uuids, then record_decide_go with the same step id (replay key;
// 'already-applied' is success). One undo step removes everything. Vars are JSON only.
//
// buildGoAheadWrite is pure and mirrors 05-17's writtenLines branch for branch: the user reads exactly what is written.
// Payment lines come from Plan.paymentSteps (the source of truth, 04-05); their total is plan.total - plan.dayOne.
//
// Assumptions (D-09, iteration-3 checker, A21):
//  - A Go-ahead loan's debts row keeps the balance and minimum written on the day after its payment series ends; Phase 6
//    (debts) updates or closes it. Nothing here amortises it.
//  - A card paid over months is written as Debt-category expense series from the cash account (role 'payment'), not as
//    transfers into the card, so the card's derived balance does not fall as the payments run. Phase 6 reconciles it.
//  - A sample check's Go ahead writes ordinary, non-sample rows: once committed they are the user's own records.
import * as Crypto from 'expo-crypto';
import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import type { Assessment, PaymentStep, RunningCosts } from '@/engine/decide';
import { buildTransferLegs } from '@/engine/transfer';
import { occurrenceDate } from '@/engine/recurring/schedule';
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
  type DecideLinkRole,
} from '@/db/decideOutcomes';
import type { DecideCheckRow } from '@/db/decideChecks';
import type { NewRecurringSeries } from '@/db/recurringSeries';
import { IMPORT_CHUNK_MAX, insertTransactionsBatch } from '@/db/transactions';
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
import { writeClient } from './writeClient';
import { optimisticTransactionRow } from './batchInsert';
import { newStepId } from './undoCapture';
import { invalidateDerivedReads, patchMonthCacheIfLoaded, placeRowInMonth } from './transactionCache';

export interface GoAheadContext {
  householdId: string;
  /** The currency of the check (the cash account's). */
  currency: string;
  timeZone: string;
  /** 'YYYY-MM-DD': the date a line is written for when "When you need it" is empty. */
  today: string;
  cashAccountId: string;
  cardAccountId: string | null;
  debtCategoryId: string | null;
  savingsCategoryId: string | null;
  transferCategoryId: string | null;
  /** The tracked investment account a lump goes into, or null. */
  investAccount: { id: string; currency: string } | null;
  /** The recurring expenses the user said this purchase replaces, with the version to end them at. */
  replacedSeries: readonly { id: string; version: number }[];
}

export type GoAheadAssessment = Pick<
  Assessment,
  'state' | 'plan' | 'size' | 'mineDayOne' | 'mineMonthly' | 'mineRunning' | 'newMonthly'
>;

export interface GoAheadWrite {
  rows: NewTransaction[];
  series: NewRecurringSeries[];
  endSeries: DecideGoEndSeries[];
  debt: DecideGoDebt | null;
  decision: DecideGoDecision;
}

const runOf = (s: PaymentStep): number => s.toMonth - s.fromMonth + 1;

function assertSafeInteger(label: string, n: number): void {
  if (!Number.isSafeInteger(n)) throw new RangeError(`buildGoAheadWrite: ${label} is not a safe integer`);
}

/** Pure: exactly the rows, series, ended series, debt and decision that Go ahead writes. */
export function buildGoAheadWrite(args: {
  inputs: CheckInputs;
  assessment: GoAheadAssessment;
  running: RunningCosts | null;
  ctx: GoAheadContext;
  mint: () => string;
}): GoAheadWrite {
  const { inputs, assessment, running, ctx, mint } = args;
  const plan = assessment.plan;
  const start = inputs.needBy ?? ctx.today;
  const name = inputs.name.trim();

  const rows: NewTransaction[] = [];
  const rowRoles: DecideLinkRole[] = [];
  const series: NewRecurringSeries[] = [];
  const seriesRoles: DecideLinkRole[] = [];
  const endSeries: DecideGoEndSeries[] = [];
  let debt: DecideGoDebt | null = null;

  const addRow = (
    accountId: string,
    amount: number,
    date: string,
    role: DecideLinkRole,
    extra: Partial<NewTransaction> = {}
  ): void => {
    assertSafeInteger('a row amount', amount);
    rows.push({
      id: mint(),
      household_id: ctx.householdId,
      account_id: accountId,
      original_amount: amount,
      original_currency: ctx.currency,
      local_date: date,
      time_zone: ctx.timeZone,
      note: null,
      name,
      category_id: null,
      status: 'pending',
      ...extra,
    });
    rowRoles.push(role);
  };

  const addSeries = (
    accountId: string,
    amount: number,
    anchor: string,
    count: number | null,
    categoryId: string | null,
    role: DecideLinkRole,
    seriesName: string
  ): string => {
    assertSafeInteger('a series amount', amount);
    const id = mint();
    series.push({
      id,
      household_id: ctx.householdId,
      account_id: accountId,
      name: seriesName,
      amount,
      currency: ctx.currency,
      category_id: categoryId,
      payment_type: null,
      freq: 'monthly',
      anchor_date: anchor,
      time_zone: ctx.timeZone,
      end_date: null,
      occurrence_count: count,
    });
    seriesRoles.push(role);
    return id;
  };

  const needDebtCategory = (): string => {
    if (ctx.debtCategoryId === null) throw new TypeError('buildGoAheadWrite: debtCategoryId is required');
    return ctx.debtCategoryId;
  };

  /** A payment run: a series for two months or more, a single pending row for one month. Returns the series id or null. */
  const addPaymentRun = (step: PaymentStep, categoryId: string | null, rowCategory: string | null): string | null => {
    const first = occurrenceDate(start, 'monthly', step.fromMonth);
    const run = runOf(step);
    if (run >= 2) return addSeries(ctx.cashAccountId, -step.amount, first, run, categoryId, 'payment', name);
    addRow(ctx.cashAccountId, -step.amount, first, 'payment', { category_id: rowCategory });
    return null;
  };

  if (inputs.kind === 'invest') {
    if (inputs.method === 'monthly') {
      if (ctx.savingsCategoryId === null) throw new TypeError('buildGoAheadWrite: savingsCategoryId is required');
      addSeries(ctx.cashAccountId, -plan.monthly, start, plan.months, ctx.savingsCategoryId, 'payment', name);
    } else if (
      ctx.investAccount !== null &&
      ctx.investAccount.currency === ctx.currency &&
      ctx.transferCategoryId !== null
    ) {
      const built = buildTransferLegs({
        transferId: mint(),
        outId: mint(),
        inId: mint(),
        from: { id: ctx.cashAccountId, currency: ctx.currency },
        to: { id: ctx.investAccount.id, currency: ctx.investAccount.currency },
        amountOut: plan.dayOne,
        amountIn: plan.dayOne,
        localDate: start,
      });
      if (!built.ok) throw new TypeError(`buildGoAheadWrite: invalid transfer (${built.error})`);
      for (const leg of built.legs) {
        assertSafeInteger('a transfer leg', leg.amount);
        rows.push({
          id: leg.id,
          household_id: ctx.householdId,
          account_id: leg.accountId,
          original_amount: leg.amount,
          original_currency: leg.currency,
          local_date: leg.localDate,
          time_zone: ctx.timeZone,
          note: null,
          name,
          category_id: ctx.transferCategoryId,
          transfer_id: leg.transferId,
          status: 'pending',
        });
        rowRoles.push('day_one');
      }
    } else {
      addRow(ctx.cashAccountId, -plan.dayOne, start, 'day_one');
    }
  } else {
    switch (inputs.method) {
      case 'cash':
        addRow(ctx.cashAccountId, -plan.dayOne, start, 'day_one');
        break;
      case 'loan': {
        if (plan.dayOne > 0) addRow(ctx.cashAccountId, -plan.dayOne, start, 'day_one');
        if (plan.financed > 0 && plan.paymentSteps.length > 0) {
          const debtCategory = needDebtCategory();
          let firstSeriesId: string | null = null;
          for (const step of plan.paymentSteps) {
            const id = addPaymentRun(step, debtCategory, debtCategory);
            if (firstSeriesId === null) firstSeriesId = id;
          }
          assertSafeInteger('the financed balance', plan.financed);
          debt = {
            id: mint(),
            account_id: null,
            series_id: firstSeriesId,
            name,
            kind: 'loan',
            currency: ctx.currency,
            balance: plan.financed,
            apr: inputs.loan.aprText === '' ? null : inputs.loan.aprText,
            minimum_payment: plan.monthly,
            secured: inputs.loan.secured,
            // The term the user typed (05 D-45); plan.months is the months actually paid.
            term_months: inputs.loan.termMonths,
            start_date: start,
          };
        }
        break;
      }
      case 'instalment':
        if (plan.dayOne > 0) addRow(ctx.cashAccountId, -plan.dayOne, start, 'day_one');
        for (const step of plan.paymentSteps) addPaymentRun(step, null, null);
        break;
      case 'card': {
        const card = plan.card;
        if (card === null) throw new TypeError('buildGoAheadWrite: a card plan is required');
        if (ctx.cardAccountId === null) throw new TypeError('buildGoAheadWrite: cardAccountId is required');
        addRow(ctx.cardAccountId, -card.onCard, start, 'day_one');
        const dayCash = card.remainderOnDay + card.fees;
        if (dayCash > 0) addRow(ctx.cashAccountId, -dayCash, start, 'day_one');
        if (inputs.card.payoff === 'months') {
          const debtCategory = needDebtCategory();
          // Every run, including a run of 1, is a series with role 'payment' (a one-off pending Debt row would
          // be read as a loan's scheduled payment).
          for (const step of plan.paymentSteps) {
            addSeries(
              ctx.cashAccountId,
              -step.amount,
              occurrenceDate(start, 'monthly', step.fromMonth),
              runOf(step),
              debtCategory,
              'payment',
              name
            );
          }
        }
        break;
      }
      default:
        break;
    }

    if (running !== null) {
      for (const line of inputs.runningCosts) {
        if (!line.counted || line.amount <= 0) continue;
        addSeries(ctx.cashAccountId, -line.amount, start, null, null, 'running_cost', line.name.trim() || name);
      }
      for (const line of inputs.replaces) {
        if (!line.counted || line.seriesId === null) continue;
        const found = ctx.replacedSeries.find((s) => s.id === line.seriesId);
        // A series that is already gone has nothing left to end.
        if (found) endSeries.push({ id: found.id, expected_version: found.version, end_date: start });
      }
    }
  }

  if (rows.length > DECIDE_GO_MAX_ROWS) {
    throw new RangeError(`buildGoAheadWrite: ${rows.length} rows is over ${DECIDE_GO_MAX_ROWS}`);
  }
  if (series.length > DECIDE_GO_MAX_SERIES || endSeries.length > DECIDE_GO_MAX_SERIES) {
    throw new RangeError(`buildGoAheadWrite: more than ${DECIDE_GO_MAX_SERIES} series`);
  }

  const decision: DecideGoDecision = {
    verdict: assessment.state,
    estimate_day_one: assessment.mineDayOne,
    estimate_monthly: assessment.newMonthly,
    estimate_monthly_payment: assessment.mineMonthly,
    estimate_running: assessment.mineRunning,
    broke_line: assessment.state !== 'fits',
    cooling_off: inputs.coolingOff && assessment.size === 'needs_spreading',
    row_roles: rowRoles,
    series_roles: seriesRoles,
  };
  return { rows, series, endSeries, debt, decision };
}

/** The cooling-off reminder fires 48 hours after the decision. */
export function coolingOffAt(now: Date): string {
  return new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
}

/** The persisted variables of a Go ahead (JSON only). */
export interface GoAheadVars {
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

/**
 * Step ids whose rows are already inserted. The insert and record_decide_go are two requests, so a permanent refusal
 * of the second leaves committed rows without an undo step; onError reads this to tell that case from a refused insert.
 * In memory only: after a restart the replay re-runs the idempotent insert and re-adds the id.
 */
const rowsLanded = new Set<string>();

type CheckList = WithPending<DecideCheckRow>[];

export function registerDecideGoAheadMutations(qc: QueryClient): void {
  qc.setMutationDefaults(mutationKeys.decideGoAhead, {
    mutationFn: (vars: GoAheadVars) =>
      guardSession(vars, async () => {
        const client = await writeClient();
        for (let i = 0; i < vars.rows.length; i += IMPORT_CHUNK_MAX) {
          await insertTransactionsBatch(client, vars.rows.slice(i, i + IMPORT_CHUNK_MAX));
        }
        rowsLanded.add(vars.stepId);
        const result = await recordDecideGo(client, {
          checkId: vars.checkId,
          rowIds: vars.rows.map((r) => r.id),
          series: vars.series,
          endSeries: vars.endSeries,
          debt: vars.debt,
          decision: vars.decision,
          undo: { id: vars.stepId, labelKey: 'decisionWritten', labelParams: { name: vars.name } },
        });
        rowsLanded.delete(vars.stepId);
        return result;
      }),
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
      void qc.invalidateQueries({ queryKey: queryKeys.undoLog(vars.ownerId) });
      invalidateDerivedReads(qc, vars.householdId);
    },
    onError: async (err: unknown, vars: GoAheadVars) => {
      const cls = classifySettledWriteError(err);
      if (cls !== 'rejected' && cls !== 'not-found') return;
      const landed = rowsLanded.delete(vars.stepId);
      if (!landed) {
        const ids = new Set(vars.rows.map((r) => r.id));
        for (const month of new Set(vars.rows.map((r) => monthOf(r.local_date)))) {
          patchMonthCacheIfLoaded(qc, vars.householdId, month, (rows) => rows.filter((r) => !ids.has(r.id)));
        }
      }
      // Rows that landed before a refused RPC reappear from the server rather than vanish.
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
      showToast({ kind: 'refusal', text: { key: landed ? 'undo.batchSavedNoUndo' : 'undo.batchRefused' } });
    },
  });
}

export interface GoAheadArgs {
  checkId: string;
  ownerId: string;
  homeCurrency: string;
  inputs: CheckInputs;
  assessment: GoAheadAssessment;
  running: RunningCosts | null;
  ctx: GoAheadContext;
}

export function useGoAhead(): {
  /** Returns the undo step id, minted once so a paused-mutation replay reuses it. */
  goAhead(args: GoAheadArgs): string;
} {
  const mutation = useMutation<unknown, unknown, GoAheadVars>({
    mutationKey: mutationKeys.decideGoAhead,
    scope: WRITE_SCOPE,
  });

  return {
    goAhead(args): string {
      const write = buildGoAheadWrite({
        inputs: args.inputs,
        assessment: args.assessment,
        running: args.running,
        ctx: args.ctx,
        mint: () => Crypto.randomUUID(),
      });
      const stepId = newStepId();
      mutation.mutate({
        checkId: args.checkId,
        ownerId: args.ownerId,
        householdId: args.ctx.householdId,
        homeCurrency: args.homeCurrency,
        name: args.inputs.name.trim(),
        rows: write.rows,
        series: write.series,
        endSeries: write.endSeries,
        debt: write.debt,
        decision: write.decision,
        stepId,
      });
      getAnalytics().track('decision_recorded', { decision: 'go' });
      if (write.decision.cooling_off) {
        const now = new Date();
        void reminders.scheduleCoolingOffReminder(args.checkId, coolingOffAt(now), now).catch(() => undefined);
      }
      return stepId;
    },
  };
}
