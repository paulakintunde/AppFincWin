// 06-18 (GRW-11): the percent rule for an account's interest rate (APY). The wording lives in en.accounts (sheet.rate*, detail.interest*).
import { percent } from '@/engine/payoff';

/** Savings and investment accounts can carry a rate. */
export function kindHasRate(kind: string): boolean {
  return kind === 'savings' || kind === 'investment';
}

/** P5-WR-03: a comma decimal ('4,5', typed by a comma-decimal keyboard) reads as '4.5', as the other rate fields do. */
function normalised(text: string): string {
  return text.trim().replace(',', '.');
}

/** Blank is fine (no rate). Otherwise a percent text from 0 to 100, e.g. '4.5' or '4,5'; '4.5%' is not. */
export function validRateInput(text: string): boolean {
  const s = normalised(text);
  if (s === '') return true;
  try {
    percent(s);
    return Number(s) <= 100;
  } catch {
    return false;
  }
}

/** The text to store: trimmed, a comma decimal as a point, or null when blank. */
export function rateToStore(text: string): string | null {
  const s = normalised(text);
  return s === '' ? null : s;
}
