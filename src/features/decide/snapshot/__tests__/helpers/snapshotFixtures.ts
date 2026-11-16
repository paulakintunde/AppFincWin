// Test builders for the currency view: today is 2026-10-15, home USD. 05.5-19: the old engine's DecideSnapshot builders went with the old engine;
// what the currency view reads is the small CurrencyBasis (currency, stored rates, unconverted note).
import type { CurrencyBasis } from '../../checkCurrency';

export const TODAY = '2026-10-15';

export function loggedSource(): CurrencyBasis {
  return { currency: 'USD', unconverted: null };
}
