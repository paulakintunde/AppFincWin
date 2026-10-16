/**
 * The verdict (DEC-06), a port of the prototype `dassess` as two layers: prepareContext resolves everything that does not
 * depend on the check, assessPlan computes the figures, the pause rule, the ordered warnings and the basis facts, and
 * assess composes them. Splitting the layers lets bisection, options, alternatives and setbacks re-assess cheaply.
 *
 * Defaults come from the user's own figures, never a currency constant (D-05): the reserve replaces the prototype's 6000
 * (D-01, D-42: a month's costs by steadiness; DEFAULT_RESERVE_MONTHS = 3 is the steady and short-history value), the
 * investing and saving floors replace 1000 and 500 (D-05: what the user already puts in each month).
 *
 * D-34: there are two shares. `resolveShare` on the scope is the purchase's per-check split; `resolveSpendingShare`
 * is my share of existing spending, bills and the cushion. The 2026-09-27 plan used one share for both, which was the
 * defect: overriding the purchase to `mine` must not change my share of rent and groceries.
 * D-24: confirmed quarterly/yearly bills due within 90 days come off cash. D-30: nothing about earlier checks is read.
 * D-61: with a cash path, scheduled outflows sit on their dates in the D-44 path (on or before asOf: day 0) and only
 * those dated on or before asOf reduce cashAvailable; without a path, too, only those dated on or before asOf reduce
 * cashAvailable, so a future-dated outflow is not in the `cash` check (it still reduces cashAfterBills, so it lowers
 * every spare-money figure). ledgerCash follows the same on-or-before-asOf rule with the D-24 bills always deducted (D-38).
 */
import type { MinorUnits } from '../money/types';
import { divideHalfUp } from '../money/rounding';
import { ONE_HUNDRED_PERCENT, ZERO_PERCENT, minorFromBigInt, percentFromScaled, type Percent } from '../payoff/types';
import { isValidLocalDate } from '../time/localDate';
import {
  BILLS_DUE_HORIZON_DAYS,
  CASH_PATH_DAYS,
  DEFAULT_DSR_LINE,
  DEFAULT_UNSECURED_INCOME_MULTIPLE,
  MONTHS_PER_YEAR,
  WARNING_ORDER,
} from './constants';
import { assertCurrency } from './currency';
import {
  applyOutflows,
  cashPathForSnapshot,
  cashPathReport,
  classifyCashDip,
  lowestPoint,
  purchaseFlows,
} from './cashPath';
import { confidenceOf } from './confidence';
import { deriveMoney, resolveSpendingShare, shareForCategory } from './money';
import { resolveProjectionRates } from './projectionRates';
import { defaultReserve, reserveHalfMonthsFor } from './reserve';
import { resolvePlan } from './plan';
import { positionContext } from './position';
import { isSecured } from './secured';
import { billsDueWithin, scheduledOutflowsDue } from './series';
import { SOLE_SHARE, myPart, resolveShare } from './share';
import type {
  AssessContext,
  Assessment,
  BasisCode,
  BasisFact,
  CashDipSeverity,
  ContextResult,
  DecideSnapshot,
  Ledger,
  LedgerDirection,
  MissingReason,
  MonthColumn,
  Plan,
  PurchaseCheck,
  PurchaseSize,
  ResolvedLimits,
  SpendingShare,
  StackedCheckInput,
  Verdict,
  Warning,
} from './types';

const FN = 'prepareContext';

function mi(value: bigint): MinorUnits {
  return minorFromBigInt(value, FN);
}

