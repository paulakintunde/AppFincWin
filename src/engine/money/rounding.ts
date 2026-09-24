/**
 * The one rounding function for the money engine (D-21): half-up, away from
 * zero, symmetric for negative numerators. Every conversion and scaling
 * operation in `engine/money/` routes through this function, and only this
 * function. It is mirrored in SQL as `public.div_half_up` (plan 01-05); a
 * shared fixture (supabase/tests/fixtures/money-conversion-cases.json)
 * proves both give identical results, so a future edit to one that isn't
 * matched in the other fails a test rather than silently drifting.
 */
export function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new RangeError('divideHalfUp: denominator must be positive');
  }
  const absNumerator = numerator < 0n ? -numerator : numerator;
  const quotient = (2n * absNumerator + denominator) / (2n * denominator);
  return numerator < 0n ? -quotient : quotient;
}
