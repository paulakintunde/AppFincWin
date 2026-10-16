/**
 * The position a check is judged against (DEC-06, DEC-09): other open checks stacked first, then the worst of the next
 * 12 months under the user's future changes and the purchase's own lost income.
 *
 * D-41 and D-41 amended: the caller passes ALL other open checks; each is resolved to its plan and applied at its own
 * resolved purchase split (D-15, D-34: existing spending keeps the household share). The totals are sums, so they do not
 * depend on the order. A check whose plan or split is missing is reported as stacked with status missing and changes
 * nothing. D-30 still holds: the list is a per-call argument, never snapshot state.
 * D-32: a stacked monthly invest check joins investing and the pausable amount; a lump one leaves cash on day one (D-62).
 * D-61: a stacked check's day-one cost leaves cashAvailable, cashAfterBills and ledgerCash alike.
 * The stacked plans' monthly payments count in every one of the 12 months, even when a short plan would have ended
 * (the cautious reading).
 */
import type { MinorUnits } from '../money/types';
import { minorFromBigInt } from '../payoff/types';
import { isValidLocalDate, monthOf } from '../time/localDate';
import { CASH_PATH_DAYS } from './constants';
import { applyOutflows, purchaseFlows } from './cashPath';
import { assertCurrency } from './currency';
import { worstFutureMonth } from './futureChanges';
import { resolvePlan } from './plan';
import { defaultReserve } from './reserve';
import { SOLE_SHARE, myPart, resolveShare, type ResolvedShare } from './share';
import type {
  AssessContext,
  FutureChange,
  MissingReason,
  Position,
  PurchaseCheck,
  StackedCheck,
  StackedCheckInput,
} from './types';

const FN = 'positionContext';

function mi(value: bigint): MinorUnits {
  return minorFromBigInt(value, FN);
}

type ShareOutcome =
  | { readonly ok: true; readonly share: ResolvedShare }
  | { readonly ok: false; readonly reason: MissingReason };

function shareFor(context: AssessContext, input: StackedCheckInput, index: number): ShareOutcome {
  const scope = context.snapshot.scope;
  if (scope.kind === 'personal') {
    if (input.purchaseRule !== null) {
      throw new RangeError(`${FN}: other check ${index} has a purchaseRule but the scope is personal`);
    }
    return { ok: true, share: SOLE_SHARE };
  }
  if (input.purchaseRule === null) {
    throw new RangeError(`${FN}: other check ${index} needs a purchaseRule in a household`);
  }
  const resolved = resolveShare({ ...scope, rule: input.purchaseRule });
  return resolved.ok ? { ok: true, share: resolved.share } : { ok: false, reason: resolved.reason };
}

/** One other open check applied to the context (D-41). Never mutates; a missing check returns the context as it was. */
export function stackCheck(
  context: AssessContext,
  input: StackedCheckInput,
  index: number
): { readonly context: AssessContext; readonly stacked: StackedCheck } {
  const { snapshot, money } = context;
  const check = input.check;
  assertCurrency(snapshot.currency, check.currency, `other check ${index}`, FN);
  const missing = (reasons: readonly MissingReason[]) => ({
    context,
    stacked: { index, status: 'missing' as const, reasons, mineDayOne: mi(0n), mineMonthly: mi(0n) },
  });

  const shared = shareFor(context, input, index);
  if (!shared.ok) return missing([shared.reason]);
  const share = shared.share;
  const planResult = resolvePlan(check);
  if (planResult.status === 'missing') return missing(planResult.reasons);
  const plan = planResult.plan;

  const isBuy = check.kind === 'buy';
  const dayOne = BigInt(myPart(plan.dayOne, share));
  const monthly = BigInt(myPart(plan.monthly, share));
  const running = isBuy ? BigInt(myPart(check.runningCostsNet, share)) : 0n;
  const financed = isBuy ? BigInt(myPart(plan.financed, share)) : 0n;
  const monthlyCost = monthly + running;

  const monthCosts = mi(BigInt(context.monthCosts) + (isBuy ? monthlyCost : 0n));
  const newSnapshot = isBuy
    ? snapshot
    : { ...snapshot, monthlyInvesting: mi(BigInt(snapshot.monthlyInvesting) + monthly) };
  const reserve = snapshot.limits.reserve === null ? defaultReserve(monthCosts, money.steadiness) : null;

  const cashPath =
    context.cashPath === null
      ? null
      : applyOutflows(
          context.cashPath,
          purchaseFlows({
            plan,
            runningNet: isBuy ? check.runningCostsNet : mi(0n),
            share,
            asOf: snapshot.asOf,
            days: CASH_PATH_DAYS,
          })
        );

  const next: AssessContext = {
    ...context,
    snapshot: newSnapshot,
    mySpendingBasis: mi(BigInt(context.mySpendingBasis) + running),
    monthCosts,
    debtPayments: isBuy ? mi(BigInt(context.debtPayments) + monthly) : context.debtPayments,
    unsecuredDebt: mi(BigInt(context.unsecuredDebt) + financed),
    debtBalance: mi(BigInt(context.debtBalance) + financed),
    pausable: isBuy ? context.pausable : mi(BigInt(context.pausable) + monthly),
    leftBefore: mi(BigInt(context.leftBefore) - monthlyCost),
    leftThisMonth: mi(BigInt(context.leftThisMonth) - monthlyCost),
    cashAvailable: mi(BigInt(context.cashAvailable) - dayOne),
    cashAfterBills: mi(BigInt(context.cashAfterBills) - dayOne),
    ledgerCash: mi(BigInt(context.ledgerCash) - dayOne),
    limits: reserve === null ? context.limits : { ...context.limits, reserve },
    cashPath,
  };
  return {
    context: next,
    stacked: { index, status: 'applied', reasons: [], mineDayOne: mi(dayOne), mineMonthly: mi(monthly) },
  };
}

