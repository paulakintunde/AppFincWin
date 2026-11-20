/**
 * 05.4-61 (D-177 a): quick overlay edges: a first payment on today's date, one payment, the flags a folded line carries, the
 * order of the quick-line fact against free_help, and identity of the objects handed back when nothing counts.
 */
import { minorUnits } from '../../../../money/types';
import { prepare } from '../../prepare';
import { withQuickFacts, withQuickLines, withQuickLinesPrepared } from '../../quick/overlay';
import type { CheckV2, Fact, QuickLine } from '../../types';
import { ASOF, checkOnce, inputsOf } from '../helpers/fixtures';

const mu = minorUnits;
const expense = (over: Partial<Extract<QuickLine, { kind: 'expense' }>> = {}): QuickLine => ({ id: 'e', kind: 'expense', name: 'Gym', amount: mu(5_000), everyMonths: 1, date: null, ...over });
const loan = (over: Partial<Extract<QuickLine, { kind: 'loan' }>> = {}): QuickLine => ({ id: 'l', kind: 'loan', name: 'Loan', monthly: mu(15_000), payments: 6, firstDate: null, ...over });
const income = (over: Partial<Extract<QuickLine, { kind: 'income' }>> = {}): QuickLine => ({ id: 'i', kind: 'income', name: 'Gift', amount: mu(40_000), everyMonths: 0, date: '2026-10-10', ...over });
const withLines = (lines: readonly QuickLine[]): CheckV2 => checkOnce(10_000, { quickLines: lines });

describe('05.4-61 loans', () => {
  it('a first payment dated today is still to come: none of the payments is used up', () => {
    expect(ASOF).toBe('2026-10-03');
    const r = withQuickLines(inputsOf(), withLines([loan({ firstDate: '2026-10-03' })]));
    expect(r.inputs.debts[0]).toMatchObject({ balance: 90_000, dueDay: 3 });
  });

  it('a single payment still counts', () => {
    const r = withQuickLines(inputsOf(), withLines([loan({ payments: 1 })]));
    expect(r.counted).toBe(1);
    expect(r.inputs.debts[0]).toMatchObject({ balance: 15_000, minimum: 15_000 });
  });

  it('the recorded debt is a plain unsecured, non-housing, single-owner loan with no rate', () => {
    const r = withQuickLines(inputsOf(), withLines([loan()]));
    expect(r.inputs.debts[0]).toEqual({ id: 'q:l', kind: 'loan', balance: 90_000, minimum: 15_000, apr: null, secured: false, isHousing: false, dueDay: 3, joint: false });
  });
});

describe('05.4-61 folded series are not housing', () => {
  it('a once expense, a once income and a monthly income each carry isHousing false', () => {
    const r = withQuickLines(inputsOf(), withLines([expense({ everyMonths: 0, date: '2026-10-20' }), income(), income({ id: 'm', everyMonths: 1 })]));
    expect(r.inputs.series.slice(-3).map((s) => s.isHousing)).toEqual([false, false, false]);
  });

  it('a once expense dated today stays today, not tomorrow', () => {
    const r = withQuickLines(inputsOf(), withLines([expense({ everyMonths: 0, date: ASOF })]));
    expect(r.inputs.series.at(-1)?.anchorDate).toBe(ASOF);
  });

  it('a once income dated tomorrow stays tomorrow; one dated today counts from tomorrow', () => {
    const r = withQuickLines(inputsOf(), withLines([income({ date: '2026-10-04' }), income({ id: 't', date: ASOF })]));
    expect(r.inputs.series.slice(-2).map((s) => s.anchorDate)).toEqual(['2026-10-04', '2026-10-04']);
  });
});

describe('05.4-61 withQuickFacts: free_help first in the list', () => {
  const f = (code: Fact['code'], values: Fact['values'] = {}): Fact => ({ code, values });
  it('the quick-line fact goes before a free_help that is the first fact', () => {
    const r = withQuickFacts([f('free_help', { name: 'x' }), f('month_left_after')], 1, mu(0));
    expect(r.map((x) => x.code)).toEqual(['quick_lines_counted', 'free_help', 'month_left_after']);
  });
});

describe('05.4-61 withQuickLinesPrepared: the same objects come back when nothing counts', () => {
  const prepared = prepare(inputsOf());

  it('a check with no quickLines key at all is returned as the very same object', () => {
    const check = checkOnce(10_000);
    const r = withQuickLinesPrepared(prepared, check);
    expect(r.prepared).toBe(prepared);
    expect(r.check).toBe(check);
  });

  it('lines that count nowhere give the same prepared back', () => {
    const r = withQuickLinesPrepared(prepared, withLines([expense({ amount: mu(0) })]));
    expect(r.counted).toBe(0);
    expect(r.prepared).toBe(prepared);
  });
});
