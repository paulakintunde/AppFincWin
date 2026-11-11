// The Grow money formatter (whole units, calculator currency). Lives apart from GoalsSegment so the goal sheets can use it
// without importing the segment that mounts them (no import cycle).
// P4-WR-01: pass a goal's own currency to format that goal's figures in it; omitted, the home (calculator) currency is used.
import { useMemo } from 'react';
import { currencyCode, minorUnits } from '@/engine/money';
import { currencyExponent } from '@/engine/money/currencyExponents';
import { useCalcFormat } from '@/features/grow/calculators/typed/CalcFields';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import type { GoalRowMoney } from './GoalRow';

const MONTH_SPOKEN = { month: 'long', year: 'numeric', timeZone: 'UTC' } as const;

export interface GoalMoney extends GoalRowMoney {
  /** The currency these amounts are formatted in. */
  currency: string;
  /** With cents, e.g. "$82.86". */
  exact(minor: number): string;
  /** Whole units when the amount is whole ("$200"), cents otherwise ("$82.86"), by the currency's own exponent. */
  plan(minor: number): string;
}

export function useGoalMoney(currency?: string): GoalMoney {
  const calc = useCalcFormat();
  const whole = useMoneyFormatter(false, calc.currency);
  const cents = useMoneyFormatter(true, calc.currency);
  const shown = currency ?? calc.currency;
  return useMemo(() => {
    const cur = currencyCode(shown);
    const amount = (minor: number) => whole.formatMoney({ amount: minorUnits(minor), currency: cur });
    const exact = (minor: number) => cents.formatMoney({ amount: minorUnits(minor), currency: cur });
    const unit = 10 ** currencyExponent(shown);
    return {
      currency: shown,
      amount,
      exact,
      plan: (minor) => (minor % unit === 0 ? amount(minor) : exact(minor)),
      spoken: (minor) => whole.formatMoneyA11y({ amount: minorUnits(minor), currency: cur }),
      monthYear: calc.monthYear,
      monthYearLong: (date) => {
        const [y, m] = date.split('-').map(Number);
        return new Intl.DateTimeFormat(whole.locale, MONTH_SPOKEN).format(Date.UTC(y!, m! - 1, 1));
      },
    };
  }, [calc, whole, cents, shown]);
}
