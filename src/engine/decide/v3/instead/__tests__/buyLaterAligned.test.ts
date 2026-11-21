/**
 * 08.1 D-05 (owner 2026-11-20, plan 13): Buy it later reads the answer's own ready-by month, so the option and the answer agree.
 */
import { minorUnits } from '../../../../money/types';
import { SOLE_SHARE } from '../../../share';
import type { Funds, MonthModel, Purchase, Result } from '../../types';
import { alignBuyLater, answerReadyMonth, insteadFutures } from '../futures';

const mu = minorUnits;
const usual = (readyBy: string | null, months: number | null = 3) => ({ months, readyBy, monthlyAmount: mu(1000) });
const res = (over: object): Result => ({ code: 'not_yet', facts: [], readyBy: null, ...over }) as unknown as Result;

describe('answerReadyMonth', () => {
  it('reads a month, a date, no date inside a year, and leaves other answers alone', () => {
    expect(answerReadyMonth(res({ readyBy: { kind: 'month', month: '2027-02' } }))).toBe('2027-02');
    expect(answerReadyMonth(res({ readyBy: { kind: 'date', date: '2027-03-15' } }))).toBe('2027-03');
    expect(answerReadyMonth(res({ facts: [{ code: 'not_within_year', values: {} }] }))).toBeNull();
    expect(answerReadyMonth(res({}))).toBeUndefined();
    expect(answerReadyMonth(res({ code: 'fits_month' }))).toBeUndefined();
    expect(answerReadyMonth({ code: 'not_yet', facts: [] } as unknown as Result)).toBeUndefined();
  });
});

describe('alignBuyLater', () => {
  it('returns the answer month at lever 0', () => {
    expect(alignBuyLater(usual('2026-12'), usual('2026-12'), '2026-11', '2027-06')).toEqual({ months: 7, readyBy: '2027-06', monthlyAmount: mu(1000) });
  });
  it('moves earlier by what the lever saved, never before the month after the check month', () => {
    expect(alignBuyLater(usual('2026-12'), usual('2027-02'), '2026-11', '2027-06').readyBy).toBe('2027-04');
    expect(alignBuyLater(usual('2026-12'), usual('2030-12'), '2026-11', '2027-06').readyBy).toBe('2026-12');
  });
  it('does not move when either usual month is unknown, and gives no date with none in a year', () => {
    expect(alignBuyLater(usual(null), usual('2027-02'), '2026-11', '2027-06').readyBy).toBe('2027-06');
    expect(alignBuyLater(usual('2026-12'), usual(null), '2026-11', '2027-06').readyBy).toBe('2027-06');
    expect(alignBuyLater(usual('2027-03'), usual('2027-01'), '2026-11', '2027-06').readyBy).toBe('2027-06');
    expect(alignBuyLater(usual('2026-12'), usual('2027-02'), '2026-11', null)).toEqual({ months: null, readyBy: null, monthlyAmount: mu(1000) });
  });
});

describe('insteadFutures Buy it later follows the answer', () => {
  const month = { month: '2026-11', typicalLeft: mu(42500) } as unknown as MonthModel;
  const funds = { unspent: { value: mu(240000) } } as unknown as Funds;
  const purchase = { whole: mu(300000), dayOne: mu(300000), monthly: mu(0), schedule: null, share: SOLE_SHARE, purpose: null } as unknown as Purchase;
  const check = { price: mu(300000), value: { cheaperPrice: null, useYears: null } };
  const run = (result: Result) => insteadFutures({ check, result, month, funds, purchase, userRate: null, years: 1 }).buyLater;
  it('uses the answer month on a not-yet answer, none past a year, and its own figure otherwise', () => {
    expect(run(res({ readyBy: { kind: 'month', month: '2027-06' } })).readyBy).toBe('2027-06');
    expect(run(res({ facts: [{ code: 'not_within_year', values: {} }] })).readyBy).toBeNull();
    expect(run(res({ code: 'fits_month' })).readyBy).toBe('2027-01');
  });
});
