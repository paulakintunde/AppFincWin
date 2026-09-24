/**
 * Integer arithmetic over `Money`. Every function builds its result through
 * `minorUnits()` (types.ts) so an unsafe or fractional result throws instead
 * of drifting (MON-01), and every same-currency operation validates that
 * both operands share a currency before touching their amounts.
 */
import { minorUnits, type CurrencyCode, type Money } from './types';

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new RangeError('currency mismatch');
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amount: minorUnits(a.amount + b.amount), currency: a.currency };
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amount: minorUnits(a.amount - b.amount), currency: a.currency };
}

export function negate(m: Money): Money {
  return { amount: minorUnits(-m.amount), currency: m.currency };
}

export function multiplyByInteger(m: Money, factor: number): Money {
  if (!Number.isSafeInteger(factor)) {
    throw new RangeError(`multiplyByInteger: factor ${factor} must be a safe integer`);
  }
  return { amount: minorUnits(m.amount * factor), currency: m.currency };
}

export function sum(items: readonly Money[], currency: CurrencyCode): Money {
  return items.reduce((acc, item) => add(acc, item), {
    amount: minorUnits(0),
    currency,
  });
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  if (a.amount < b.amount) return -1;
  if (a.amount > b.amount) return 1;
  return 0;
}

export function isZero(m: Money): boolean {
  return m.amount === 0;
}
