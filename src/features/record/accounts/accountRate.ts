// 06-18 (GRW-11): the percent rule for an account's interest rate (APY). The wording lives in en.accounts (sheet.rate*, detail.interest*).
import { percent } from '@/engine/payoff';

/** Savings and investment accounts can carry a rate. */
export function kindHasRate(kind: string): boolean {
  return kind === 'savings' || kind === 'investment';
}

/** Blank is fine (no rate). Otherwise a percent text from 0 to 100, e.g. '4.5'; '4.5%' is not. */
export function validRateInput(text: string): boolean {
  const s = text.trim();
  if (s === '') return true;
  try {
    percent(s);
    return Number(s) <= 100;
  } catch {
    return false;
  }
}

/** The text to store: trimmed, or null when blank. */
export function rateToStore(text: string): string | null {
  const s = text.trim();
  return s === '' ? null : s;
}
