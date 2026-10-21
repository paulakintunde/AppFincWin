/**
 * 05-17 "What gets written" (D-09, D-10, D-11): one pure builder behind Step 5 and the Go ahead confirm sheet (05-29), so the
 * list the user reads is the list the write makes. It mirrors 05-20's buildGoAheadWrite branch for branch: the payment lines
 * follow `plan.paymentSteps` (D-45), the day-one cost is `plan.dayOne`, and the date is `needBy ?? today`. No React, no I/O;
 * the screen turns each CopyRef into text with `refText`.
 */
import type { Plan } from '@/engine/decide';
import { goalCopy } from '../copy/depthInputsCopy';
import { ref } from '../copy/types';
import type { CopyRef, Fmt } from '../copy/types';
import type { CheckComputation, CheckInputs } from '../snapshot/types';

export interface WrittenCtx {
  fmtWhole: Fmt;
  fmtExact: Fmt;
  formatDate: (isoDate: string) => string;
  /** 'YYYY-MM-DD': the date a payment is written for when "When you need it" is empty. */
  today: string;
  /** The cash account Go ahead writes to. */
  accountName: string;
  /** The card a card purchase goes on. */
  cardName: string;
  /** The tracked investment account a lump goes into, or null (a pending payment from the paying account). */
  investAccountName?: string | null;
  /**
   * CR-C03: whether the Transfer category is resolved. The write moves a lump into the investment account only with it, and
   * otherwise records a pending outflow from the paying account, so the list says the same.
   */
  transferCategoryAvailable: boolean;
  /** CR-C04: the recurring series the write actually ends (the replaced series it found); "closes N" counts only these. */
  endedSeriesIds: readonly string[];
}

/** The part of the context that depends on the write rather than the inputs; useCommitDecision resolves it for both lists. */
export type WrittenFacts = Pick<WrittenCtx, 'transferCategoryAvailable' | 'endedSeriesIds'>;

function resolvedPlan(inputs: CheckInputs, computation: CheckComputation): Plan | null {
  if (inputs.method === null) return null;
  const result = computation.methodPlans[inputs.method];
  return result !== undefined && result.status === 'resolved' ? result.plan : null;
}

function goLines(inputs: CheckInputs, computation: CheckComputation, plan: Plan, ctx: WrittenCtx): CopyRef[] {
  const out: CopyRef[] = [];
  const { fmtExact: exact } = ctx;
  const account = ctx.accountName;
  const length = (s: { fromMonth: number; toMonth: number }): number => s.toMonth - s.fromMonth + 1;
  const dated = ctx.formatDate(inputs.needBy ?? ctx.today);

  if (inputs.kind === 'invest') {
    if (inputs.method === 'monthly') {
      out.push(ref('decide.decision.writtenInvestMonthly', { amount: exact(plan.monthly), account, count: plan.months }));
    } else if (inputs.investAccountId !== null && ctx.investAccountName && ctx.transferCategoryAvailable) {
      out.push(ref('decide.decision.writtenInvestTransfer', { amount: exact(plan.dayOne), date: dated, account, to: ctx.investAccountName }));
    } else {
      out.push(ref('decide.decision.writtenInvestLump', { amount: exact(plan.dayOne), date: dated, account }));
    }
    out.push(ref('decide.decision.writtenUntouched'));
    return out;
  }

  switch (inputs.method) {
    case 'cash':
      out.push(ref('decide.decision.writtenCash', { amount: exact(plan.dayOne), date: dated, account }));
      break;
    case 'loan': {
      if (plan.dayOne > 0) out.push(ref('decide.decision.writtenDeposit', { amount: exact(plan.dayOne), date: dated, account }));
      const [first, ...later] = plan.paymentSteps;
      if (plan.financed > 0 && first !== undefined) {
        out.push(
          ref(inputs.loan.secured ? 'decide.decision.writtenLoanSecured' : 'decide.decision.writtenLoan', {
            amount: exact(plan.financed),
            apr: inputs.loan.aprText,
            payment: exact(first.amount),
            count: length(first),
          }),
        );
        for (const step of later) {
          out.push(
            length(step) >= 2
              ? ref('decide.decision.writtenLoanThen', { payment: exact(step.amount), count: length(step) })
              : ref('decide.decision.writtenLoanFinal', { payment: exact(step.amount), count: step.toMonth }),
          );
        }
      }
      break;
    }
    case 'instalment': {
      out.push(ref('decide.decision.writtenDeposit', { amount: exact(plan.dayOne), date: dated, account }));
      const first = plan.paymentSteps[0];
      if (first !== undefined) out.push(ref('decide.decision.writtenInstalment', { payment: exact(first.amount), count: length(first) }));
      break;
    }
    case 'card': {
      const card = plan.card;
      if (card !== null) {
        out.push(ref('decide.decision.writtenCard', { amount: exact(card.onCard), card: ctx.cardName }));
        const dayCash = card.remainderOnDay + card.fees;
        if (dayCash > 0) out.push(ref('decide.decision.writtenDeposit', { amount: exact(dayCash), date: dated, account }));
        if (inputs.card.payoff === 'months') {
          for (const step of plan.paymentSteps) {
            out.push(ref('decide.decision.writtenCardPayoff', { payment: exact(step.amount), count: length(step), card: ctx.cardName, account }));
          }
        }
      }
      break;
    }
    default:
      break;
  }

  const running = computation.running;
  if (running !== null && (running.countedCosts > 0 || running.countedReplaced > 0)) {
    const ended = new Set(ctx.endedSeriesIds);
    const closed = new Set(inputs.replaces.flatMap((l) => (l.counted && l.seriesId !== null && ended.has(l.seriesId) ? [l.seriesId] : []))).size;
    const net = running.net;
    out.push(
      ref('decide.decision.writtenRunning', {
        count: running.countedCosts,
        amount: net < 0 ? `−${exact(-net)}` : exact(net),
        closed,
      }),
    );
  }

  const verdict = computation.verdict;
  if (verdict !== null && verdict.state !== 'missing' && verdict.investingAfter < verdict.context.snapshot.monthlyInvesting) {
    out.push(ref('decide.decision.writtenInvestingDrops', { amount: exact(verdict.investingAfter) }));
  } else {
    out.push(ref('decide.decision.writtenUntouched'));
  }
  return out;
}

