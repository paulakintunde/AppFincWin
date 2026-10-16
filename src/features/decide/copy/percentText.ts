import type { Percent } from '@/engine/decide';

const SCALE = 10n ** 10n;
const HUNDREDTH = SCALE / 100n; // 10^8: one hundredth of a percentage point

/** Percent (bigint scaled by 10^10) as text: half-up to 2 decimals, trailing zeros trimmed. Bigint arithmetic only. */
export function percentText(p: Percent): string {
  const hundredths = (p + HUNDREDTH / 2n) / HUNDREDTH; // half-up (Percent is never negative: percent() refuses a sign)
  const whole = hundredths / 100n;
  const frac = (hundredths % 100n).toString().padStart(2, '0').replace(/0+$/, '');
  return frac === '' ? whole.toString() : `${whole}.${frac}`;
}
