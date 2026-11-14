import { minorUnits } from '@/engine/money';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';
import type { CurrencyCode } from '@/engine/decide';

/** A minor-unit formatter bound to one currency. */
export type Money = (minor: number) => string;

export function moneyFn(f: MoneyFormatter, currency: CurrencyCode): Money {
  return (n) => f.formatMoney({ amount: minorUnits(n), currency });
}
