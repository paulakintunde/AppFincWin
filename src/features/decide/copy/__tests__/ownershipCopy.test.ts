import { minorUnits } from '@/engine/money';
import { percent } from '@/engine/decide';
import type { InvestmentHeadline, TotalCost } from '@/engine/decide';
import { i18n } from '@/i18n';
import { refText } from '../../check/refText';
import { investedRow, rateOneDecimal, tcoRow } from '../ownershipCopy';
import { fmt } from './helpers/fixtures';
import type { CopyRef } from '../types';

const t = (key: string, params?: Record<string, string | number>): string => String((i18n.t as (k: string, o?: Record<string, string | number>) => unknown)(key, params));
const text = (r: CopyRef): string => refText(t, r);
const spokenFmt = (n: number): string => `${n} dollars`;
const NBSP = ' ';

const tc = (over: Partial<TotalCost> = {}): TotalCost => ({
  horizonMonths: 60,
  total: minorUnits(2_341_200),
  interestAndFees: minorUnits(100),
  running: minorUnits(0),
  resale: minorUnits(0),
  trivial: false,
  ...over,
});
const head = (over: Partial<InvestmentHeadline> = {}): InvestmentHeadline => ({
  rate: percent('7'),
  contributed: minorUnits(100_000),
  projected: minorUnits(140_000),
  rangeCode: null,
  ...over,
});

describe('ownershipCopy', () => {
  it('D-102 whole years read Over 3 years, months otherwise', () => {
    const r = tcoRow(tc({ horizonMonths: 36 }), fmt, spokenFmt)!;
    expect(text(r.text)).toBe(`Over 3${NBSP}years: $2341200 in all`);
    expect(text(r.spoken)).toBe(`Over 3${NBSP}years, 2341200 dollars in all`);
    expect(text(tcoRow(tc({ horizonMonths: 12 }), fmt, spokenFmt)!.text)).toBe(`Over 1${NBSP}year: $2341200 in all`);
    expect(text(tcoRow(tc({ horizonMonths: 18 }), fmt, spokenFmt)!.text)).toBe(`Over 18${NBSP}months: $2341200 in all`);
    expect(text(tcoRow(tc({ horizonMonths: 1 }), fmt, spokenFmt)!.spoken)).toBe(`Over 1${NBSP}month, 2341200 dollars in all`);
  });

  it('D-102 a trivial or null total gives no row', () => {
    expect(tcoRow(null, fmt, spokenFmt)).toBeNull();
    expect(tcoRow(tc({ trivial: true }), fmt, spokenFmt)).toBeNull();
  });

  it('D-104 the rate prints as typed, one decimal at most', () => {
    expect(rateOneDecimal(percent('7'))).toBe('7');
    expect(rateOneDecimal(percent('7.0'))).toBe('7');
    expect(rateOneDecimal(percent('7.5'))).toBe('7.5');
    expect(rateOneDecimal(percent('7.25'))).toBe('7.3');
    expect(rateOneDecimal(percent('0.04'))).toBe('0');
  });

  it('D-104 the fee variant and the too-large variant', () => {
    const years = investedRow(head(), 60, null, fmt, spokenFmt, text)!;
    expect(text(years.text)).toBe(`Invested instead: $140000 after 5${NBSP}years at 7%`);
    expect(text(years.spoken)).toBe(`Invested instead: 140000 dollars after 5${NBSP}years at 7%. A projection, not a forecast.`);
    expect(text(investedRow(head(), 18, null, fmt, spokenFmt, text)!.text)).toBe(`Invested instead: $140000 after 18${NBSP}months at 7%`);
    expect(text(investedRow(head(), 12, null, fmt, spokenFmt, text)!.text)).toBe(`Invested instead: $140000 after 1${NBSP}year at 7%`);
    expect(text(investedRow(head(), 60, percent('0.5'), fmt, spokenFmt, text)!.text)).toBe(`Invested instead: $140000 after 5${NBSP}years at 7%, less 0.5% fees`);
    expect(text(investedRow(head(), 6, percent('1'), fmt, spokenFmt, text)!.text)).toBe(`Invested instead: $140000 after 6${NBSP}months at 7%, less 1% fees`);
    expect(text(investedRow(head(), 60, percent('0'), fmt, spokenFmt, text)!.text)).not.toContain('fees');
    const big = investedRow(head({ projected: null, rangeCode: 'exceeds_range' }), 60, null, fmt, spokenFmt, text)!;
    expect(text(big.text)).toBe('Invested instead: too large to project at 7%');
    expect(text(big.spoken)).toBe('Invested instead: too large to project at 7%. A projection, not a forecast.');
  });

  it('D-104 no headline gives no row', () => {
    expect(investedRow(null, 60, null, fmt, spokenFmt, text)).toBeNull();
  });
});
