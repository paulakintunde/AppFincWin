import { formatStatementMoney } from '../statementMoney';

describe('formatStatementMoney (review ME-01)', () => {
  const ok = { formatMoney: (m: { amount: number; currency: string }) => `${m.currency}:${m.amount}` };
  const throwing = {
    formatMoney: () => {
      throw new RangeError('Invalid currency code');
    },
  };

  it('formats a known code through the formatter', () => {
    expect(formatStatementMoney(ok, 4500, 'USD')).toBe('USD:4500');
  });

  it('reads an unknown or malformed code as code + plain number, never calling Intl', () => {
    expect(formatStatementMoney(throwing, 4500, 'AB')).toBe('AB 45.00');
    expect(formatStatementMoney(throwing, 4500, 'XY12')).toBe('XY12 45.00');
    expect(formatStatementMoney(throwing, 4500, 'usd')).toBe('usd 45.00');
  });

  it('falls back with the ISO scale when the formatter throws for a known code', () => {
    expect(formatStatementMoney(throwing, 500, 'JPY')).toBe('JPY 500');
    expect(formatStatementMoney(throwing, 1234, 'KWD')).toBe('KWD 1.234');
  });
});
