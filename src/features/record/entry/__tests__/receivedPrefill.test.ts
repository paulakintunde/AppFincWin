import { prefillAmountInText } from '../receivedPrefill';
import type { FxLatestRow } from '@/db/rows';

const rates = [{ quote: 'GBP', rate: '0.86', rate_date: '2026-09-24', source: 'frankfurter-v2' }] as unknown as FxLatestRow[];
const parse = (text: string) => {
  const n = Number(text);
  return text !== '' && Number.isFinite(n) ? ({ ok: true, value: Math.round(n * 100) } as const) : ({ ok: false } as const);
};
const base = {
  rates,
  parse,
  exponentFor: () => 2,
  toInputText: (m: number) => (m / 100).toFixed(2),
};

describe('prefillAmountInText', () => {
  it('converts GBP to EUR half-up', () => {
    expect(prefillAmountInText({ ...base, amountText: '10', currency: 'GBP', toCurrency: 'EUR' })).toBe('11.63');
  });
  it('converts EUR to GBP', () => {
    expect(prefillAmountInText({ ...base, amountText: '10', currency: 'EUR', toCurrency: 'GBP' })).toBe('8.60');
  });
  it('is empty with no stored rate', () => {
    expect(prefillAmountInText({ ...base, rates: [], amountText: '10', currency: 'GBP', toCurrency: 'USD' })).toBe('');
  });
  it('is empty for unparseable or empty sent text', () => {
    expect(prefillAmountInText({ ...base, amountText: '', currency: 'GBP', toCurrency: 'EUR' })).toBe('');
    expect(prefillAmountInText({ ...base, amountText: 'x', currency: 'GBP', toCurrency: 'EUR' })).toBe('');
  });
  it('is empty for same currency or no destination', () => {
    expect(prefillAmountInText({ ...base, amountText: '10', currency: 'GBP', toCurrency: 'GBP' })).toBe('');
    expect(prefillAmountInText({ ...base, amountText: '10', currency: 'GBP', toCurrency: null })).toBe('');
  });
  it('is empty when the conversion throws', () => {
    expect(prefillAmountInText({ ...base, exponentFor: () => 7, amountText: '10', currency: 'GBP', toCurrency: 'EUR' })).toBe('');
  });
});
