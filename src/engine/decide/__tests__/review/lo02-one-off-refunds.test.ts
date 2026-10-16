/**
 * 04-REVIEW LO-02 regression: a refund marked one-off was counted in oneOffsExcluded.count but its amount reached
 * neither oneOffsExcluded.spending nor net spending, so the count and the figures disagreed. One-off refunds now net
 * against one-off spending (floored at 0), shared per category total like ordinary spending.
 */
import { prepareContext } from '../../assess';
import { fullMonth, line, snapshotOf } from '../helpers/fixtures';

function oneOffsWith(extra: Parameters<typeof fullMonth>[3]) {
  const s = snapshotOf({
    months: [
      fullMonth('2026-04', 600_000, 300_000, extra),
      fullMonth('2026-05', 600_000, 300_000),
      fullMonth('2026-06', 600_000, 300_000),
    ],
  });
  const r = prepareContext(s);
  if (!r.ok) throw new Error('expected ok');
  return r.context.money;
}

describe('04-REVIEW LO-02: one-off refunds net against one-off spending', () => {
  it('a one-off refund lowers the one-off spending it is counted with', () => {
    const money = oneOffsWith([
      line({ id: 'tv', date: '2026-04-03', direction: 'out', amount: 50_000, oneOff: true }),
      line({ id: 'tv-refund', date: '2026-04-20', direction: 'in', amount: 20_000, isRefund: true, oneOff: true }),
    ]);
    expect(money.oneOffsExcluded).toEqual({ count: 2, spending: 30_000, income: 0 });
    // ordinary spending is untouched by either one-off line
    expect(money.spendingAverage).toBe(300_000);
  });

  it('a one-off refund larger than the one-off spending floors at 0', () => {
    const money = oneOffsWith([
      line({ id: 'r', date: '2026-04-20', direction: 'in', amount: 20_000, isRefund: true, oneOff: true }),
    ]);
    expect(money.oneOffsExcluded).toEqual({ count: 1, spending: 0, income: 0 });
  });
});
