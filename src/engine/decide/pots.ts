/**
 * Pots (D-101, R18.2, engine change E6): a named sinking fund becomes a monthly set-aside that comes off the month and
 * a protected slice of cash. Pure: no I/O, no clock (the caller passes asOf). Money is integer minor units; the
 * per-pot amounts are bigint and the total is an exact bigint sum.
 *
 * Range: each pot is range-asserted on entry (target 1..10^13, saved and monthlyAmount 0..10^13), so every per-pot
 * amount is at most 10^13. With MAX_POTS = 50 the sum is at most 5 x 10^14, below 2^53, so it converts with a plain
 * Number() and needs no range branch.
 */
import { MAX_ABS_AMOUNT_MINOR, minorUnits, type MinorUnits } from '../money/types';
import { ceilDivide } from '../payoff/types';
import { occurrenceDate } from '../recurring/schedule';
import { isValidLocalDate } from '../time/localDate';
import { MAX_POTS, SIMULATION_MONTH_CAP } from './constants';
import type { PotInput, PotLine } from './types';

const FN = 'potSetAside';
const ZERO = minorUnits(0);

function assertRange(value: number, min: number, what: string, potId: string): void {
  if (!Number.isSafeInteger(value) || value < min || value > MAX_ABS_AMOUNT_MINOR) {
    throw new RangeError(`${FN}: pot ${potId} ${what} ${value} must be a whole number from ${min} to ${MAX_ABS_AMOUNT_MINOR}`);
  }
}

function validate(pot: PotInput, asOf: string): void {
  if (!isValidLocalDate(asOf)) throw new RangeError(`${FN}: asOf "${asOf}" is not a valid local date`);
  if (pot.target !== null) assertRange(pot.target, 1, 'target', pot.id);
  if (pot.monthlyAmount !== null) assertRange(pot.monthlyAmount, 0, 'monthlyAmount', pot.id);
  assertRange(pot.saved, 0, 'saved', pot.id);
  if (pot.readyBy !== null && !isValidLocalDate(pot.readyBy)) {
    throw new RangeError(`${FN}: pot ${pot.id} readyBy "${pot.readyBy}" is not a valid local date`);
  }
}

/** Whole months from asOf to readyBy, rounded down: the largest k with occurrenceDate(asOf, 'monthly', k) <= readyBy. */
function wholeMonths(asOf: string, readyBy: string): number {
  const [ay, am] = asOf.split('-').map(Number) as [number, number];
  const [ry, rm] = readyBy.split('-').map(Number) as [number, number];
  const k = Math.min((ry - ay) * 12 + (rm - am), SIMULATION_MONTH_CAP);
  return occurrenceDate(asOf, 'monthly', k) > readyBy ? k - 1 : k;
}

function line(id: string, monthly: bigint, months: number | null, state: PotLine['state']): PotLine {
  return { id, monthly: minorUnits(Number(monthly)), months, state };
}

/**
 * D-101 / R18.2: what one pot sets aside each month. Rules in order: no target (the monthly amount, or 0); reached
 * (target - saved <= 0); a Wait pot (its own monthly amount, capped at what remains; none or 0 sets aside 0 with no
 * division); a plain pot past or on its date (past_due, 0); otherwise remaining over the whole months left (at least 1),
 * rounded up, in the direction buildWaitPlan uses.
 */
export function potSetAside(pot: PotInput, asOf: string): PotLine {
  validate(pot, asOf);
  if (pot.target === null) return line(pot.id, BigInt(pot.monthlyAmount ?? ZERO), null, 'active');
  const remaining = BigInt(pot.target) - BigInt(pot.saved);
  if (remaining <= 0n) return line(pot.id, 0n, null, 'reached');
  if (pot.kind === 'wait') {
    const amount = BigInt(pot.monthlyAmount ?? ZERO);
    if (amount === 0n) return line(pot.id, 0n, null, 'active');
    const monthly = amount < remaining ? amount : remaining;
    return line(pot.id, monthly, Number(ceilDivide(remaining, monthly)), 'active');
  }
  if (pot.readyBy === null) return line(pot.id, 0n, null, 'active');
  if (pot.readyBy <= asOf) return line(pot.id, 0n, null, 'past_due');
  const m = Math.max(1, wholeMonths(asOf, pot.readyBy));
  return line(pot.id, ceilDivide(remaining, BigInt(m)), m, 'active');
}

/** The exact bigint sum of every pot's set-aside, with the per-pot lines and the sum of saved (for protected cash). */
export function totalSetAside(
  pots: readonly PotInput[],
  asOf: string
): { readonly total: MinorUnits; readonly saved: bigint; readonly lines: readonly PotLine[] } {
  if (pots.length > MAX_POTS) throw new RangeError(`totalSetAside: ${pots.length} pots is over the limit of ${MAX_POTS}`);
  const lines = pots.map((p) => potSetAside(p, asOf));
  let total = 0n;
  for (const l of lines) total += BigInt(l.monthly);
  let saved = 0n;
  for (const p of pots) saved += BigInt(p.saved);
  return { total: minorUnits(Number(total)), saved, lines };
}
