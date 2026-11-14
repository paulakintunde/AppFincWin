import { i18n } from '@/i18n';
import { formatOrdinal } from '../ordinal';

const t = (k: string, o?: Record<string, unknown>) => String(i18n.t(k as never, (o ?? {}) as never));

describe('formatOrdinal', () => {
  it.each([
    [1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th'], [11, '11th'], [12, '12th'], [13, '13th'],
    [21, '21st'], [22, '22nd'], [23, '23rd'], [24, '24th'], [30, '30th'], [31, '31st'],
  ])('%i -> %s', (n, expected) => {
    expect(formatOrdinal(n, 'en', t)).toBe(expected);
  });

  it('falls back to the English rule when Intl.PluralRules is missing', () => {
    const original = Intl.PluralRules;
    (Intl as unknown as { PluralRules: unknown }).PluralRules = undefined;
    try {
      expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 24, 30, 31].map((n) => formatOrdinal(n, 'en', t))).toEqual([
        '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '24th', '30th', '31st',
      ]);
    } finally {
      (Intl as unknown as { PluralRules: unknown }).PluralRules = original;
    }
  });

  it('uses ordinal.other when the category key is missing', () => {
    const fake = (k: string, o?: Record<string, unknown>) => (k === 'ordinal.other' ? `${String(o?.n)}th` : k);
    expect(formatOrdinal(3, 'en', fake)).toBe('3th');
  });

  it('returns a non-integer as plain text', () => {
    expect(formatOrdinal(Number.NaN, 'en', t)).toBe('NaN');
    expect(formatOrdinal(2.5, 'en', t)).toBe('2.5');
  });
});

describe('ordinal copy', () => {
  it('reads as an ordinal at the surviving call site', () => {
    expect(t('income.pay.prefill', { payer: 'Acme', amount: '£19.99', day: 24 })).toContain('around the 24th of each month');
  });
});
