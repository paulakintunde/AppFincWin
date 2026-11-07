// 06-18 (GRW-11): wording and the percent rule for an account's interest rate (APY). Kept here because en.ts is owned by another
// plan while this one runs; move these into en.accounts when that file is free. Declarative wording only.
import { percent } from '@/engine/payoff';

export const ACCOUNT_RATE_TEXT = {
  label: 'Interest a year (APY)',
  help: 'Leave blank if none.',
  invalid: 'Enter a rate from 0 to 100, like 4.5.',
  detailLabel: 'Interest',
  detailValue: (rate: string): string => `${rate}% a year`,
} as const;

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