/**
 * D-45: applies the future changes to the month test (the worst of months 1..12 after asOf's month). It moves
 * monthIncome, mySpendingBasis and leftBefore; leftThisMonth is deliberately not replaced (D-36 sizes against this
 * month's money left over) and the debt-service income basis (money.incomeBasis) is untouched. Spending changes move
 * the month test only, never a month's costs or the cushion (D-02). Records what was applied in context.position.
 */
export function applyChanges(
  context: AssessContext,
  changes: readonly FutureChange[],
  stacked: readonly StackedCheck[],
  expectedIncomeIncluded: boolean
): AssessContext {
  const w = worstFutureMonth({
    asOf: context.snapshot.asOf,
    currency: context.snapshot.currency,
    monthIncome: context.monthIncome,
    monthSpending: context.mySpendingBasis,
    fixedOutgoings: mi(BigInt(context.debtPayments) + BigInt(context.pausable)),
    changes,
  });
  return {
    ...context,
    monthIncome: w.income,
    mySpendingBasis: w.spending,
    leftBefore: w.leftBefore,
    position: { stacked, changes, worstMonth: w, expectedIncomeIncluded },
  };
}

/** D-53: a buy check's purchase-linked income change as a D-45 change; null when the check carries none. */
function incomeChangeAsFutureChange(check: PurchaseCheck, id: string): FutureChange | null {
  if (check.kind !== 'buy' || check.incomeChange === undefined) return null;
  const { monthlyAmount, startDate } = check.incomeChange;
  if (!Number.isSafeInteger(monthlyAmount) || monthlyAmount === 0) {
    throw new RangeError(`${FN}: incomeChange monthlyAmount ${monthlyAmount} must be a non-zero integer`);
  }
  if (!isValidLocalDate(startDate)) {
    throw new RangeError(`${FN}: incomeChange startDate "${startDate}" is not a valid local date`);
  }
  return { id, kind: 'income', monthlyAmount, startMonth: monthOf(startDate), endMonth: null, currency: check.currency };
}

/**
 * The combined position (other open checks stacked, D-41) beside the standalone one (the same changes, no other
 * checks). D-53: the current check's negative income change is applied; a positive one only with includeExpectedIncome,
 * for the separate "with expected income" assessment. Negative changes of applied other checks join the combined
 * position only; positive ones never. Refuses a context that is already positioned, so checks cannot stack twice.
 */
export function positionContext(
  base: AssessContext,
  check: PurchaseCheck,
  otherChecks: readonly StackedCheckInput[],
  options: { readonly includeExpectedIncome?: boolean } = {}
): Position {
  if (base.position !== null) {
    throw new RangeError(`${FN}: context is already positioned`);
  }
  const includeExpected = options.includeExpectedIncome === true;
  const snapshotChanges = base.snapshot.futureChanges;

  const ownChange = incomeChangeAsFutureChange(check, 'purchase-income');
  const own: FutureChange[] = ownChange !== null && (ownChange.monthlyAmount < 0 || includeExpected) ? [ownChange] : [];
  const standalone = applyChanges(base, [...snapshotChanges, ...own], [], includeExpected);

  let ctx = base;
  const stacked: StackedCheck[] = [];
  const otherChanges: FutureChange[] = [];
  otherChecks.forEach((input, index) => {
    const r = stackCheck(ctx, input, index);
    ctx = r.context;
    stacked.push(r.stacked);
    if (r.stacked.status === 'applied') {
      const c = incomeChangeAsFutureChange(input.check, `other-${index}-income`);
      if (c !== null && c.monthlyAmount < 0) otherChanges.push(c);
    }
  });
  const combined = applyChanges(ctx, [...snapshotChanges, ...own, ...otherChanges], stacked, includeExpected);
  return { combined, standalone, stacked };
}
