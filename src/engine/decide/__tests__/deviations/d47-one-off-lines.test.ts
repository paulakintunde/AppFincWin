/**
 * Named deviation from the prototype (D-22). Reviewers and the Phase 5 team read this file to see why an answer differs from the design mock.
 * Added 2026-10-15 (04-CONTEXT D-47, amends D-29).
 */
import { deriveMoney } from '../../money';
import { SOLE_SHARE } from '../../share';
import type { MonthRecord } from '../../types';
import { USD, fullMonth, line } from '../helpers/fixtures';

const personal = { byDefault: SOLE_SHARE, byCategory: [] };

function money(months: MonthRecord[]) {
  const r = deriveMoney({
    currency: USD,
    months,
    bills: [],
    incomeSeries: [],
    basisOverride: null,
    spendingShare: personal,
  });
  if (!r.ok) throw new Error('expected ok');
  return r.money;
}

const spike = (oneOff: boolean): MonthRecord[] => [
  fullMonth('2026-01', 600_000, 300_000),
  fullMonth('2026-02', 600_000, 300_000),
  fullMonth('2026-03', 600_000, 300_000, [
    line({ id: 'spike', date: '2026-03-20', direction: 'out', amount: 1_200_000, oneOff }),
  ]),
];

describe('D-47 one-off lines', () => {
  it('D-47: a line marked one-off is left out of the averages and the worst month, and counted', () => {
    // D-29 kept every spike, and the prototype had no such flag.
    const r = money(spike(true));
    expect(r.spendingAverage).toBe(300_000);
    expect(r.spendingWorst).toBe(300_000);
    expect(r.oneOffsExcluded).toEqual({ count: 1, spending: 1_200_000, income: 0 });
  });

  it('D-47: an unmarked spike still stays in (D-29 kept)', () => {
    const r = money(spike(false));
    expect(r.spendingAverage).toBe(700_000);
    expect(r.spendingWorst).toBe(1_500_000);
    expect(r.oneOffsExcluded.count).toBe(0);
  });
});
