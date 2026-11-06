/**
 * D-45 (owner round 1b, verify before building; QE-07 plannerNote): a recurring bill or pay occurrence in the new month
 * counts as Expected (due, or pay still to come) until a paid line settles it, and a paid line settles it once.
 * Checked on the 1st of a month against month/thisMonth.ts, month/settle.ts and month/incomeProfile.ts as they are.
 * Everyday spending that is not a series has no rows: it comes from the typical month (erest), not from rollover.
 */
import { minorUnits } from '../../../../money/types';
import { inputsOf, monthOf, v3Line, v3Series } from '../../__tests__/helpers/fixtures';
import type { V3Line, V3Month } from '../../types';
import { buildMonthModel } from '../model';
import { incomeThisMonth } from '../incomeProfile';
import { thisMonth } from '../thisMonth';

const ASOF = '2026-12-01';
const pay = v3Series({ id: 'pay', role: 'pay', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-06-01', amount: 300_000 });
const rent = v3Series({ id: 'rent', role: 'bill', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-06-01', amount: 120_000 });
const series = [pay, rent];

/** Six full months before December, each with its pay, rent and everyday spending recorded. */
const history: V3Month[] = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'].map((m) =>
  monthOf(m, [
    v3Line({ id: `in-${m}`, date: `${m}-01`, amount: 300_000, role: 'income', seriesId: 'pay' }),
    v3Line({ id: `rent-${m}`, date: `${m}-01`, amount: 120_000, seriesId: 'rent' }),
    v3Line({ id: `day-${m}`, date: `${m}-20`, amount: 80_000 }),
  ]),
);
/** The Expected rows the server writes for December (status pending), the same as materialise_recurring. */
const expectedRows: V3Line[] = [
  v3Line({ id: 'x-pay', date: ASOF, amount: 300_000, role: 'income', seriesId: 'pay', status: 'pending', expected: true }),
  v3Line({ id: 'x-rent', date: ASOF, amount: 120_000, seriesId: 'rent', status: 'pending' }),
];

function modelWith(december: V3Line[]) {
  return buildMonthModel(inputsOf({ asOf: ASOF, series, months: [...history, monthOf('2026-12', december, { full: false })] }));
}

function directWith(december: V3Line[]) {
  const current = monthOf('2026-12', december, { full: false });
  const income = incomeThisMonth({ asOf: ASOF, current, history, series, profile: null, typedEstimates: null, custom: inputsOf().custom });
  const month = thisMonth({ asOf: ASOF, current, series, income, e: minorUnits(80_000), typedEveryday: null, setAside: minorUnits(0) });
  return { income, month };
}

describe('D-45 rollover on the 1st of the month', () => {
  it('Expected rows only: the rent counts as due and the pay as still to come', () => {
    for (const rows of [expectedRows, []]) {
      const { income, month } = directWith(rows);
      expect(month.billsDue).toBe(120_000);
      expect(month.billsPaid).toBe(0);
      expect(income.received).toBe(0);
      expect(income.total).toBe(300_000);
      const m = modelWith(rows);
      expect(m.billsDue).toBe(120_000);
      expect(m.billsPaid).toBe(0);
      expect(m.moneyIn).toBe(300_000);
    }
  });

  it('a paid line settles its occurrence once: no double count, with or without the Expected row still there', () => {
    const paidRent = v3Line({ id: 'p-rent', date: ASOF, amount: 120_000, seriesId: 'rent' });
    const paidPay = v3Line({ id: 'p-pay', date: ASOF, amount: 300_000, role: 'income', seriesId: 'pay' });
    for (const rows of [[paidRent, paidPay], [...expectedRows, paidRent, paidPay]]) {
      const { income, month } = directWith(rows);
      expect(month.billsPaid).toBe(120_000);
      expect(month.billsDue).toBe(0);
      expect(income.received).toBe(300_000);
      expect(income.total).toBe(300_000);
      const m = modelWith(rows);
      expect(m.billsPaid + m.billsDue).toBe(120_000);
      expect(m.moneyIn).toBe(300_000);
    }
  });

  it('everyday spending is not rolled over as rows: the usual month fills the rest of the month', () => {
    const { month } = directWith(expectedRows);
    expect(month.everydayLogged).toBe(0);
    expect(month.erest).toBe(80_000);
  });
});
