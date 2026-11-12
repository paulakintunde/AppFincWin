// 06-13: the four typed calculators (GC10 loan, GC20 savings, GC30 compound growth, GC40 debt payoff) as pure functions.
// No React, no I/O, no English: results are minor units, counts and ISO dates, and the worked-out box is a list of
// copy keys with values (money and dates are wrapped so the screen formats them). Every figure comes from engine/payoff
// or engine/grow; nothing is worked out here. Any empty or invalid field gives null ("Fill in the numbers above").
// Bounds (T-06-13-01): amounts 0..10^13, months 1..600, years 1..50.
import { MAX_ABS_AMOUNT_MINOR, divideHalfUp } from '@/engine/money';
import { depositDate, monthsToReach } from '@/engine/grow';
import {
  MAX_TERM_MONTHS,
  amortise,
  compoundSteps,
  percent,
  strategy,
  ZERO_PERCENT,
  type PayoffOutcome,
  type Percent,
  type PlanDebt,
} from '@/engine/payoff';
import type { MinorUnits } from '@/engine/money';

/** A value in a worked-out line: plain text or a count, or a wrapped amount or date the screen formats. */
export type WorkedValue = number | string | { money: number } | { date: string };

export type WorkedKey =
  | 'grow.calc.loan.worked'
  | 'grow.calc.savings.worked'
  | 'grow.calc.compound.worked'
  | 'grow.calc.payoff.worked';

export interface WorkedLine {
  key: WorkedKey;
  values: Record<string, WorkedValue>;
}

export const MAX_YEARS = 50;

const minor = (n: number): MinorUnits => n as MinorUnits;

/** A whole amount inside 0..10^13, else null. */
function amountOrNull(n: number | null): number | null {
  if (n === null || !Number.isSafeInteger(n) || n < 0 || n > MAX_ABS_AMOUNT_MINOR) return null;
  return n;
}

function wholeInRange(n: number | null, lo: number, hi: number): number | null {
  if (n === null || !Number.isInteger(n) || n < lo || n > hi) return null;
  return n;
}

/** Typed rate text -> engine Percent. A comma counts as the decimal mark. Null for blank or anything percent() rejects. */
export function parseRateText(text: string): { rate: Percent; display: string } | null {
  const display = text.trim().replace(',', '.');
  if (display === '') return null;
  try {
    return { rate: percent(display), display };
  } catch {
    return null;
  }
}

/** The monthly rate (yearly / 12) as text, to 4 places, trailing zeros dropped. Bigint maths only. */
function monthlyRateText(rate: Percent): string {
  // `rate` is a percentage at 10 decimal places; 4 places of the monthly figure is rate / (12 x 10^6), half up.
  const q = divideHalfUp(BigInt(rate), 12n * 10n ** 6n);
  const whole = q / 10000n;
  const frac = (q % 10000n).toString().padStart(4, '0').replace(/0+$/, '');
  return frac === '' ? whole.toString() : `${whole}.${frac}`;
}

/** Runs a calculation whose engine call may throw on a figure too large for safe integers; the answer is then "no result". */
function guarded<T>(run: () => T | null): T | null {
  try {
    return run();
  } catch (e) {
    if (e instanceof RangeError) return null;
    throw e;
  }
}

// ---- GC10 loan ----

export interface LoanInput {
  amount: number | null;
  rate: string;
  months: number | null;
}

export interface LoanResult {
  payment: number;
  last: number;
  totalInterest: number;
  totalPaid: number;
  months: number;
  workedOut: WorkedLine[];
}

export function loanCalc(input: LoanInput): LoanResult | null {
  const amount = amountOrNull(input.amount);
  const months = wholeInRange(input.months, 1, MAX_TERM_MONTHS);
  const parsed = parseRateText(input.rate);
  if (amount === null || amount === 0 || months === null || parsed === null) return null;
  return guarded(() => {
    const a = amortise(minor(amount), parsed.rate, months);
    return {
      payment: a.payment,
      last: a.finalPayment,
      totalInterest: a.totalInterest,
      totalPaid: a.totalPaid,
      months,
      workedOut: [
        {
          key: 'grow.calc.loan.worked',
          values: {
            rate: parsed.display,
            monthly: monthlyRateText(parsed.rate),
            amount: { money: amount },
            count: months,
            last: { money: a.finalPayment },
          },
        },
      ],
    };
  });
}

// ---- GC20 savings ----

export interface SavingsInput {
  target: number | null;
  saved: number | null;
  monthly: number | null;
  /** Blank counts as 0. */
  rate: string;
  /** The date of the first deposit, YYYY-MM-DD. */
  start: string;
}

export interface SavingsResult {
  deposits: number;
  reachesOn: string;
  putIn: number;
  interest: number;
  total: number;
  workedOut: WorkedLine[];
}

