import { minorUnits } from '@/engine/money';
import { costPrefill, type PrefillSeries } from '../costPrefill';
import { percentToText, textToPercent } from '../percentText';

jest.setTimeout(60000);

const s = (over: Partial<PrefillSeries>): PrefillSeries => ({ id: 's1', name: 'Car insurance', amount: minorUnits(14000), categoryKey: 'Insurance', freq: 'monthly', ...over });

describe('costPrefill', () => {
  it('offers a monthly insurance series for insurance_monthly', () => {
    expect(costPrefill('insurance_monthly', [s({})])).toEqual({ amount: 14000, name: 'Car insurance' });
  });
  it('offers a yearly insurance series for home_insurance only', () => {
    const yearly = s({ freq: 'yearly', amount: minorUnits(120000), name: 'Home cover' });
    expect(costPrefill('home_insurance', [s({}), yearly])).toEqual({ amount: 120000, name: 'Home cover' });
    expect(costPrefill('insurance_monthly', [yearly])).toBeNull();
  });
  it('returns null with no exact category match, no series, a zero amount or an unmapped question', () => {
    expect(costPrefill('insurance_monthly', [s({ categoryKey: 'Utilities' })])).toBeNull();
    expect(costPrefill('insurance_monthly', [s({ categoryKey: null })])).toBeNull();
    expect(costPrefill('insurance_monthly', [])).toBeNull();
    expect(costPrefill('insurance_monthly', [s({ amount: minorUnits(0) })])).toBeNull();
    expect(costPrefill('fuel_monthly', [s({})])).toBeNull();
    expect(costPrefill('utilities_change', [s({ categoryKey: 'Utilities' })])).toBeNull();
  });
});

describe('percentText', () => {
  it('round-trips exact decimals and keeps 0', () => {
    for (const t of ['0', '7', '6.9', '0.05', '100']) expect(percentToText(textToPercent(t))).toBe(t);
  });
  it('reads empty, null and unfinished text as null', () => {
    expect(percentToText(null)).toBe('');
    expect(textToPercent('')).toBeNull();
    expect(textToPercent('5.')).toBeNull();
  });
});
