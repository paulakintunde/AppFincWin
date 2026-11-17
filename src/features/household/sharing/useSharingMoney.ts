// 08-19: one place the sharing screens turn minor units into words, so every figure on a shared line uses the same
// Show cents setting as the rest of Record.
import { money } from '@/engine/money';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';

export function useSharingMoney(currency: string): (minor: number) => string {
  const rc = useRecordContext();
  const formatter = useMoneyFormatter(rc.showCents);
  return (minor: number) => formatter.formatMoney(money(minor, currency));
}
