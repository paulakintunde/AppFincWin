/**
 * Check inputs (D-37): the step-2 final price, on-the-day fees, sales tax and running costs, as engine figures.
 *
 * Ports the prototype's `dprice` (advertised + the counted adjustments) and `downNet` (counted costs - counted replaced
 * expenses), plus the quick check's sales tax and fees (05 D-23). The prototype computed these in its view layer; the
 * engine owns them so the quick check and the full check reach BuyCheck through one tested path.
 *
 * D-05, D-07: no default rate exists. The tax percent and the loss-of-value rate are always typed by the user.
 * D-55: a counted `loss_of_value` line is reported as `nonCash` and never enters gross or net.
 * D-63: lossOfValueMonthly turns the user's own loss-of-value entry into the monthly amount of such a line.
 */
import { assertNever } from '../guards/assertNever';
import { divideHalfUp } from '../money/rounding';
import { minorUnits, type MinorUnits } from '../money/types';
import { MONTHLY_RATE_DENOMINATOR, ONE_HUNDRED_PERCENT, minorFromBigInt, type Percent } from '../payoff';
import { isNonCashCategory } from './runningCostPrompts';
import type { CostLine, LossOfValueInput, PriceInputs, ResolvedPrice, RunningCosts } from './types';

function assertAmount(fn: string, value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${fn}: ${label} ${value} must be a non-negative integer`);
  }
}

/**
 * 05 D-23: sales tax on the advertised price at the user-typed rate, with one half-up rounding.
 */
export function salesTaxAmount(advertised: MinorUnits, taxPercent: Percent): MinorUnits {
  assertAmount('salesTaxAmount', advertised, 'advertised');
  if (taxPercent < 0n) {
    throw new RangeError(`salesTaxAmount: tax percent ${taxPercent} must be >= 0`);
  }
  return minorFromBigInt(divideHalfUp(BigInt(advertised) * taxPercent, ONE_HUNDRED_PERCENT), 'salesTaxAmount');
}

/**
 * Prototype `dprice` and the `dayFees` filter `x.on && x.day && x.v > 0`. The price is floored at 0: a takes-off line
 * larger than the price cannot make the price negative, which resolvePlan would reject.
 */
export function resolvePriceInputs(input: PriceInputs): ResolvedPrice {
  const fn = 'resolvePriceInputs';
  assertAmount(fn, input.advertised, 'advertised');
  const seen = new Set<string>();
  let net = 0n;
  let dayFees = 0n;
  let counted = 0;
  for (const adj of input.adjustments) {
    assertAmount(fn, adj.amount, `adjustment ${adj.id} amount`);
    if (seen.has(adj.id)) {
      throw new RangeError(`${fn}: duplicate adjustment id ${adj.id}`);
    }
    seen.add(adj.id);
    if (!adj.counted) continue;
    counted += 1;
    if (adj.effect === 'adds') {
      net += BigInt(adj.amount);
      if (adj.onDay) dayFees += BigInt(adj.amount);
    } else {
      net -= BigInt(adj.amount);
    }
  }
  const advertised = BigInt(input.advertised);
  const price = advertised + net > 0n ? advertised + net : 0n;
  // 04-REVIEW LO-04: the on-the-day fees are part of the price, so they never exceed it. When take-off lines push the
  // price to its floor, the fees are clamped with it (otherwise a loan's dayOne exceeded the price and showed the
  // difference as interest).
  const fees = dayFees < price ? dayFees : price;
  return {
    advertised: input.advertised,
    adjustmentsNet: minorFromBigInt(net, fn),
    price: minorFromBigInt(price, fn),
    dayFees: minorFromBigInt(fees, fn),
    countedLines: counted,
    totalLines: input.adjustments.length,
  };
}

/**
 * Prototype `downNet`: net monthly change = counted costs - counted replaced expenses (signed).
 * D-55: counted non-cash lines (loss of value) go to `nonCash`, outside gross and net, so loss of value is shown but
 * never enters the month test.
 */
export function netRunningCosts(costs: readonly CostLine[], replaced: readonly CostLine[]): RunningCosts {
  const fn = 'netRunningCosts';
  let gross = 0;
  let nonCash = 0;
  let countedCosts = 0;
  for (const c of costs) {
    assertAmount(fn, c.amount, `cost ${c.id} amount`);
    if (!c.counted) continue;
    if (c.category !== undefined && isNonCashCategory(c.category)) {
      nonCash += c.amount;
    } else {
      gross += c.amount;
      countedCosts += 1;
    }
  }
  let replacedTotal = 0;
  let countedReplaced = 0;
  for (const r of replaced) {
    assertAmount(fn, r.amount, `replaced ${r.id} amount`);
    if (r.category !== undefined && isNonCashCategory(r.category)) {
      throw new RangeError(`${fn}: replaced line ${r.id} is non-cash and cannot replace a cash expense`);
    }
    if (!r.counted) continue;
    replacedTotal += r.amount;
    countedReplaced += 1;
  }
  return {
    gross: minorUnits(gross),
    replaced: minorUnits(replacedTotal),
    net: minorUnits(gross - replacedTotal),
    countedCosts,
    totalCosts: costs.length,
    countedReplaced,
    nonCash: minorUnits(nonCash),
  };
}

/**
 * D-63: the user's own loss-of-value entry as a monthly non-cash amount. An amount is taken as typed; a %/year is of
 * the advertised price (the item's value before tax, fees and trade-ins, never ResolvedPrice.price) with one half-up
 * rounding. Optional and never defaulted (D-07). D-55: the figure only ever reaches RunningCosts.nonCash, and BuyCheck
 * has no loss-of-value field, so the month test, month table, cash path and ledgers cannot read it. D-20: one rounding.
 */
export function lossOfValueMonthly(input: LossOfValueInput, advertisedPrice: MinorUnits): MinorUnits {
  const fn = 'lossOfValueMonthly';
  assertAmount(fn, advertisedPrice, 'advertisedPrice');
  switch (input.kind) {
    case 'amount':
      assertAmount(fn, input.monthly, 'monthly');
      return input.monthly;
    case 'percent_per_year': {
      if (input.percentPerYear < 0n || input.percentPerYear > ONE_HUNDRED_PERCENT) {
        throw new RangeError(`${fn}: percent per year must be between 0% and 100%`);
      }
      return minorFromBigInt(
        divideHalfUp(BigInt(advertisedPrice) * input.percentPerYear, MONTHLY_RATE_DENOMINATOR),
        fn
      );
    }
    default:
      return assertNever(input, 'loss of value input');
  }
}
