import type { MinorUnits } from '../money/types';
import { divideHalfUp } from '../money/rounding';
import { ONE_HUNDRED_PERCENT, minorFromBigInt } from '../payoff';
import { monthOf } from '../time/localDate';
import { assertCurrency } from './currency';
import { SIMULATION_MONTH_CAP } from './constants';
import { assessPlan, prepareContext, purchaseSize } from './assess';
import { cashPathMargin } from './cashPath';
import { confidenceOf } from './confidence';
import { edgeMargin } from './margins';
import { paybackMonths } from './payback';
import { resolvePlan } from './plan';
import { positionContext } from './position';
import { stressTest } from './stress';
import type {
  AssessContext,
  Assessment,
  Decision,
  DecideSnapshot,
  ExpectedIncomeOutcome,
  LineMargin,
  MissingReason,
  PurchaseCheck,
  StackedCheckInput,
  Verdict,
  WorstMonthReport,
} from './types';

/**
 * The Decision report Phase 5 renders for one check (DEC-06): the verdict and everything that sits beside it, from
 * one call. Codes and numbers only (D-21); Phase 5 words them.
 *
 * D-41: the verdict is judged on the combined position (this check with every other open check stacked first) and
 * equals assess(snapshot, check, otherChecks); the standalone verdict is reported beside it when other checks were
 * passed, so Phase 5's toggle (05 D-24) can choose which to show. D-43: per-line margins with the on-the-edge flag.
 * D-45: the worst future month. D-49: variable-rate stress on the combined context. D-53: a positive purchase-linked
 * income change is assessed separately (`withExpectedIncome`) with its payback; the gain never enters `verdict`.
 * D-46: the confidence code lives on the verdict, so the Decision has one source for it.
 */
const FN = 'lineMargins';

function mi(value: bigint): MinorUnits {
  return minorFromBigInt(value, FN);
}

/**
 * D-43, D-33: the signed margin of every applicable line. Buy checks get month, cash, dsr (with an income basis of 0
 * too, ME-05), owe and inv; invest checks get month and cash only; the cash-path line is added when a path exists, on the
 * D-59 measure from cashPathMargin (failed by exactly the cash_dip shortfall, otherwise the room left before one
 * would fire). The verdict state is unchanged by any of it.
 */
export function lineMargins(a: Assessment, check: PurchaseCheck): readonly LineMargin[] {
  const ctx = a.context;
  const limits = ctx.limits;
  const mc = ctx.monthCosts;
  const out: LineMargin[] = [
    edgeMargin('month', a.left, mi(0n), mc),
    edgeMargin('cash', mi(BigInt(a.cashAfter) - BigInt(limits.reserve)), limits.reserve, mc),
  ];
  if (check.kind === 'buy') {
    // 04-REVIEW ME-05: the dsr line is reported with an income basis of 0 too; the line in money is then 0, so any debt
    // service fails it by its whole amount (assessPlan's dsr check agrees).
    const lineMoney = mi(divideHalfUp(limits.dsrLine * BigInt(ctx.money.incomeBasis), ONE_HUNDRED_PERCENT));
    out.push(edgeMargin('dsr', mi(BigInt(lineMoney) - BigInt(a.debtServiceAfter)), lineMoney, mc));
    out.push(
      edgeMargin(
        'owe',
        mi(BigInt(limits.unsecuredLine) - BigInt(a.unsecuredAfter)),
        limits.unsecuredLine,
        mc
      ),
      edgeMargin(
        'inv',
        mi(BigInt(a.investingAfter) - BigInt(limits.investingFloor)),
        limits.investingFloor,
        mc
      )
    );
  }
  if (a.cashPath.status === 'available') {
    const margin = cashPathMargin({
      lowestWith: a.cashPath.lowestWith.amount,
      lowestWithout: a.cashPath.lowestWithout.amount,
      reserve: limits.reserve,
      cashAfter: a.cashAfter,
      cashOnHand: ctx.cashAvailable,
    });
    out.push(edgeMargin('cash_path', margin, limits.reserve, mc));
  }
  return out;
}

function missingVerdict(
  reasons: readonly MissingReason[],
  context: AssessContext,
  check: PurchaseCheck
): Verdict {
  return {
    state: 'missing',
    reasons,
    size: purchaseSize(context, check.kind === 'buy' ? check.price : check.amount),
    confidence: confidenceOf({
      fullMonths: context.money.fullMonthsUsed,
      steadiness: context.money.steadiness,
      firstRead: false,
    }),
  };
}

export function decide(
  snapshot: DecideSnapshot,
  check: PurchaseCheck,
  otherChecks: readonly StackedCheckInput[] = []
): Decision {
  assertCurrency(snapshot.currency, check.currency, 'check', 'decide');
  const ctx = prepareContext(snapshot);
  const hasOthers = otherChecks.length > 0;
  if (!ctx.ok) {
    const verdict: Verdict = { state: 'missing', reasons: ctx.reasons, size: null, confidence: ctx.confidence };
    return {
      verdict,
      standalone: hasOthers ? verdict : null,
      combinedDiffers: false,
      stacked: [],
      worstMonth: null,
      margins: [],
      stress: [],
      withExpectedIncome: null,
    };
  }

  const planResult = resolvePlan(check);
  const pos = positionContext(ctx.context, check, otherChecks);
  if (planResult.status === 'missing') {
    return {
      verdict: missingVerdict(planResult.reasons, pos.combined, check),
      standalone: hasOthers ? missingVerdict(planResult.reasons, pos.standalone, check) : null,
      combinedDiffers: false,
      stacked: pos.stacked,
      worstMonth: null,
      margins: [],
      stress: [],
      withExpectedIncome: null,
    };
  }

  const plan = planResult.plan;
  const verdict = assessPlan(pos.combined, check, plan);
  const standalone = hasOthers ? assessPlan(pos.standalone, check, plan) : null;

  const w = pos.combined.position!.worstMonth;
  const deltaLeft = BigInt(w.incomeDelta) - BigInt(w.spendingDelta);
  const leftAfterNow = mi(BigInt(verdict.left) - deltaLeft);
  const worstMonth: WorstMonthReport = {
    month: w.month,
    offset: w.offset,
    leftAfter: verdict.left,
    leftAfterNow,
    shortfall: mi(verdict.left < 0 ? -BigInt(verdict.left) : 0n),
    differsFromNow: deltaLeft !== 0n,
  };

  let withExpectedIncome: ExpectedIncomeOutcome | null = null;
  if (check.kind === 'buy' && check.incomeChange !== undefined && check.incomeChange.monthlyAmount > 0) {
    const change = check.incomeChange;
    const posE = positionContext(ctx.context, check, otherChecks, { includeExpectedIncome: true });
    withExpectedIncome = {
      monthlyAmount: change.monthlyAmount,
      likelihood: change.likelihood,
      startMonth: monthOf(change.startDate),
      assessment: assessPlan(posE.combined, check, plan),
      payback: paybackMonths({
        asOf: snapshot.asOf,
        plan,
        runningNet: check.runningCostsNet,
        share: pos.combined.purchaseShare,
        change,
        horizonMonths: SIMULATION_MONTH_CAP,
      }),
    };
  }

  return {
    verdict,
    standalone,
    combinedDiffers: standalone !== null && standalone.state !== verdict.state,
    stacked: pos.stacked,
    worstMonth,
    margins: lineMargins(verdict, check),
    stress: stressTest(pos.combined, check),
    withExpectedIncome,
  };
}