export function savingsCalc(input: SavingsInput): SavingsResult | null {
  const target = amountOrNull(input.target);
  const saved = amountOrNull(input.saved);
  const monthly = amountOrNull(input.monthly);
  const parsed = input.rate.trim() === '' ? { rate: ZERO_PERCENT, display: '0' } : parseRateText(input.rate);
  if (target === null || target === 0 || saved === null || monthly === null || parsed === null) return null;
  if (saved >= target) return null;
  return guarded(() => {
    const r = monthsToReach(minor(saved), minor(target), minor(monthly), parsed.rate);
    if (r.deposits === null || r.deposits < 1) return null;
    return {
      deposits: r.deposits,
      reachesOn: depositDate(input.start, r.deposits),
      putIn: saved + r.deposits * monthly,
      interest: r.interest,
      total: r.value,
      workedOut: [
        {
          key: 'grow.calc.savings.worked',
          values: {
            rate: parsed.display,
            monthly: monthlyRateText(parsed.rate),
            each: { money: monthly },
            count: r.deposits,
            value: { money: r.value },
          },
        },
      ],
    };
  });
}

// ---- GC30 compound growth ----

export interface CompoundInput {
  start: number | null;
  monthly: number | null;
  rate: string;
  years: number | null;
}

export interface CompoundResult {
  value: number;
  putIn: number;
  growth: number;
  years: { value: number; putIn: number; growth: number }[];
  workedOut: WorkedLine[];
}

export function compoundCalc(input: CompoundInput): CompoundResult | null {
  const start = amountOrNull(input.start);
  const monthly = amountOrNull(input.monthly);
  const years = wholeInRange(input.years, 1, MAX_YEARS);
  const parsed = parseRateText(input.rate);
  if (start === null || monthly === null || years === null || parsed === null) return null;
  return guarded(() => {
    const c = compoundSteps(minor(start), minor(monthly), parsed.rate, years * 12);
    return {
      value: c.value,
      putIn: c.putIn,
      growth: c.growth,
      years: c.years.map((y) => ({ value: y.value, putIn: y.putIn, growth: y.value - y.putIn })),
      workedOut: [
        {
          key: 'grow.calc.compound.worked',
          values: {
            rate: parsed.display,
            monthly: { money: monthly },
            count: years * 12,
            put: { money: c.putIn },
            growth: { money: c.growth },
          },
        },
      ],
    };
  });
}

// ---- GC40 debt payoff ----

export interface DebtInput {
  balance: number | null;
  rate: string;
  minimum: number | null;
}

export interface PayoffInput {
  debts: DebtInput[];
  extra: number | null;
  /** The date of the first payment, YYYY-MM-DD. */
  start: string;
}

export interface OrderResult {
  outcome: PayoffOutcome;
  months: number;
  /** The date of the last payment; null unless the debts clear. */
  endDate: string | null;
  /** Total interest; null unless the debts clear. */
  interest: number | null;
  /** The debt cleared first: its position in the input list and the month. */
  firstCleared: { index: number; month: number } | null;
}

export interface PayoffResult {
  /** Minimums plus the extra: the constant monthly amount in the two orders. */
  budget: number;
  rate: OrderResult;
  balance: OrderResult;
  minimumsOnly: OrderResult;
  sameForOneDebt: boolean;
  /** Which debt (position in the input) the extra goes to first in each order. */
  extraTo: { rate: number; balance: number };
  workedOut: WorkedLine[];
}

function orderResult(
  debts: readonly PlanDebt[],
  extra: number,
  order: 'rate' | 'balance',
  start: string,
): OrderResult {
  const s = strategy(debts, minor(extra), order);
  const cleared = s.outcome === 'cleared';
  let first: { index: number; month: number } | null = null;
  for (let index = 0; index < s.debts.length; index++) {
    const month = s.debts[index]!.doneMonth;
    if (month !== null && (first === null || month < first.month)) first = { index, month };
  }
  return {
    outcome: s.outcome,
    months: s.months,
    endDate: cleared && s.months >= 1 ? depositDate(start, s.months) : null,
    interest: cleared ? s.totalInterest : null,
    firstCleared: first,
  };
}

/** Position of the debt that wins `beats` over all others; the earlier one in the list on a tie (as the engine orders them). */
function pickFirst(plan: readonly PlanDebt[], beats: (a: PlanDebt, b: PlanDebt) => boolean): number {
  let best = 0;
  for (let i = 1; i < plan.length; i++) if (beats(plan[i]!, plan[best]!)) best = i;
  return best;
}

export function debtPayoffCalc(input: PayoffInput): PayoffResult | null {
  const extra = amountOrNull(input.extra);
  if (extra === null || input.debts.length === 0) return null;
  const plan: PlanDebt[] = [];
  for (let i = 0; i < input.debts.length; i++) {
    const d = input.debts[i]!;
    const balance = amountOrNull(d.balance);
    const minimum = amountOrNull(d.minimum);
    const parsed = parseRateText(d.rate);
    if (balance === null || balance === 0 || minimum === null || parsed === null) return null;
    plan.push({ id: String(i), balance: minor(balance), apr: parsed.rate, minimum: minor(minimum) });
  }
  return guarded(() => {
    const rate = orderResult(plan, extra, 'rate', input.start);
    const balance = orderResult(plan, extra, 'balance', input.start);
    const minimumsOnly = orderResult(plan, 0, 'rate', input.start);
    const budget = plan.reduce((sum, d) => sum + d.minimum, extra);
    return {
      budget,
      rate,
      balance,
      minimumsOnly,
      sameForOneDebt: plan.length === 1,
      extraTo: { rate: pickFirst(plan, (a, b) => a.apr > b.apr), balance: pickFirst(plan, (a, b) => a.balance < b.balance) },
      workedOut: [{ key: 'grow.calc.payoff.worked', values: { budget: { money: budget } } }],
    };
  });
}
