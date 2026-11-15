import { moneyFn } from '../moneyFn';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';

describe('moneyFn', () => {
  it('binds a formatter to one currency and passes minor units through', () => {
    const formatMoney = jest.fn(({ amount, currency }: { amount: number; currency: string }) => `${currency} ${amount}`);
    const money = moneyFn({ formatMoney } as unknown as MoneyFormatter, 'EUR' as never);
    expect(money(1250)).toBe('EUR 1250');
    expect(formatMoney).toHaveBeenCalledWith({ amount: 1250, currency: 'EUR' });
  });
});
