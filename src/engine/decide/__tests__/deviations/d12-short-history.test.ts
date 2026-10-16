/**
 * Named deviation from the prototype (D-22). Reviewers and the Phase 5 team read this file to see why an answer differs from the design mock.
 */
import { assess, prepareContext } from '../../assess';
import { buyCash, monthsOf, snapshotOf } from '../helpers/fixtures';

describe('D-12 short history', () => {
  it('D-12: one or two full months are never steady', () => {
    // Prototype: the coefficient of variation of a single month is 0, which reads as 'Steady'.
    const r = prepareContext(snapshotOf({ months: monthsOf([[500_000, 300_000], [500_000, 300_000]]) }));
    if (!r.ok) throw new Error('expected ok');
    expect(r.context.money.steadiness).toBe('insufficient');
    expect(r.context.money.basis).toBe('worst');
    const one = prepareContext(snapshotOf({ months: monthsOf([[500_000, 300_000]]) }));
    if (!one.ok) throw new Error('expected ok');
    expect(one.context.money.steadiness).toBe('insufficient');
  });

  it('D-12 amended: below 3 full months the spending basis is the highest-spending month', () => {
    // The 2026-09-26 plan used the worst income but kept the average spending (325_000).
    const snap = snapshotOf({ months: monthsOf([[500_000, 300_000], [450_000, 350_000]]) });
    const r = prepareContext(snap);
    if (!r.ok) throw new Error('expected ok');
    expect(r.context.money.incomeBasis).toBe(450_000);
    expect(r.context.money.spendingBasis).toBe(350_000);
    expect(r.context.money.spendingAverage).toBe(325_000);
    const v = assess(snap, buyCash(10_000));
    if (v.state === 'missing') throw new Error('unexpected missing');
    expect(v.context.leftBefore).toBe(100_000);
  });
});
