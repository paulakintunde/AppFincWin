/**
 * Regression for I13 (fast-check seed -1306121219): a higher price was told it was ready sooner.
 * Priya, yearly plan, first payment today. The dearer plan dips the cash path before payday, so the cash check said
 * "payday" and readyBy was the pay date, even though on payday this month and unspent still do not cover day one.
 * The cheaper plan passed the cash check, failed the ladder, and got the later ladder month. See
 * .planning/debug/05.1-i13-readyby-inversion.md.
 */
import { percent } from '../../../../payoff/types';
import { evaluate } from '../../evaluate';
import { checkOf, inputsOfPerson, type CheckShape } from './arbitraries';

const inputs = inputsOfPerson('priya', { everydayPct: 50, balancePct: 91, unspentMode: 'keep', unspentPct: 0, emergency: null, extras: [] });
const shape: CheckShape = {
  plan: { cadence: { unit: 'month', every: 12 }, count: 18, apr: percent('3'), firstPayment: { kind: 'today' } },
  purpose: null,
  emergency: false,
};

describe('I13 regression: payday never hides a ladder that still fails', () => {
  const hi = evaluate(inputs, checkOf(3_727_926, shape));
  const lo = evaluate(inputs, checkOf(3_541_529, shape));

  it('the case still reaches the two branches (dearer dips before payday, cheaper passes the cash check)', () => {
    expect(hi.cash.kind).toBe('payday');
    expect(lo.cash.kind).toBe('ok');
  });

  it('both are not covered, and the dearer one is never ready sooner', () => {
    expect(hi.result.code).toBe('not_yet');
    expect(lo.result.code).toBe('not_yet');
    expect(hi.result.variant).toBe('not_covered');
    expect(lo.result.variant).toBe('not_covered');
    expect(lo.result.readyBy).toEqual({ kind: 'month', month: '2026-12' });
    expect(hi.result.readyBy).toEqual({ kind: 'month', month: '2026-12' });
  });
});