/** D-35: the cooling-off reminder is only set for a purchase whose size is 'needs_spreading' (the RPC applies the same rule, 05-20). */
function coolingApplies(inputs: CheckInputs, computation: CheckComputation): boolean {
  return inputs.coolingOff && computation.verdict !== null && computation.verdict.size === 'needs_spreading';
}

/** The lines for the chosen outcome; [] when nothing is chosen (or the plan has not resolved). */
export function writtenLines(inputs: CheckInputs, computation: CheckComputation, ctx: WrittenCtx): CopyRef[] {
  const lines = outcomeLines(inputs, computation, ctx);
  if (inputs.outcome !== null && coolingApplies(inputs, computation)) lines.push(ref('decide.depth.cooling.written'));
  return lines;
}

function outcomeLines(inputs: CheckInputs, computation: CheckComputation, ctx: WrittenCtx): CopyRef[] {
  switch (inputs.outcome) {
    case null:
      return [];
    case 'pass':
      return [
        ref('decide.decision.writtenPassKept'),
        ref('decide.decision.writtenPassNotSaving'),
        ref('decide.decision.writtenPassNoReminders'),
      ];
    case 'wait': {
      const wait = computation.waitPlan;
      const out: CopyRef[] = [];
      if (wait !== null && wait.readyBy !== null) {
        out.push(
          ref('decide.decision.writtenWaitTarget', { target: ctx.fmtExact(wait.target), amount: ctx.fmtExact(wait.monthlyAmount), date: ctx.formatDate(wait.readyBy) }),
        );
      }
      // D-34: the goal Wait creates, listed when it has a target (the RPC creates it on target > 0).
      if (wait !== null && wait.target > 0) {
        out.push(goalCopy({ target: wait.target, monthly_amount: wait.monthlyAmount, ready_by: wait.readyBy }, 0, ctx.fmtExact, ctx.formatDate).written);
      }
      if (wait !== null && wait.readyBy !== null) {
        out.push(ref('decide.decision.writtenWaitReminder', { date: ctx.formatDate(wait.readyBy) }));
      }
      out.push(ref('decide.decision.writtenWaitNoChange'), ref('decide.decision.writtenWaitKept'));
      return out;
    }
    case 'go': {
      const plan = resolvedPlan(inputs, computation);
      return plan === null ? [] : goLines(inputs, computation, plan, ctx);
    }
  }
}
