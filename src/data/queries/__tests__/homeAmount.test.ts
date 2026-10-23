import { homeAmountFor, isOwnCurrencyRow, latestPerEur, projectionHomeAmount } from '../homeAmount';
import type { FxLatestRow } from '@/db/rows';

const row = (quote: string, rate: string): FxLatestRow =>
  ({ quote, rate, rate_date: '2026-10-01', source: 'frankfurter-v2' }) as FxLatestRow;

describe('projectionHomeAmount with missing stored rates (02-48)', () => {
  it('returns null when either leg is missing, never an estimate', () => {
    expect(projectionHomeAmount(10000, 'GBP', 'USD', [])).toBeNull();
    expect(projectionHomeAmount(10000, 'GBP', 'USD', [row('USD', '1.1')])).toBeNull();
    expect(projectionHomeAmount(10000, 'GBP', 'USD', [row('GBP', '0.85')])).toBeNull();
  });

  it('needs only the other leg when one side is EUR', () => {
    expect(projectionHomeAmount(10000, 'EUR', 'USD', [row('USD', '1.1')])).not.toBeNull();
    expect(projectionHomeAmount(10000, 'GBP', 'EUR', [row('GBP', '0.85')])).not.toBeNull();
    expect(projectionHomeAmount(10000, 'EUR', 'USD', [])).toBeNull();
  });

  it('converts when both legs are stored', () => {
    expect(projectionHomeAmount(10000, 'GBP', 'USD', [row('GBP', '0.8'), row('USD', '1.2')])).toBe(15000);
  });

  it('treats EUR as 1 with an empty table and unknown codes as null', () => {
    expect(latestPerEur([], 'EUR')).not.toBeNull();
    expect(latestPerEur([], 'GBP')).toBeNull();
  });
});

describe('homeAmountFor for a row saved in its own currency before the home currency changed', () => {
  const rates = [row('GBP', '0.8'), row('USD', '1.2')];
  const sameCurrency = {
    home_currency: 'GBP',
    home_amount: -10000,
    original_amount: -10000,
    original_currency: 'GBP',
    orig_per_eur: null,
  };

  it('keeps the stored home amount while the home currency is unchanged', () => {
    expect(homeAmountFor(sameCurrency, 'GBP', rates)).toBe(-10000);
  });

  it('converts the exact own-currency amount at the latest stored rate under a new home currency', () => {
    expect(homeAmountFor(sameCurrency, 'USD', rates)).toBe(-15000);
  });

  it('is null, not a guess, when the latest rate is not stored', () => {
    expect(homeAmountFor(sameCurrency, 'USD', [row('USD', '1.2')])).toBeNull();
  });

  it('resolves a custom currency through its reference', () => {
    const custom = { code: 'TOK', reference_currency: 'USD', unit_value: '0.5', as_of: '2026-10-10', decimals: 2 } as never;
    expect(homeAmountFor({ ...sameCurrency, original_currency: 'TOK', home_currency: 'TOK' }, 'USD', rates, [custom])).toBe(-5000);
  });

  it('still returns null for a foreign row with no orig_per_eur', () => {
    expect(homeAmountFor({ ...sameCurrency, original_currency: 'EUR' }, 'USD', rates)).toBeNull();
  });

  it('isOwnCurrencyRow is false for a stamped or already-home row', () => {
    expect(isOwnCurrencyRow(sameCurrency, 'GBP')).toBe(false);
    expect(isOwnCurrencyRow({ ...sameCurrency, orig_per_eur: '0.8' }, 'USD')).toBe(false);
    expect(isOwnCurrencyRow(sameCurrency, 'USD')).toBe(true);
  });
});
