/**
 * The verdict (DEC-06), a port of the prototype `dassess` as two layers: prepareContext resolves everything that does not
 * depend on the check, assessPlan computes the figures, the pause rule, the ordered warnings and the basis facts, and
 * assess composes them. Splitting the layers lets bisection, options, alternatives and setbacks re-assess cheaply.
 *
 * Defaults come from the user's own figures, never a currency constant (D-05): the reserve replaces the prototype's 6000
 * (D-01, D-42: a month's costs by steadiness; DEFAULT_RESERVE_MONTHS = 3 is the steady and short-history value), the
 * investing and saving floors replace 1000 and 500 (D-05: what the user already puts in each month).
 *
 * D-34: there are two shares. `resolveShare(snapshot.scope)` is the purchase's per-check split; `resolveSpendingShare`
 * is my share of existing spending, bills and the cushion. The 2026-09-27 plan used one share for both, which was the
 * defect: overriding the purchase to `mine` must not change my share of rent and groceries.
 * D-24: confirmed quarterly/yearly bills due within 90 days come off cash. D-30: nothing about earlier checks is read.
 * D-61: with a cash path, scheduled outflows sit on their dates in the D-44 path (on or before asOf: day 0) and only
 * those dated on or before asOf reduce cashAvailable; without a path, too, only those dated on or before asOf reduce
 * cashAvailable, so a future-dated outflow is not in the `cash` check (it still reduces cashAfterBills, so it lowers
 * every spare-money figure). ledgerCash follows the same on-or-before-asOf rule with the D-24 bills always deducted (D-38).
 */
import type { MinorUnits } from '../money/types';
import { ZERO_PERCENT, minorFromBigInt, type Percent } from '../payoff/types';
import { isValidLocalDate } from '../time/localDate';
import { BILLS_DUE_HORIZON_DAYS, DEFAULT_DSR_LINE, DEFAULT_UNSECURED_INCOME_MULTIPLE, MONTHS_PER_YEAR } from './constants';
import { assertCurrency } from './currency';
import { cashPathForSnapshot } from './cashPath';
import { confidenceOf } from './confidence';
import { deriveMoney, resolveSpendingShare, shareForCategory } from './money';
import { resolveProjectionRates } from './projectionRates';
import { defaultReserve, reserveHalfMonthsFor } from './reserve';
import { isSecured } from './secured';
import { billsDueWithin, scheduledOutflowsDue } from './series';
import { SOLE_SHARE, myPart, resolveShare } from './share';
import type { ContextResult, DecideSnapshot, MissingReason, ResolvedLimits, SpendingShare } from './types';

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
  const leftBefore = mi(
    BigInt(monthIncome) - BigInt(money.spendingBasis) - debtPayments - BigInt(pausable)
  );

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
