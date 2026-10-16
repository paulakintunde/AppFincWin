/**
 * Named deviation from the prototype (D-22). Reviewers and the Phase 5 team read this file to see why an answer differs from the design mock.
 * Added 2026-10-15 (04-CONTEXT D-22 extended).
 *
 * The 2026-09-27 plan made the first read cash-level only and never `adjust`: it returned `fits` whenever cash covered the
 * day-one cost. D-11 amended flags cash below the rough cushion (3 x rough monthly spending) so the first read agrees with
 * the full verdict once one real month exists.
 */
import { minorUnits } from '../../../money/types';
import { assess } from '../../assess';
import { firstRead } from '../../firstRead';
import { USD, buyCash, monthsOf, snapshotOf } from '../helpers/fixtures';

const m = minorUnits;

describe('D-11 first read cushion', () => {
  const figures = { currency: USD, cash: m(300_000), monthlyIncome: m(420_000), monthlySpending: m(350_000) };

  it('D-11 amended: a first read below the rough cushion is adjust with a cash warning, not fits', () => {
    const r = firstRead(figures, buyCash(180_000));
    expect(r.state).toBe('adjust');
    if (r.state === 'missing') throw new Error('unexpected missing');
    expect(r.warnings).toEqual([{ code: 'cash', shortfall: 930_000 }]);
  });

  it('D-11 amended: the first read agrees with the full verdict once one real month exists', () => {
    const snap = snapshotOf({ months: monthsOf([[420_000, 350_000]], '2026-06'), cashOnHand: m(300_000) });
    const full = assess(snap, buyCash(180_000));
    const rough = firstRead(figures, buyCash(180_000));
    if (full.state === 'missing' || rough.state === 'missing') throw new Error('unexpected missing');
    expect(full.state).toBe('adjust');
    expect(full.warnings).toEqual([{ code: 'cash', shortfall: 930_000 }]);
    expect(rough.state).toBe(full.state);
    expect(rough.warnings).toEqual(full.warnings);
  });
});
