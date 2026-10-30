/**
 * 05.3-40: a Percent (scaled bigint) as the exact decimal text a rate field shows, and back. Never goes through a float,
 * so a typed 6.9 stays 6.9 and a typed 0 stays 0 (a typed 0 means 0%, T-05.3-40-01). An unfinished entry ("5.") reads as null.
 */
import { PERCENT_SCALE, percent, type Percent } from '@/engine/payoff';

const WIDTH = PERCENT_SCALE.toString().length - 1;

export function percentToText(p: Percent | null): string {
  if (p === null) return '';
  const whole = p / PERCENT_SCALE;
  const frac = (p % PERCENT_SCALE).toString().padStart(WIDTH, '0').replace(/0+$/, '');
  return frac === '' ? whole.toString() : `${whole}.${frac}`;
}

/** null for empty or unfinished text, so the caller keeps its last valid value. */
export function textToPercent(text: string): Percent | null {
  if (text.trim() === '') return null;
  try {
    return percent(text);
  } catch {
    return null;
  }
}
