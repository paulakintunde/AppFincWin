import { renderHook } from '@testing-library/react-native';
import * as money from '@/engine/money';
import { currencyCode, minorUnits } from '@/engine/money';
import { FORMAT_MEMO_MAX, useMoneyFormatter } from '../useMoneyFormatter';

jest.mock('@/services/locale/deviceLocale', () => ({
  useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC' }),
}));
jest.mock('@/engine/money', () => {
  const actual = jest.requireActual<typeof import('@/engine/money')>('@/engine/money');
  return { ...actual, formatAmount: jest.fn(actual.formatAmount), formatLocalDate: jest.fn(actual.formatLocalDate), formatMoneyA11y: jest.fn(actual.formatMoneyA11y) };
});

const usd = (n: number) => ({ amount: minorUnits(n), currency: currencyCode('USD') });

describe('06.1-72 useMoneyFormatter keeps the strings it made (G-73-2)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('formats an amount, a spoken amount and a date once per formatter and returns the same text', async () => {
    const { result, rerender } = await renderHook(() => useMoneyFormatter(true, 'USD'));
    const first = result.current.formatMoney(usd(1234));
    expect(result.current.formatMoney(usd(1234))).toBe(first);
    expect(first).toBe(money.formatAmount(usd(1234), { locale: 'en-US', showCents: true }));
    expect(money.formatAmount).toHaveBeenCalledTimes(2); // one memo miss plus the direct call above
    const spoken = result.current.formatMoneyA11y(usd(500));
    expect(result.current.formatMoneyA11y(usd(500))).toBe(spoken);
    expect(money.formatMoneyA11y).toHaveBeenCalledTimes(1);
    const date = result.current.formatDate('2026-11-13', 'short');
    expect(result.current.formatDate('2026-11-13', 'short')).toBe(date);
    expect(result.current.formatDate('2026-11-13')).not.toBe(undefined);
    expect(money.formatLocalDate).toHaveBeenCalledTimes(2); // short and the default style are two keys
    // a re-render keeps the formatter and its strings
    await rerender({});
    result.current.formatMoney(usd(1234));
    expect(money.formatAmount).toHaveBeenCalledTimes(2);
    // a custom currency's options are part of the key
    result.current.formatMoney(usd(1234), { exponent: 0, customSymbol: 'pts' });
    expect(money.formatAmount).toHaveBeenCalledTimes(3);
  });

  it('starts over once it holds the most strings', async () => {
    const { result } = await renderHook(() => useMoneyFormatter(false));
    for (let i = 0; i <= FORMAT_MEMO_MAX; i += 1) result.current.formatMoney(usd(i * 100));
    expect(money.formatAmount).toHaveBeenCalledTimes(FORMAT_MEMO_MAX + 1);
    result.current.formatMoney(usd(0)); // dropped when the memo started over
    expect(money.formatAmount).toHaveBeenCalledTimes(FORMAT_MEMO_MAX + 2);
  });
});
