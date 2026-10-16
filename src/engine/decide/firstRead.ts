/**
 * firstRead: the D-11 first read (DEC-16), as amended 2026-10-15.
 *
 * From a cash balance, rough monthly income and rough monthly spending it returns a cash-level verdict. It flags a
 * cash level below the rough cushion (3 x rough monthly spending, mirroring D-01) as `adjust`, so the first read
 * agrees with the full verdict once a real month exists. It stays cash-level only: no debt lines, steadiness,
 * pause or investing squeeze, and no bills due. Those need logged history and belong to `assess()`. The 2026-09-27
 * rule "never `adjust`" is superseded.
 *
 * Every result carries the basis marker `first_read_rough_figures` (D-21: codes and numbers only), the D-36 purchase
 * size sized from the rough figures as if paid in cash, and D-46 confidence (always rough, reason `first_read`).
 * Personal figures only: the rough figures are the user's own.
 */
import { minorFromBigInt } from '../payoff/types';
import type { MinorUnits } from '../money/types';
import { DEFAULT_RESERVE_MONTHS, WARNING_ORDER } from './constants';
import { confidenceOf } from './confidence';
import { assertCurrency } from './currency';
import { resolvePlan } from './plan';
import type { FirstRead, FirstReadWarning, PurchaseCheck, PurchaseSize, RoughFigures } from './types';

const FN = 'firstRead';

function assertNonNegative(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${FN}: ${label} ${value} must be a non-negative integer`);
  }
}

function mi(value: bigint): MinorUnits {
  return minorFromBigInt(value, FN);
}

export function firstRead(figures: RoughFigures, check: PurchaseCheck): FirstRead {
  assertNonNegative(figures.monthlyIncome, 'monthlyIncome');
  assertNonNegative(figures.monthlySpending, 'monthlySpending');
  assertCurrency(check.currency, figures.currency, 'rough figures', FN);

  const cash = BigInt(figures.cash);
  const roughLeft = BigInt(figures.monthlyIncome) - BigInt(figures.monthlySpending);
  const roughCushion = BigInt(DEFAULT_RESERVE_MONTHS) * BigInt(figures.monthlySpending);

  // D-36: sized as a cash purchase, so the payment method never changes it.
  const price = BigInt(check.kind === 'buy' ? check.price : check.amount);
  const size: PurchaseSize =
    price <= roughLeft ? 'from_spare_this_month' : cash - price >= roughCushion ? 'from_savings' : 'needs_spreading';
  const confidence = confidenceOf({ fullMonths: 0, steadiness: null, firstRead: true });

  const r = resolvePlan(check);
  if (r.status === 'missing') {
    return { state: 'missing', basisMarker: 'first_read_rough_figures', reasons: r.reasons, size, confidence };
  }

  const { plan } = r;
  const monthly = BigInt(plan.monthly) + BigInt(check.kind === 'buy' ? check.runningCostsNet : 0);
  const cashAfter = cash - BigInt(plan.dayOne);
  const leftAfter = roughLeft - monthly;
  const cashCovers = cashAfter >= 0n;
  const monthCloses = leftAfter >= 0n;
  const aboveCushion = cashAfter >= roughCushion;

  const warnings: FirstReadWarning[] = [];
  if (!monthCloses) warnings.push({ code: 'month', shortfall: mi(-leftAfter) });
  if (!aboveCushion) warnings.push({ code: 'cash', shortfall: mi(roughCushion - cashAfter) });
  warnings.sort((a, b) => b.shortfall - a.shortfall || WARNING_ORDER.indexOf(a.code) - WARNING_ORDER.indexOf(b.code));

  const state = !cashCovers || !monthCloses ? 'no' : !aboveCushion ? 'adjust' : 'fits';
  return {
    state,
    basisMarker: 'first_read_rough_figures',
    size,
    plan,
    dayOne: plan.dayOne,
    monthly: mi(monthly),
    cashAfter: mi(cashAfter),
    leftAfter: mi(leftAfter),
    roughCushion: mi(roughCushion),
    cashCovers,
    monthCloses,
    aboveCushion,
    warnings,
    confidence,
  };
}
