/**
 * Two-way goal calculator (D-17). Pure integer maths on minor units.
 * "Needed each month" rounds UP to the cent (D-21) so the goal is reached, never missed by a cent.
 */
import { divideHalfUp } from '../money/rounding';
import { type MinorUnits } from '../money/types';
import { MONTHLY_RATE_DENOMINATOR, ZERO_PERCENT, ceilDivide, minorFromBigInt, type Percent } from '../payoff/types';
import { occurrenceDate } from '../recurring/schedule';

/** Upper bound on deposits searched (50 years). */
const MAX_DEPOSITS = 600;

export function neededEachMonth(left: MinorUnits, deposits: number): MinorUnits {
  if (!Number.isInteger(deposits) || deposits < 1) {
    throw new RangeError(`neededEachMonth: deposits ${deposits} must be a whole number >= 1`);
  }
  if (left <= 0) {
    return 0 as MinorUnits;
  }
  return minorFromBigInt(ceilDivide(BigInt(left), BigInt(deposits)), 'neededEachMonth');
}

/**
 * Deposits until the balance reaches the target. Step k is the month that ends on deposit k (depositDate(anchor, k)): the balance
 * earns that month's interest, then deposit k lands. Every caller anchors the plan one period ahead (the first of next month, or a
 * first deposit "next month"), so `have` sits for that month before deposit 1 and earns its interest (code review P2-WR-05: the
 * timing matches the dates as long as the anchor is the first deposit, never today).
 */
export function monthsToReach(
  have: MinorUnits,
  target: MinorUnits,
  add: MinorUnits,
  apr: Percent = ZERO_PERCENT,
): { deposits: number | null; interest: MinorUnits; value: MinorUnits } {
  let balance = BigInt(have);
  let interest = 0n;
  let deposits = 0;
  const goal = BigInt(target);
  const deposit = BigInt(add);
  while (balance < goal) {
    if (deposits >= MAX_DEPOSITS) {
      return { deposits: null, interest: minorFromBigInt(interest, 'monthsToReach'), value: minorFromBigInt(balance, 'monthsToReach') };
    }
    const earned = divideHalfUp(balance * BigInt(apr), MONTHLY_RATE_DENOMINATOR);
    interest += earned;
    balance += earned + deposit;
    deposits++;
  }
  return { deposits, interest: minorFromBigInt(interest, 'monthsToReach'), value: minorFromBigInt(balance, 'monthsToReach') };
}

/** The date of the k-th monthly deposit (k = 1 is the anchor). */
export function depositDate(anchor: string, k: number): string {
  return occurrenceDate(anchor, 'monthly', k - 1);
}

export function goalPlanByMonthly(i: {
  have: MinorUnits;
  target: MinorUnits | null;
  add: MinorUnits;
  anchor: string;
  apr?: Percent;
}): { deposits: number | null; reachesOn: string | null; interest: MinorUnits } {
  if (i.target === null) {
    return { deposits: null, reachesOn: null, interest: 0 as MinorUnits };
  }
  const r = monthsToReach(i.have, i.target, i.add, i.apr);
  if (r.deposits === null) {
    return { deposits: null, reachesOn: null, interest: 0 as MinorUnits };
  }
  return {
    deposits: r.deposits,
    reachesOn: r.deposits === 0 ? null : depositDate(i.anchor, r.deposits),
    interest: r.interest,
  };
}

function monthIndex(date: string): number {
  return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7));
}

/** byDate: 'YYYY-MM-DD' (deposits on or before it count) or 'YYYY-MM' (by the end of that month). */
export function goalPlanByDate(i: {
  have: MinorUnits;
  target: MinorUnits;
  anchor: string;
  byDate: string;
}): { deposits: number; neededEachMonth: MinorUnits } {
  let deposits = monthIndex(i.byDate) - monthIndex(i.anchor) + 1;
  // P2-CR-03 (D-21): only deposits on or before the by-date count. A by-date given as a month ('YYYY-MM') means its whole month, so
  // that month's deposit counts; a full date earlier in the month than the anchor's day misses that month's deposit.
  if (deposits > 0 && i.byDate.length > 7 && depositDate(i.anchor, deposits) > i.byDate) deposits -= 1;
  deposits = Math.max(1, deposits);
  return { deposits, neededEachMonth: neededEachMonth((i.target - i.have) as MinorUnits, deposits) };
}
