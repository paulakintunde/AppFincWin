/**
 * Named deviation from the prototype (D-22). Reviewers and the Phase 5 team read this file to see why an answer differs from the design mock.
 * Added 2026-10-15 (04-CONTEXT D-60, extends D-23 to income; reverses the replan note that income series are not smoothed).
 */
import { CONFIDENCE_STRONG_MIN_MONTHS, RESERVE_HALF_MONTHS } from '../../constants';
import { deriveMoney } from '../../money';
import { SOLE_SHARE } from '../../share';
import type { MonthRecord, RecurringIncome } from '../../types';
import { USD, fullMonth, income, line } from '../helpers/fixtures';

const personal = { byDefault: SOLE_SHARE, byCategory: [] };

function money(months: MonthRecord[], incomeSeries: RecurringIncome[]) {
  const r = deriveMoney({
    currency: USD,
    months,
    bills: [],
    incomeSeries,
    basisOverride: null,
    spendingShare: personal,
  });
  if (!r.ok) throw new Error('expected ok');
  return r.money;
}

/** Six full months 2026-01..2026-06, each with out 300_000 and the paid pay lines given. */
function payMonths(dates: readonly string[], amount = 200_000): MonthRecord[] {
  return ['01', '02', '03', '04', '05', '06'].map((mm) =>
    fullMonth(
      `2026-${mm}`,
      0,
      300_000,
      dates
        .filter((dt) => dt.slice(5, 7) === mm)
        .map((dt) => line({ id: `pay-${dt}`, date: dt, direction: 'in', amount, seriesId: 'pay' }))
    )
  );
}

const FORTNIGHTLY_DATES = [
  '2026-01-02',
  '2026-01-16',
  '2026-01-30',
  '2026-02-13',
  '2026-02-27',
  '2026-03-13',
  '2026-03-27',
  '2026-04-10',
  '2026-04-24',
  '2026-05-08',
  '2026-05-22',
  '2026-06-05',
  '2026-06-19',
];
const PARTIAL_DATES = [
  '2026-01-23',
  '2026-02-06',
  '2026-02-20',
  '2026-03-06',
  '2026-03-20',
  '2026-04-03',
  '2026-04-17',
  '2026-05-01',
  '2026-05-15',
  '2026-05-29',
  '2026-06-12',
  '2026-06-26',
];
const PAY_F = income({
  seriesId: 'pay',
  freq: 'fortnightly',
  anchorDate: '2026-01-02',
  lastPaidDate: '2026-06-19',
  latestAmount: 200_000,
});
const PAY_J = income({
  seriesId: 'pay',
  freq: 'fortnightly',
  anchorDate: '2026-01-23',
  lastPaidDate: '2026-06-26',
  latestAmount: 200_000,
});
/** Oldest first. */
const incomes = (mo: ReturnType<typeof money>) => mo.monthsUsed.map((x) => x.income).reverse();

