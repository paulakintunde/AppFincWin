/**
 * Regression for I13 (fast-check seed -1306121219): a higher price was told it was ready sooner.
 * Priya, yearly plan, first payment today. The dearer plan dips the cash path before payday, so the cash check said
 * "payday" and readyBy was the pay date, even though on payday this month and unspent still do not cover day one.
 * The cheaper plan passed the cash check, failed the ladder, and got the later ladder month. See
 * .planning/debug/05.1-i13-readyby-inversion.md.
 */
import { minorUnits } from '../../../../money/types';
import { percent } from '../../../../payoff/types';
import { evaluate } from '../../evaluate';
import type { ReadyBy, V3Inputs } from '../../types';
import { loadPersons, toV3Inputs } from '../golden/adapter';
import { checkOf, inputsOfPerson, type CheckShape } from './arbitraries';

// D-50 (05.1-44): the generated unspent sits 150,050 below what the records suggest; the engine asks about that money.
// This regression is about the ladder and the cash check, so the fixture carries the user's answer (set aside for a bill).
const priya = inputsOfPerson('priya', { everydayPct: 50, balancePct: 91, unspentMode: 'keep', unspentPct: 0, emergency: null, extras: [] });
const inputs = { ...priya, unexplainedAnswer: { amount: minorUnits(10_000_000), use: 'set_aside_for_bill' as const, at: priya.asOf } };
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

/**
 * I13 residual (debug note, "Residual"): a not_covered cash check used to report the ladder month alone, so a dearer
 * price could read "2026-11" while a cheaper one waiting for payday read "2026-11-28". Tia, pay on the 28th, asOf after
 * October's payday, so the next pay is 2026-11-28. The cash check opens on a stated everyday account (D-54).
 */
describe('I13 late-month pay date (debug note residual)', () => {
  const base = loadPersons().find((p) => p.id === 'tia');
  if (!base) throw new RangeError('no fixture person tia');
  const person = {
    ...base,
    asOf: '2026-10-29',
    series: base.series.map((s) => (s.id === 'tia-pay' ? { ...s, amount: 700_000 } : s)),
    accounts: [{ id: 'tia-everyday', balance: 420_000, use: { kind: 'everyday' as const } }],
    unspent: { amount: 250_000, at: '2026-10-29' },
    months: base.months.map((m) => {
      const lines = m.lines.map((l) => (l.seriesId === 'tia-pay' ? { ...l, amount: 700_000 } : l));
      return m.month === '2026-10'
        ? { ...m, lines: [...lines, { id: 'tia-pay-10', date: '2026-10-28', amount: 700_000, role: 'income' as const, seriesId: 'tia-pay' }] }
        : { ...m, lines };
    }),
  };
  // D-50: the stated 250,000 unspent is 150,000 below the suggested figure; the fixture carries the user's answer.
  const lateInputs: V3Inputs = {
    ...toV3Inputs(person, { custom: { itemTypes: [], purposes: [], cadences: [], incomeKinds: [] } }),
    unexplainedAnswer: { amount: minorUnits(10_000_000), use: 'set_aside_for_bill', at: '2026-10-29' },
  };
  const once = (price: number) => evaluate(lateInputs, checkOf(price, { plan: null, purpose: null, emergency: false }));
  const key = (r: ReadyBy | null): string => (r === null ? '9999-99-99' : r.kind === 'date' ? r.date : `${r.month}-01`);

  const lo = once(640_000);
  const hi = once(660_000);

  it('the case reaches both branches (cheaper waits for payday, dearer is not covered)', () => {
    expect(lo.cash.kind).toBe('payday');
    expect(hi.cash.kind).toBe('not_covered');
  });

  it('the dearer not_covered answer is dated at the pay date, never before the cheaper payday', () => {
    expect(lo.result.readyBy).toEqual({ kind: 'date', date: '2026-11-28' });
    expect(hi.result.readyBy).toEqual({ kind: 'date', date: '2026-11-28' });
    expect(key(hi.result.readyBy) >= key(lo.result.readyBy)).toBe(true);
  });
});
