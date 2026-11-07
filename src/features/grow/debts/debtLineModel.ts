// 06-17: the small pure helpers the Debts screens need beyond the engine: the debt-payment share of pay against the user's
// rule, and the "about" rounding. Whole-number rounding, half up, integers only (no floats for money).
import { minorUnits } from '@/engine/money';
import { estimatedCardMinimum, percent, strategy, ZERO_PERCENT, type PayoffOrder, type PlanDebt } from '@/engine/payoff';
import { dueDateOf } from '../connect/debtPoint';
import type { DebtLine } from './useDebtsRead';

export interface DebtLineModel {
  /** Debt payments as a whole percent of usual pay, half up. */
  sharePercent: number;
  /** The user's rule as a whole percent. */
  line: number;
  /** The share is above the rule (compared as whole percents, the same figures the screen shows). */
  over: boolean;
}

/**
 * monthlyDebtPayments and usualPay are minor units of the same currency. linePercentText is the rule as typed ("36", "36.5").
 * Null when there is no usual pay to compare against, or the rule is not a number.
 */
export function debtLineModel(monthlyDebtPayments: number, usualPay: number, linePercentText: string): DebtLineModel | null {
  if (!Number.isSafeInteger(monthlyDebtPayments) || !Number.isSafeInteger(usualPay) || usualPay <= 0 || monthlyDebtPayments < 0) return null;
  const rule = Number(linePercentText);
  if (!Number.isFinite(rule) || rule < 0) return null;
  const sharePercent = Math.floor((monthlyDebtPayments * 200 + usualPay) / (usualPay * 2));
  const line = Math.floor(rule + 0.5);
  return { sharePercent, line, over: sharePercent > line };
}

/**
 * "About" figures round to the nearest ten of the currency's major unit, half up: 75636 -> 76000 ($760), 64491 -> 64000,
 * 58204 -> 58000, 11145 -> 11000. `exponent` is the currency's decimals (2 for dollars, 0 for yen).
 */
export function aboutTens(minor: number, exponent = 2): number {
  const unit = 10 ** (exponent + 1);
  return Math.floor((minor + unit / 2) / unit) * unit;
}

/** "4 years sooner": whole years once the gap is two years or more (48 -> 4y 0m, 38 -> 3y 2m); under that, months only. */
export function soonerSpan(months: number): { years: number; months: number } {
  return months < 24 ? { years: 0, months } : { years: Math.floor(months / 12), months: months % 12 };
}

/**
 * The date the first debt in the plan is cleared, in the given payoff order, with `extra` a month on top of the minimums.
 * Null with fewer than two debts in the plan (the screen shows the line only with 2+), or when none clears.
 */
export function firstClearedDate(lines: readonly DebtLine[], extra: number, order: PayoffOrder, today: string): string | null {
  const inPlan = lines.filter((l) => l.inPlan);
  if (inPlan.length < 2) return null;
  const debts: PlanDebt[] = inPlan.map((l) => ({ id: l.id, balance: l.point.balance, apr: l.point.apr ?? ZERO_PERCENT, minimum: l.point.minimum }));
  const result = strategy(debts, minorUnits(extra), order);
  let first: { id: string; month: number } | null = null;
  for (const d of result.debts) {
    if (d.doneMonth !== null && d.doneMonth > 0 && (first === null || d.doneMonth < first.month)) first = { id: d.id, month: d.doneMonth };
  }
  if (first === null) return null;
  const dueDay = inPlan.find((l) => l.id === first.id)?.point.dueDay ?? null;
  return dueDay === null ? null : dueDateOf(today, dueDay, first.month - 1);
}

/**
 * D-28: the estimated minimum for a carried card with no typed minimum, from the engine's own rule. Null when the balance is
 * empty or the rate text is not a valid yearly rate (blank counts as none).
 */
export function estimatedMinimumOf(balance: number | null, rateText: string): number | null {
  if (balance === null || balance <= 0) return null;
  const text = rateText.trim().replace(',', '.');
  if (text !== '' && !/^\d{1,3}(\.\d{1,2})?$/.test(text)) return null;
  return estimatedCardMinimum(minorUnits(balance), text === '' ? ZERO_PERCENT : percent(text));
}

/** Whole percent of the starting balance already paid, half up, clamped to 0..100; null without a starting balance. */
export function paidPercent(started: number | null, balance: number): number | null {
  if (started === null || started <= 0) return null;
  const paid = Math.max(0, started - balance);
  return Math.min(100, Math.floor((paid * 200 + started) / (started * 2)));
}

export interface SaleOutcome {
  /** The payment covers the whole balance. */
  paidOff: boolean;
  /** What is still owed after the payment (0 when paid off). */
  stillOwed: number;
  /** What the sale leaves after the payment to the loan. */
  leftOver: number;
  /** The payment is more than the balance: the sale cannot be recorded. */
  exceeds: boolean;
}

/** D-16: what a sale and its payment to the loan leave, from the balance, what it sold for and what pays the loan. */
export function saleOutcome(balance: number, soldFor: number, paidWith: number): SaleOutcome {
  const exceeds = paidWith > balance;
  const paid = Math.min(paidWith, balance);
  return { paidOff: !exceeds && paid >= balance, stillOwed: Math.max(0, balance - paid), leftOver: Math.max(0, soldFor - paidWith), exceeds };
}
