import en from '@/i18n/locales/en';
import {
  FOLD_INFO,
  FOLD_INFO_INVEST,
  FOLD_ORDER,
  FOLD_TITLE,
  FOLD_TITLE_INVEST,
  assumptionsPreview,
  cashPathPreview,
  ifInvestedPreview,
  incomePreview,
  investPreview,
  joinPreview,
  monthPreview,
  optionsPreview,
  setbacksPreview,
  whatBreaksPreview,
  whereItLandsPreview,
  whoPaysPreview,
  type Preview,
} from '../foldCopy';
import { resolvesInEn } from './helpers/enKeys';

const node = (path: string): string | undefined => {
  const v = path.split('.').reduce<unknown>((n, p) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[p] : undefined), en);
  return typeof v === 'string' ? v : undefined;
};

/** A minimal stand-in for the i18n `t`: plural suffix by count, then {{param}} interpolation. */
function t(key: string, params: Record<string, string | number> = {}): string {
  const count = params.count;
  const raw = (typeof count === 'number' ? node(`${key}_${count === 1 ? 'one' : 'other'}`) : undefined) ?? node(key);
  if (raw === undefined) throw new Error(`missing ${key}`);
  return raw.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(params[name]));
}

const text = (p: Preview) => joinPreview(t, p);
const FV = '$1,234';

describe('foldCopy', () => {
  it('D-74 fold previews follow the R2 table', () => {
    expect(text(whatBreaksPreview(1, false))).toBe('1 line breaks');
    expect(text(whatBreaksPreview(3, false))).toBe('3 lines break');
    expect(text(whatBreaksPreview(2, true))).toBe('2 lines break · on the edge');
    expect(text(whatBreaksPreview(0, false))).toBe('Nothing breaks');
    expect(text(whatBreaksPreview(0, true))).toBe('Nothing breaks · on the edge');
    expect(text(monthPreview('$900', '$400'))).toBe('Left at month end: $900 now, $400 after');
    expect(text(cashPathPreview({ amount: '$120', date: '3 Nov' }))).toBe('Lowest with this: $120 on 3 Nov');
    expect(text(cashPathPreview(null))).toBe('No recurring pay series yet');
    const lands = (...d: ('better' | 'worse' | 'same')[]) => text(whereItLandsPreview(d.map((direction) => ({ direction }))));
    expect(lands('better', 'worse', 'worse', 'same', 'same')).toBe('1 better · 2 worse · 2 unchanged');
    expect(lands('worse', 'same')).toBe('1 worse · 1 unchanged');
    expect(lands('same', 'same')).toBe('No ledger moves');
    expect(lands()).toBe('No ledger moves');
    expect(text(setbacksPreview(6, 2))).toBe('Runway 6 months, 2 less because of this');
    expect(text(setbacksPreview(1, 1))).toContain('Runway 1 month,');
    expect(text(setbacksPreview(null, null))).toBe('Runway not limited');
    expect(text(optionsPreview(1))).toBe('1 option');
    expect(text(optionsPreview(3))).toBe('3 options');
    expect(text(ifInvestedPreview(null))).toBe('A projection at the rate you enter');
    expect(text(ifInvestedPreview({ fv: FV, months: 24, rate: '5' }))).toBe('$1,234 after 24 months at 5%');
    expect(text(incomePreview('fits', '$500'))).toBe('Fits with the expected $500 a month');
    expect(text(whoPaysPreview(2))).toBe('2 people');
    expect(text(whoPaysPreview(1))).toBe('1 person');
    expect(text(assumptionsPreview(7))).toBe('7 assumptions');
  });

  it('D-74 every preview fits 44 characters at demo scale', () => {
    const big = { fv: '$1,234', months: 100, rate: '12.5' };
    const all: Preview[] = [
      whatBreaksPreview(6, true),
      whatBreaksPreview(0, true),
      monthPreview('$1,234', '$1,234'),
      cashPathPreview({ amount: '$1,234', date: '30 Nov' }),
      cashPathPreview(null),
      whereItLandsPreview([{ direction: 'better' }, { direction: 'better' }, { direction: 'worse' }, { direction: 'same' }, { direction: 'same' }]),
      setbacksPreview(100, 12),
      setbacksPreview(null, null),
      optionsPreview(12),
      ifInvestedPreview(null),
      ifInvestedPreview(big),
      investPreview(big),
      investPreview(null),
      investPreview('outOfRange'),
      incomePreview('fits', '$1,234'),
      whoPaysPreview(12),
      assumptionsPreview(12),
    ];
    for (const p of all) expect(text(p).length).toBeLessThanOrEqual(44);
    // The R2 wording "Needs adjustment with the expected {amount} a month" is 49 characters at $1,234; the FoldRow preview wraps (05-59).
    for (const s of ['adjust', 'no'] as const) expect(text(incomePreview(s, '$1,234')).length).toBeLessThanOrEqual(50);
  });

  it('D-74 FOLD_ORDER is the R2 order', () => {
    expect(FOLD_ORDER).toEqual(['whatBreaks', 'month', 'cashPath', 'whereItLands', 'setbacks', 'options', 'ifInvested', 'income', 'whoPays', 'assumptions']);
    for (const k of FOLD_ORDER) expect(resolvesInEn(FOLD_TITLE[k])).toBe(true);
    expect(FOLD_INFO).toEqual({ whatBreaks: 'whatBreaks', cashPath: 'cashPath', whereItLands: 'whereItLands', setbacks: 'setbacks', ifInvested: 'ifInvested', income: 'incomeChange' });
  });

  it('D-82 investment fold 7 reads What it could grow to with its preview', () => {
    expect(t(FOLD_TITLE_INVEST.ifInvested ?? '')).toBe('What it could grow to');
    expect(FOLD_INFO_INVEST.ifInvested).toBe('expectedReturn');
    expect(text(investPreview({ fv: '$1,234', months: 120, rate: '7' }))).toBe('$1,234 after 120\u00A0months at 7%\u00A0a year');
    expect(text(investPreview({ fv: '$1,234', months: 1, rate: '7' }))).toBe('$1,234 after 1\u00A0month at 7%\u00A0a year');
    expect(text(investPreview(null))).toBe('No expected return set');
    expect(text(investPreview('outOfRange'))).toBe('Too large to project at this rate');
  });
});
