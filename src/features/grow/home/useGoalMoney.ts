// The Grow money formatter (whole units, calculator currency). Lives apart from GoalsSegment so the goal sheets can use it
// without importing the segment that mounts them (no import cycle).
import { useMemo } from 'react';
import { currencyCode, minorUnits } from '@/engine/money';
import { useCalcFormat } from '@/features/grow/calculators/typed/CalcFields';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import type { GoalRowMoney } from './GoalRow';

const MONTH_SPOKEN = { month: 'long', year: 'numeric', timeZone: 'UTC' } as const;

export function useGoalMoney(): GoalRowMoney {
  const calc = useCalcFormat();
  const whole = useMoneyFormatter(false, calc.currency);
  return useMemo(() => {
    const cur = currencyCode(calc.currency);
    return {
      amount: (minor) => whole.formatMoney({ amount: minorUnits(minor), currency: cur }),
      spoken: (minor) => whole.formatMoneyA11y({ amount: minorUnits(minor), currency: cur }),
      monthYear: calc.monthYear,
      monthYearLong: (date) => {
        const [y, m] = date.split('-').map(Number);
        return new Intl.DateTimeFormat(whole.locale, MONTH_SPOKEN).format(Date.UTC(y!, m! - 1, 1));
      },
    };
  }, [calc, whole]);
}
