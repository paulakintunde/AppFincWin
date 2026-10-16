/**
 * Named deviation from the prototype (D-22). Reviewers and the Phase 5 team read this file to see why an answer differs from the design mock.
 */
import { deriveMoney } from '../../money';
import { SOLE_SHARE } from '../../share';
import type { MonthRecord } from '../../types';
import { USD, bill, fullMonth, line, monthsOf } from '../helpers/fixtures';

const personal = { byDefault: SOLE_SHARE, byCategory: [] };
const yearly = bill({ seriesId: 's-ins', freq: 'yearly', anchorDate: '2026-03-15', latestAmount: 120_000 });

function spendingAverage(months: MonthRecord[], bills = [yearly]): number {
  const r = deriveMoney({
    currency: USD,
    months,
    bills,
    incomeSeries: [],
    basisOverride: null,
    spendingShare: personal,
  });
  if (!r.ok) throw new Error('expected ok');
  return r.money.spendingAverage;
}

function rawAverage(months: MonthRecord[]): number {
  const totals = months.map((mo) => mo.lines.filter((l) => l.direction === 'out').reduce((a, l) => a + l.amount, 0));
  return Math.round(totals.reduce((a, b) => a + b, 0) / totals.length);
}

describe('D-23 series smoothing', () => {
  it('D-23: a yearly bill is smoothed through its series whether or not it fell inside the 6-month window', () => {
    // Prototype: read the current month only (`this.items`), so a yearly bill either dominated the month or vanished.
    const occurrence = line({ id: 'ins', date: '2026-03-15', direction: 'out', amount: 120_000, seriesId: 's-ins' });
    const caseA = monthsOf(Array.from({ length: 6 }, () => [600_000, 300_000] as const));
    caseA[2] = fullMonth('2026-03', 600_000, 300_000, [occurrence]);
    // Case B: the occurrence sits in 2025-12, outside the window, so no month in the window carries the line.
    const caseB = monthsOf(Array.from({ length: 6 }, () => [600_000, 300_000] as const));
    expect(spendingAverage(caseA)).toBe(310_000);
    expect(spendingAverage(caseB)).toBe(310_000);
    expect(rawAverage(caseA)).toBe(320_000);
    expect(rawAverage(caseB)).toBe(300_000);
  });

  it('D-23: weekly and fortnightly series convert at 52/12 and 26/12', () => {
    const months = monthsOf([
      [600_000, 300_000],
      [600_000, 300_000],
      [600_000, 300_000],
    ]);
    const weekly = bill({ seriesId: 'w', freq: 'weekly', anchorDate: '2026-01-02', latestAmount: 1_000 });
    const fortnightly = bill({ seriesId: 'f', freq: 'fortnightly', anchorDate: '2026-01-02', latestAmount: 1_000 });
    expect(spendingAverage(months, [weekly])).toBe(304_333);
    expect(spendingAverage(months, [fortnightly])).toBe(302_167);
  });
});
