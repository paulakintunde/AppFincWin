// Home-currency conversion for cached reads (D-05, D-10). A row's own stored home_amount is
// used unchanged when the caller's requested home currency still matches what the row was
// stamped with; otherwise the row is cross-converted through its own stored orig_per_eur --
// never re-derived from home_per_eur -- to the requested home currency's own latest rate
// (Phase 1 D-05: "cross-converted through the stored base"). Any missing rate or unusable
// exponent counts as unconverted (null) rather than a guessed figure. Every rate is parsed
// with engine/money's own BigInt parser, never a float-producing conversion.
import { EUR_PER_EUR, convertMinor, minorUnits, parseRate, resolveExponent, type ScaledRate } from '@/engine/money';
import type { FxLatestRow, TransactionRow } from '@/db/rows';

/** `code`'s latest units-per-EUR rate from the cached FX table, or null when none is cached. */
export function latestPerEur(rates: readonly FxLatestRow[], code: string): ScaledRate | null {
  if (code === 'EUR') return EUR_PER_EUR;
  const found = rates.find((r) => r.quote === code);
  if (!found) return null;
  try {
    return parseRate(found.rate);
  } catch {
    return null;
  }
}

export function homeAmountFor(
  row: Pick<TransactionRow, 'home_currency' | 'home_amount' | 'original_amount' | 'original_currency' | 'orig_per_eur'>,
  homeCurrency: string,
  rates: readonly FxLatestRow[]
): number | null {
  if (row.home_currency === homeCurrency) return row.home_amount;
  if (row.orig_per_eur === null) return null;

  let origPerEur: ScaledRate;
  try {
    origPerEur = parseRate(row.orig_per_eur);
  } catch {
    return null;
  }

  const homePerEur = latestPerEur(rates, homeCurrency);
  if (homePerEur === null) return null;

  try {
    const origExponent = resolveExponent(row.original_currency);
    const homeExponent = resolveExponent(homeCurrency);
    return convertMinor(minorUnits(row.original_amount), origPerEur, origExponent, homePerEur, homeExponent);
  } catch {
    return null;
  }
}

/** The same conversion as homeAmountFor, for a projected (not-yet-materialised) occurrence that has no stored stamp of its own. */
export function projectionHomeAmount(
  amount: number,
  currency: string,
  homeCurrency: string,
  rates: readonly FxLatestRow[]
): number | null {
  if (currency === homeCurrency) return amount;

  const fromPerEur = latestPerEur(rates, currency);
  const toPerEur = latestPerEur(rates, homeCurrency);
  if (fromPerEur === null || toPerEur === null) return null;

  try {
    const fromExponent = resolveExponent(currency);
    const toExponent = resolveExponent(homeCurrency);
    return convertMinor(minorUnits(amount), fromPerEur, fromExponent, toPerEur, toExponent);
  } catch {
    return null;
  }
}