describe('D-60 pay smoothing', () => {
  it('D-60: steady fortnightly pay is Steady once its confirmed series is smoothed', () => {
    // Research found steady fortnightly pay classed Variable (CV about 0.17) because some months carry an extra payday.
    const months = payMonths(FORTNIGHTLY_DATES);
    const raw = money(months, []);
    expect(incomes(raw)).toEqual([600_000, 400_000, 400_000, 400_000, 400_000, 400_000]);
    expect(raw.incomeAverage).toBe(433_333);
    expect(raw.incomeWorst).toBe(400_000);
    expect(raw.incomeBest).toBe(600_000);
    expect(raw.steadiness).toBe('variable');
    expect(raw.incomeCvPercent).toBe(17);
    expect(raw.basis).toBe('worst');
    expect(raw.incomeBasis).toBe(400_000);
    expect(RESERVE_HALF_MONTHS[raw.steadiness]).toBe(9);
    expect(raw.fullMonthsUsed >= CONFIDENCE_STRONG_MIN_MONTHS && raw.steadiness === 'steady').toBe(false);

    const smoothed = money(months, [PAY_F]);
    expect(incomes(smoothed)).toEqual(Array(6).fill(433_333));
    expect(smoothed.incomeAverage).toBe(433_333);
    expect(smoothed.incomeWorst).toBe(433_333);
    expect(smoothed.incomeBest).toBe(433_333);
    expect(smoothed.steadiness).toBe('steady');
    expect(smoothed.incomeCvPercent).toBe(0);
    expect(smoothed.basis).toBe('average');
    expect(smoothed.incomeBasis).toBe(433_333);
    expect(RESERVE_HALF_MONTHS[smoothed.steadiness]).toBe(6);
    expect(smoothed.fullMonthsUsed >= CONFIDENCE_STRONG_MIN_MONTHS && smoothed.steadiness === 'steady').toBe(true);
    expect(smoothed.spendingAverage).toBe(raw.spendingAverage);
    expect(smoothed.spendingWorst).toBe(raw.spendingWorst);
  });

  it('D-60: unconfirmed fortnightly pay is not smoothed', () => {
    const r = money(payMonths(FORTNIGHTLY_DATES), [{ ...PAY_F, confirmed: false }]);
    expect(r.steadiness).toBe('variable');
    expect(r.incomeCvPercent).toBe(17);
  });

  it('D-60: a real pay change still shows', () => {
    const r = money(payMonths(FORTNIGHTLY_DATES), [
      { ...PAY_F, latestAmount: 210_000 as RecurringIncome['latestAmount'] },
    ]);
    expect(incomes(r)).toEqual(Array(6).fill(455_000));
  });

  it('D-60: weekly pay is smoothed at 52/12', () => {
    const fridays: string[] = [];
    const end = Date.UTC(2026, 6, 1);
    for (let t = Date.UTC(2026, 0, 2); t < end; t += 7 * 86_400_000) {
      fridays.push(new Date(t).toISOString().slice(0, 10));
    }
    const weekly = income({ seriesId: 'pay', freq: 'weekly', anchorDate: '2026-01-02', latestAmount: 100_000 });
    const r = money(payMonths(fridays, 100_000), [weekly]);
    expect(incomes(r)).toEqual(Array(6).fill(433_333));
    expect(r.steadiness).toBe('steady');
  });

  it('D-60: a month with no paid line of the series gets no invented pay', () => {
    const months = payMonths(FORTNIGHTLY_DATES.filter((dt) => !dt.startsWith('2026-01')));
    const r = money(months, [PAY_F]);
    expect(incomes(r)[0]).toBe(0);
    expect(incomes(r).slice(1)).toEqual(Array(5).fill(433_333));
  });

  it('D-60: a pay series is smoothed only in months it spans in full', () => {
    // Smoothing a partial first or last month to a full month's equivalent would overstate pay the user never received there.
    const partial = money(payMonths(PARTIAL_DATES), [PAY_J]);
    expect(incomes(partial)).toEqual([200_000, 433_333, 433_333, 433_333, 433_333, 433_333]);
    expect(partial.incomeAverage).toBe(394_444);
    expect(partial.incomeWorst).toBe(200_000);
    expect(partial.incomeBest).toBe(433_333);
    expect(partial.steadiness).toBe('volatile');
    expect(partial.incomeCvPercent).toBe(22);
    const unsmoothed = money(payMonths(PARTIAL_DATES), []);
    expect(incomes(unsmoothed)).toEqual([200_000, 400_000, 400_000, 400_000, 600_000, 400_000]);
    expect(unsmoothed.incomeCvPercent).toBe(29);

    const withoutLast = FORTNIGHTLY_DATES.filter((dt) => dt !== '2026-06-19');
    const ended = money(payMonths(withoutLast), [{ ...PAY_F, endDate: '2026-06-10' }]);
    expect(incomes(ended)).toEqual([433_333, 433_333, 433_333, 433_333, 433_333, 200_000]);
    const endsLastDay = money(payMonths(FORTNIGHTLY_DATES), [{ ...PAY_F, endDate: '2026-06-30' }]);
    expect(incomes(endsLastDay)[5]).toBe(400_000);
    const counted = money(payMonths(withoutLast), [{ ...PAY_F, occurrenceCount: 12 }]);
    expect(incomes(counted)[5]).toBe(200_000);
  });
});
