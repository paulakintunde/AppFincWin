import type { CurrencyCode } from '../money/types';

/**
 * One currency per check (D-16 clarified). The Phase 5 snapshot builder converts card floors, balances and figures
 * into the check's home currency; the engine sees a single currency and rejects any other code instead of converting.
 *
 * Thrown messages are developer diagnostics, not engine output; D-21 governs returned values.
 */
export function assertCurrency(expected: CurrencyCode, actual: CurrencyCode, where: string, fn: string): void {
  if (actual !== expected) {
    throw new RangeError(`${fn}: mixed currencies — ${where} is ${actual}, expected ${expected}`);
  }
}
