import { minorUnits } from '@/engine/money';
import { i18n } from '@/i18n';
import { refText } from '../../check/refText';
import { loggedSource, roughSource } from '../../snapshot/__tests__/helpers/snapshotFixtures';
import { keyFigureInputs, keyFigures, keyFiguresLabel } from '../keyFiguresCopy';
import type { KeyFigureInputs } from '../keyFiguresCopy';
import { fmt, fmtCents } from './helpers/fixtures';
import type { CopyRef } from '../types';
import { buy } from '../../check/steps/__tests__/helpers/stepProps';
import { computeCheck } from '../../snapshot/computeCheck';

const t = (key: string, params?: Record<string, string | number>): string => String((i18n.t as (k: string, o?: Record<string, string | number>) => unknown)(key, params));
const text = (r: CopyRef): string => refText(t, r);
const NBSP = ' ';

const base: KeyFigureInputs = { left: minorUnits(50_000), cushionMonths: 4, monthly: minorUnits(12_345), kind: 'buy' };
const run = (over: Partial<KeyFigureInputs> = {}) => keyFigures({ ...base, ...over }, fmt, fmtCents, text);

describe('keyFiguresCopy', () => {
  it('D-74 key figures are free a month, cushion months and the monthly cost', () => {
    const k = run();
    expect(k.items.map((i) => i.caption)).toEqual(['Free a month', 'Cushion', 'A month']);
    expect(k.items.map((i) => i.value)).toEqual(['$50000', `4${NBSP}months`, '$123.45']);
    expect(k.items.map((i) => i.kind)).toEqual(['figure', 'figure', 'figure']);
    expect(text(k.a11y)).toBe(`Free each month after this: $50000. Cushion: 4${NBSP}months of costs. Monthly cost: $123.45.`);
    expect(run({ cushionMonths: 1 }).items[1]!.value).toBe(`1${NBSP}month`);
  });

  it('D-106 the key figure caption flips with the sign and carries no minus', () => {
    const k = run({ left: minorUnits(-2_000) });
    expect(k.items[0]).toMatchObject({ caption: 'Overspent a month', value: '$2000', negative: true });
    expect(k.items[0]!.value).not.toContain('-');
    expect(k.items[1]!.negative).toBe(false);
    expect(text(k.a11y)).toBe(`Overspent each month after this: $2000. Cushion: 4${NBSP}months of costs. Monthly cost: $123.45.`);
    // zero is free, not overspent
    expect(run({ left: minorUnits(0) }).items[0]).toMatchObject({ caption: 'Free a month', value: '$0', negative: false });
  });

  it('D-93 a cushion over 600 months reads Over 50 years', () => {
    const over = run({ cushionMonths: 7676 });
    expect(over.items[1]).toMatchObject({ value: 'Over 50 years', kind: 'words' });
    expect(text(over.a11y)).toContain('Cushion: over 50 years of costs');
    expect(run({ cushionMonths: 601 }).items[1]!.value).toBe('Over 50 years');
    expect(run({ cushionMonths: 600 }).items[1]).toMatchObject({ value: `600${NBSP}months`, kind: 'figure' });
  });

  it('D-74 cushion reads Under 1 month and Not limited as words', () => {
    expect(run({ cushionMonths: 0 }).items[1]).toMatchObject({ value: 'Under 1 month', kind: 'words' });
    expect(run({ cushionMonths: null }).items[1]).toMatchObject({ value: 'Not limited', kind: 'words' });
    expect(run({ monthly: minorUnits(0) }).items[2]).toMatchObject({ value: 'None', kind: 'words' });
  });

  it('D-74 invest checks read Put in a month', () => {
    expect(run({ kind: 'invest' }).items[2]!.caption).toBe('Put in a month');
  });

  it('D-74 a logged assessment uses runwayMonthsOf over cash after the purchase and bills', () => {
    const c = computeCheck(loggedSource(), buy({ advertised: 150_000, method: 'cash' }));
    const a = c.verdict as unknown as { left: number; cashAfterBillsAndPurchase: number; burn: number; newMonthly: number };
    const inputs = keyFigureInputs(c, null)!;
    expect(inputs.left).toBe(a.left);
    expect(inputs.monthly).toBe(a.newMonthly);
    expect(inputs.cushionMonths).toBe(a.burn > 0 ? Math.floor(Math.max(0, a.cashAfterBillsAndPurchase) / a.burn) : null);
    expect(inputs.kind).toBe('buy');
  });

  it('D-74 a first read uses rough spending for the cushion', () => {
    const c = computeCheck(roughSource(600_000, 400_000, 250_000), buy({ advertised: 150_000, method: 'cash' }));
    expect(c.status).toBe('first_read');
    const fr = c.firstRead as unknown as { leftAfter: number; cashAfter: number; monthly: number };
    const inputs = keyFigureInputs(c, minorUnits(250_000))!;
    expect(inputs.left).toBe(fr.leftAfter);
    expect(inputs.monthly).toBe(fr.monthly);
    expect(inputs.cushionMonths).toBe(Math.floor(Math.max(0, fr.cashAfter) / 250_000));
    expect(keyFigureInputs(c, null)!.cushionMonths).toBeNull();
  });
});

describe('keyFiguresLabel', () => {
  it('D-102 the key figures a11y order is figures, total cost, invested', () => {
    const figures = text(run().a11y);
    const head = figures.slice(0, -1);
    expect(keyFiguresLabel(figures, 'Over 3 years, 23,412 dollars in all', 'Invested instead: 5,000 dollars. A projection, not a forecast.')).toBe(
      `${head}. Over 3 years, 23,412 dollars in all. Invested instead: 5,000 dollars. A projection, not a forecast.`
    );
    expect(keyFiguresLabel(figures, null, 'B')).toBe(`${head}. B.`);
    expect(keyFiguresLabel(figures, 'A', null)).toBe(`${head}. A.`);
    expect(keyFiguresLabel(figures, null, null)).toBe(figures);
    expect(keyFiguresLabel('', null, null)).toBe('.');
  });
});