function assertNonNegative(value: number, what: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${FN}: ${what} ${value} must be a non-negative integer`);
  }
}

function validate(snapshot: DecideSnapshot): void {
  if (!isValidLocalDate(snapshot.asOf)) {
    throw new RangeError(`${FN}: asOf "${snapshot.asOf}" is not a valid local date`);
  }
  for (const d of snapshot.debts) {
    assertCurrency(snapshot.currency, d.currency, `debt ${d.id}`, FN);
    assertNonNegative(d.balance, `debt ${d.id} balance`);
    assertNonNegative(d.minimumPayment, `debt ${d.id} minimumPayment`);
  }
  for (const b of snapshot.bills) assertCurrency(snapshot.currency, b.currency, `bill ${b.seriesId}`, FN);
  for (const s of snapshot.incomeSeries) {
    assertCurrency(snapshot.currency, s.currency, `income series ${s.seriesId}`, FN);
  }
  for (const o of snapshot.scheduledOutflows) {
    assertCurrency(snapshot.currency, o.currency, `scheduled outflow ${o.id}`, FN);
  }
  assertNonNegative(snapshot.monthlySaving, 'monthlySaving');
  assertNonNegative(snapshot.monthlyInvesting, 'monthlyInvesting');
  const multiple = snapshot.limits.unsecuredIncomeMultiple;
  if (multiple !== null && (!Number.isSafeInteger(multiple) || multiple < 0)) {
    throw new RangeError(`${FN}: unsecuredIncomeMultiple ${multiple} must be a non-negative integer or null`);
  }
}

/** The debt with the highest APR among unsecured debts that have one; ties go to the smallest id (D-31 input, D-07). */
function highestUnsecuredApr(snapshot: DecideSnapshot): { readonly debtId: string; readonly apr: Percent } | null {
  let best: { readonly debtId: string; readonly apr: Percent } | null = null;
  for (const d of snapshot.debts) {
    if (isSecured(d) || d.apr === null) continue;
    if (best === null || d.apr > best.apr || (d.apr === best.apr && d.id < best.debtId)) {
      best = { debtId: d.id, apr: d.apr };
    }
  }
  return best;
}

export function prepareContext(snapshot: DecideSnapshot): ContextResult {
  validate(snapshot);
  const due = scheduledOutflowsDue(snapshot.scheduledOutflows, snapshot.asOf, BILLS_DUE_HORIZON_DAYS);
  const billsDueDetail = billsDueWithin(snapshot.bills, snapshot.asOf, BILLS_DUE_HORIZON_DAYS);

  // D-34: the purchase share and the existing-spending share are resolved separately.
  const purchase = resolveShare(snapshot.scope);
  const spending = resolveSpendingShare(snapshot.scope, snapshot.householdSpending);
  const spendingShare: SpendingShare = spending.ok ? spending.share : { byDefault: SOLE_SHARE, byCategory: [] };
  const moneyResult = deriveMoney({
    currency: snapshot.currency,
    months: snapshot.months,
    bills: snapshot.bills,
    incomeSeries: snapshot.incomeSeries,
    basisOverride: snapshot.basisOverride,
    spendingShare,
  });

  const reasons: MissingReason[] = [];
  const addReason = (r: MissingReason): void => {
    if (!reasons.includes(r)) reasons.push(r);
  };
  if (!moneyResult.ok) addReason(moneyResult.reason);
  if (!purchase.ok) addReason(purchase.reason);
  if (!spending.ok) addReason(spending.reason);
  if (!moneyResult.ok || !purchase.ok || !spending.ok) {
    // D-46: from the money basis whenever it resolved; rough only when there is no full month
    const confidence = moneyResult.ok
      ? confidenceOf({
          fullMonths: moneyResult.money.fullMonthsUsed,
          steadiness: moneyResult.money.steadiness,
          firstRead: false,
        })
      : confidenceOf({ fullMonths: 0, steadiness: null, firstRead: false });
    return { ok: false, reasons, confidence };
  }
  const money = moneyResult.money;
  const purchaseShare = purchase.share;

  let debtPayments = 0n;
  let debtBalance = 0n;
  let unsecuredDebt = 0n;
  for (const d of snapshot.debts) {
    debtPayments += BigInt(d.minimumPayment);
    debtBalance += BigInt(d.balance);
    if (!isSecured(d)) unsecuredDebt += BigInt(d.balance);
  }
  const monthCosts = mi(BigInt(money.spendingAverage) + debtPayments); // D-02
  const pausable = mi(BigInt(snapshot.monthlySaving) + BigInt(snapshot.monthlyInvesting)); // D-35, D-32
  const monthIncome = money.incomeBasis;
  const leftBefore = mi(BigInt(monthIncome) - BigInt(money.spendingBasis) - debtPayments - BigInt(pausable));

  let billsDue = 0n;
  for (const b of billsDueDetail) billsDue += BigInt(myPart(b.amount, shareForCategory(spendingShare, b.categoryId)));
  const cashOnHand = BigInt(snapshot.cashOnHand);
  const dueNow = BigInt(due.dueNow);
  const dueAhead = BigInt(due.dueAhead);

  const cashPath = cashPathForSnapshot({ snapshot, money, spendingShare, debtPayments: mi(debtPayments) });
  const ledgerCash = cashOnHand - billsDue - dueNow;
  const cashAvailable = cashPath === null ? ledgerCash : cashOnHand - dueNow;
  const cashAfterBills = ledgerCash - dueAhead;

  const limits = snapshot.limits;
  const resolved: ResolvedLimits = {
    reserve: limits.reserve ?? defaultReserve(monthCosts, money.steadiness),
    dsrLine: limits.dsrLine ?? DEFAULT_DSR_LINE,
    unsecuredLine: mi(
      BigInt(money.incomeAverage) * BigInt(limits.unsecuredIncomeMultiple ?? DEFAULT_UNSECURED_INCOME_MULTIPLE)
    ),
    investingFloor: limits.investingFloor ?? snapshot.monthlyInvesting,
    savingFloor: limits.savingFloor ?? snapshot.monthlySaving,
    spareFloor: limits.spareFloor ?? mi(0n),
    projectionReturn: snapshot.projectionReturn ?? ZERO_PERCENT,
    unsecuredIncomeMultiple: limits.unsecuredIncomeMultiple ?? DEFAULT_UNSECURED_INCOME_MULTIPLE,
    projectionRates: resolveProjectionRates(snapshot.projectionRates, FN),
    reserveHalfMonths: limits.reserve === null ? reserveHalfMonthsFor(money.steadiness) : null,
  };

  return {
    ok: true,
    context: {
      snapshot,
      money,
      purchaseShare,
      spendingShare,
      limits: resolved,
      mySpendingBasis: money.spendingBasis,
      monthCosts,
      debtPayments: mi(debtPayments),
      unsecuredDebt: mi(unsecuredDebt),
      debtBalance: mi(debtBalance),
      annualIncome: mi(BigInt(money.incomeAverage) * BigInt(MONTHS_PER_YEAR)),
      pausable,
      leftBefore,
      leftThisMonth: leftBefore,
      billsDue: mi(billsDue),
      billsDueDetail,
      outflowsDueNow: due.dueNow,
      outflowsDueAhead: due.dueAhead,
      cashAvailable: mi(cashAvailable),
      cashAfterBills: mi(cashAfterBills),
      ledgerCash: mi(ledgerCash),
      highestUnsecuredApr: highestUnsecuredApr(snapshot),
      monthIncome,
      cashPath,
      position: null,
    },
  };
}

// ── assessPlan ──

const AFN = 'assessPlan';

function am(value: bigint): MinorUnits {
  return minorFromBigInt(value, AFN);
}

function priceOf(check: PurchaseCheck): MinorUnits {
  return check.kind === 'buy' ? check.price : check.amount;
}

/**
 * D-36: the size of the purchase against the user's own money, judged as if the price were paid in cash whatever the
 * payment method (the plan's dayOne and monthly are deliberately not read). My part of the price is compared with this
 * month's money left over (leftThisMonth, never the D-45 worst month), then with cash above the cushion after paying it
 * (cashAvailable follows the `cash` check's D-24/D-44 amended rule). There are no currency thresholds (D-05); in a
 * household my part is myPart(price, purchaseShare), the reading consistent with the two shares (D-34).
 */
export function purchaseSize(context: AssessContext, price: MinorUnits): PurchaseSize {
  const mine = myPart(price, context.purchaseShare);
  if (mine <= context.leftThisMonth) return 'from_spare_this_month';
  return context.cashAvailable - mine >= context.limits.reserve ? 'from_savings' : 'needs_spreading';
}

function compareWarnings(a: Warning, b: Warning): number {
  return b.shortfall - a.shortfall || WARNING_ORDER.indexOf(a.code) - WARNING_ORDER.indexOf(b.code);
}

function direction(worse: boolean, better: boolean): LedgerDirection {
  return worse ? 'worse' : better ? 'better' : 'same';
}

/**
 * Everything that depends on the check (DEC-06). Codes and numbers only (D-21).
 *
 * D-35: saving and investing are pausable, investing first. A shortfall within pausable is at most `adjust`, with `inv`
 * carrying the amount to pause (reported even when the pause stays above the D-05 floors); beyond pausable the state is
 * `no` and `month` carries what remains. The prototype let `inv` only duplicate `month` alongside `no`; the code now
 * covers saving too and Phase 5 words it.
 * D-33: the D-35 relief does not apply to invest checks (pausing old investing to fund new investing is circular; a
 * reading recorded in 04-REPLAN-NOTES.md). Invest checks never emit `inv` or debt-line warnings; `month` carries the
 * whole shortfall.
 * D-24: the `cash` check reads cashAvailable; the deducted bills reach spare money through cashAfterBills.
 * Equal shortfalls are ordered by WARNING_ORDER (month, cash, cash_dip, dsr, owe, inv).
 * D-38: the month table is pre-pause so its rows add up; the pause is reported through `inv`, investingAtRisk and
 * savingAtRisk. Cash Now is context.ledgerCash and Cash After ledgerCashAfterPurchase (D-38, D-24, D-61), not the
 * path-aware cashAvailable and not the spare-money cashAfterBills. D-21: the direction is a code.
 * D-31: on invest checks the highest unsecured APR above the projection return is a neutral fact, never a warning.
 * D-62: newMonthly = mineMonthly + mineRunning exactly.
 */
export function assessPlan(context: AssessContext, check: PurchaseCheck, plan: Plan): Assessment {
  const { snapshot, money, limits } = context;
  const isInvest = check.kind === 'invest';
  const p = context.purchaseShare;
  const incomeBasis = money.incomeBasis;

  const mineDayOne = myPart(plan.dayOne, p);
  const mineMonthly = myPart(plan.monthly, p);
  const mineRunning = check.kind === 'buy' ? myPart(check.runningCostsNet, p) : am(0n);
  const newMonthly = am(BigInt(mineMonthly) + BigInt(mineRunning)); // mineMonthly + mineRunning (D-62)
  const left = am(BigInt(context.leftBefore) - BigInt(newMonthly));
  const cashAfter = am(BigInt(context.cashAvailable) - BigInt(mineDayOne));
  const cashAfterBillsAndPurchase = am(BigInt(context.cashAfterBills) - BigInt(mineDayOne));
  const ledgerCashAfterPurchase = am(BigInt(context.ledgerCash) - BigInt(mineDayOne));

  // Debt lines apply to buy checks only (D-33).
  const debtServiceAfter = am(BigInt(context.debtPayments) + (isInvest ? 0n : BigInt(mineMonthly)));
  const dsrLine = limits.dsrLine;
  const dsrBreach =
    !isInvest && incomeBasis > 0 && BigInt(debtServiceAfter) * ONE_HUNDRED_PERCENT > dsrLine * BigInt(incomeBasis);
  const financedMine = isInvest ? 0n : BigInt(myPart(plan.financed, p));
  const unsecuredAfter = am(BigInt(context.unsecuredDebt) + financedMine);
  const oweBreach = !isInvest && unsecuredAfter > limits.unsecuredLine;

  // Pause (D-35).
  const shortfall = left < 0 ? -left : 0;
  const investingAtRisk = Math.min(snapshot.monthlyInvesting, shortfall);
  const savingAtRisk = Math.min(snapshot.monthlySaving, shortfall - investingAtRisk);
  const pauseNeeded = investingAtRisk + savingAtRisk;
  const investingAfter = snapshot.monthlyInvesting - investingAtRisk;
  const savingAfter = snapshot.monthlySaving - savingAtRisk;
  const remainingShortfall = isInvest ? shortfall : shortfall - pauseNeeded;

  // D-44: the path with the purchase, and the dip it causes or deepens (D-59).
  const withPath =
    context.cashPath === null
      ? null
      : applyOutflows(
          context.cashPath,
          purchaseFlows({
            plan,
            runningNet: check.kind === 'buy' ? check.runningCostsNet : am(0n),
            share: p,
            asOf: snapshot.asOf,
            days: CASH_PATH_DAYS,
          })
        );
  const cashPath = cashPathReport(context.cashPath, withPath, limits.reserve);
  const dip =
    withPath === null || context.cashPath === null
      ? null
      : classifyCashDip({
          lowestWith: lowestPoint(withPath).amount,
          lowestWithout: lowestPoint(context.cashPath).amount,
          reserve: limits.reserve,
          cashAfter,
          cashOnHand: context.cashAvailable,
        });
  const cashDip: CashDipSeverity | null = dip === null ? null : dip.severity;

  const warnings: Warning[] = [];
  if (remainingShortfall > 0) warnings.push({ code: 'month', shortfall: am(BigInt(remainingShortfall)) });
  if (cashAfter < limits.reserve) {
    warnings.push({ code: 'cash', shortfall: am(BigInt(limits.reserve) - BigInt(cashAfter)) });
  }
  if (dip !== null) warnings.push({ code: 'cash_dip', shortfall: dip.shortfall });
  if (dsrBreach) {
    const line = divideHalfUp(dsrLine * BigInt(incomeBasis), ONE_HUNDRED_PERCENT);
    warnings.push({ code: 'dsr', shortfall: am(BigInt(debtServiceAfter) - line) });
  }
  if (oweBreach) warnings.push({ code: 'owe', shortfall: am(BigInt(unsecuredAfter) - BigInt(limits.unsecuredLine)) });
  if (!isInvest && pauseNeeded > 0) warnings.push({ code: 'inv', shortfall: am(BigInt(pauseNeeded)) });
  warnings.sort(compareWarnings);

  const state =
    cashAfter < 0 || remainingShortfall > 0 || cashDip === 'hard' ? 'no' : warnings.length > 0 ? 'adjust' : 'fits';

  const checks = {
    cash: cashAfter >= limits.reserve,
    month: remainingShortfall === 0,
    dsr: !dsrBreach,
    owe: !oweBreach,
    inv: investingAfter >= limits.investingFloor,
    save: savingAfter >= limits.savingFloor,
  };
  const burn = am(BigInt(context.mySpendingBasis) + BigInt(context.debtPayments) + BigInt(newMonthly));

  const ratio = (x: MinorUnits): Percent | null =>
    incomeBasis > 0 ? percentFromScaled(divideHalfUp(BigInt(x) * ONE_HUNDRED_PERCENT, BigInt(incomeBasis))) : null;
  const debtBalanceAfter = am(BigInt(context.debtBalance) + financedMine);

  // D-31: a neutral fact on invest checks, never a warning and never a state change. D-59 follows it.
  const hi = context.highestUnsecuredApr;
  const debtFacts: BasisFact[] =
    isInvest && hi !== null && hi.apr > limits.projectionReturn
      ? [
          {
            code: 'debt_rate_exceeds_return',
            debtId: hi.debtId,
            debtApr: hi.apr,
            projectionReturn: limits.projectionReturn,
          },
        ]
      : [];
  const facts: BasisFact[] =
    cashPath.status === 'available' && cashPath.tightBeforePayday !== null
      ? [...debtFacts, cashPath.tightBeforePayday]
      : debtFacts;

  const basisCodes: BasisCode[] = [];
  if (cashPath.status === 'unavailable') basisCodes.push('cash_path_unavailable');
  if (money.oneOffsExcluded.count > 0) basisCodes.push('one_offs_excluded');

  // D-38: the month line by line (pre-pause) and the five ledgers.
  const column = (debt: MinorUnits, thisPurchase: MinorUnits): MonthColumn => {
    const outgoings = BigInt(context.mySpendingBasis) + BigInt(debt) + BigInt(context.pausable) + BigInt(thisPurchase);
    return {
      income: context.monthIncome,
      living: context.mySpendingBasis,
      debtPayments: debt,
      savingInvesting: context.pausable,
      thisPurchase,
      outgoings: am(outgoings),
      left: am(BigInt(context.monthIncome) - outgoings),
    };
  };
  const monthTable = {
    now: column(context.debtPayments, am(0n)),
    after: column(debtServiceAfter, isInvest ? mineMonthly : mineRunning),
  };
  const ledgers: readonly [Ledger, Ledger, Ledger, Ledger, Ledger] = [
    { code: 'income', now: context.monthIncome, after: context.monthIncome, direction: 'same' },
    {
      code: 'expenses',
      now: context.mySpendingBasis,
      after: am(BigInt(context.mySpendingBasis) + BigInt(mineRunning)),
      direction: direction(mineRunning > 0, mineRunning < 0),
    },
    {
      code: 'debt',
      now: context.debtBalance,
      after: debtBalanceAfter,
      direction: direction(debtBalanceAfter > context.debtBalance, false),
    },
    {
      code: 'cash',
      now: context.ledgerCash,
      after: ledgerCashAfterPurchase,
      direction: direction(ledgerCashAfterPurchase < context.ledgerCash, false),
    },
    {
      code: 'investments',
      now: snapshot.monthlyInvesting,
      after: isInvest ? am(BigInt(snapshot.monthlyInvesting) + BigInt(mineMonthly)) : am(BigInt(investingAfter)),
      direction: isInvest
        ? direction(false, mineMonthly > 0)
        : direction(investingAfter < snapshot.monthlyInvesting, false),
    },
  ];

  return {
    state,
    basisMarker: 'logged_months',
    warnings,
    facts,
    size: purchaseSize(context, priceOf(check)),
    plan,
    mineDayOne,
    mineMonthly,
    mineRunning,
    newMonthly,
    left,
    cashAfter,
    cashAfterBillsAndPurchase,
    ledgerCashAfterPurchase,
    debtServiceAfter,
    unsecuredAfter,
    debtServiceRatioBefore: ratio(context.debtPayments),
    debtServiceRatioAfter: ratio(debtServiceAfter),
    debtBalanceAfter,
    monthTable,
    ledgers,
    investingAtRisk: am(BigInt(investingAtRisk)),
    investingAfter: am(BigInt(investingAfter)),
    savingAtRisk: am(BigInt(savingAtRisk)),
    savingAfter: am(BigInt(savingAfter)),
    pauseNeeded: am(BigInt(pauseNeeded)),
    remainingShortfall: am(BigInt(remainingShortfall)),
    burn,
    checks,
    context,
    cashPath,
    cashDip,
    basisCodes,
    confidence: confidenceOf({ fullMonths: money.fullMonthsUsed, steadiness: money.steadiness, firstRead: false }),
  };
}

/**
 * The verdict for one snapshot and one check (DEC-06), judged on the combined position (D-41): the other open checks
 * the caller passes are stacked first, then the worst of the next 12 months is taken (D-45) with the check's own
 * expected income loss (D-53). With no other checks and no future changes every figure equals the single-check
 * verdict. D-16 clarified: the check must be in the snapshot's currency.
 * D-30: stateless. The other checks are a per-call argument, never snapshot state; an approved purchase reaches the
 * engine only through the records the snapshot is built from. D-31: neutral facts ride on the assessment, never as
 * warnings. D-21: codes and numbers only.
 *
 * A missing verdict carries the purchase size whenever the context resolves (read from the combined position), and a
 * confidence from the money basis (rough ['under_3_full_months'] only when there is no full month, D-46).
 */
export function assess(
  snapshot: DecideSnapshot,
  check: PurchaseCheck,
  otherChecks: readonly StackedCheckInput[] = []
): Verdict {
  assertCurrency(snapshot.currency, check.currency, 'check', 'assess');
  const ctx = prepareContext(snapshot);
  const planResult = resolvePlan(check);
  const reasons: MissingReason[] = [
    ...(ctx.ok ? [] : ctx.reasons),
    ...(planResult.status === 'missing' ? planResult.reasons : []),
  ];
  if (!ctx.ok) {
    return { state: 'missing', reasons, size: null, confidence: ctx.confidence };
  }
  const combined = positionContext(ctx.context, check, otherChecks).combined;
  if (planResult.status === 'missing') {
    return {
      state: 'missing',
      reasons,
      size: purchaseSize(combined, priceOf(check)),
      confidence: confidenceOf({
        fullMonths: combined.money.fullMonthsUsed,
        steadiness: combined.money.steadiness,
        firstRead: false,
      }),
    };
  }
  return assessPlan(combined, check, planResult.plan);
}
