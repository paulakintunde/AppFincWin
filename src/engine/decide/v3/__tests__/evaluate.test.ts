import { minorUnits } from '../../../money/types';
import { percent } from '../../../payoff/types';
import { purchaseCashFlows } from '../judge/purchase';
import { evaluate } from '../evaluate';
import { personById, toV3Inputs } from './golden/adapter';
import { checkOnce, checkPlan, inputsOf, v3Series } from './helpers/fixtures';

const mu = minorUnits;
const sam = (): ReturnType<typeof toV3Inputs> => toV3Inputs(personById('sam'));

describe('evaluate', () => {
  it('Sam, $150: fits_month and the untouched month figures', () => {
    const ev = evaluate(sam(), checkOnce(15000));
    expect(ev.result.code).toBe('fits_month');
    expect(ev.month.monthLeft).toBe(42500);
    expect(ev.purchase?.dayOne).toBe(15000);
    expect(ev.cash.kind).toBe('ok');
  });

  it('I16 deterministic, and the order of months never matters', () => {
    const inputs = sam();
    const a = evaluate(inputs, checkOnce(15000));
    const b = evaluate(inputs, checkOnce(15000));
    expect(b).toEqual(a);
    const shuffled = { ...inputs, months: [...inputs.months].reverse().map((m) => ({ ...m, lines: [...m.lines].reverse() })) };
    expect(evaluate(shuffled, checkOnce(15000))).toEqual(a);
  });

  it('a missing price still returns a Result: needs_input with no_price', () => {
    const ev = evaluate(sam(), checkOnce(0, { price: null }));
    expect(ev.result.code).toBe('needs_input');
    expect(ev.result.missing).toContain('no_price');
    expect(ev.purchase).toBeNull();
    expect(ev.planCard).toBeNull();
    expect(ev.quoted).toEqual({ kind: 'none' });
  });

  it('a first payment dated today is on the cash path once, not twice', () => {
    // 4 x 10,000 fortnightly, first today, no income, 40,000 in the bank: exactly enough only if today is counted once.
    const check = checkPlan(40000, {
      cadence: { unit: 'week', every: 2 },
      count: 4,
      apr: percent('0'),
      firstPayment: { kind: 'today' },
    });
    const ev = evaluate(inputsOf({ balance: mu(40000) }), check);
    expect(ev.purchase?.dayOne).toBe(10000);
    expect(ev.cash.kind).toBe('ok');
    if (ev.cash.kind === 'ok') expect(ev.cash.lowest.balance).toBe(0);
    const short = evaluate(inputsOf({ balance: mu(39999) }), check);
    expect(short.cash.kind).toBe('not_covered');
  });

  it('one share convention end to end: even 2, plan 24 x 10,000 full', () => {
    const check = checkPlan(
      240000,
      { cadence: { unit: 'month', every: 1 }, count: 24, apr: percent('0'), firstPayment: { kind: 'one_period' } },
      { share: { kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'even' } } }
    );
    const ev = evaluate(sam(), check);
    const p = ev.purchase;
    expect(p).not.toBeNull();
    if (p === null || p.schedule === null) throw new Error('expected a plan purchase');
    expect(p.schedule.payment).toBe(10000); // the lender amount (D-05)
    expect(Math.abs(p.monthly - 5000)).toBeLessThanOrEqual(1); // half, never a quarter
    const flows = purchaseCashFlows(p, '2026-10-03', 90);
    expect(flows.length).toBeGreaterThan(0);
    for (const f of flows) expect(f.amount).toBe(5000);
    expect(ev.planCard?.monthlyEquivalent).toBe(10000);
  });

  it('every field of the Evaluation is JSON-serialisable', () => {
    const ev = evaluate(sam(), checkPlan(120000, { count: 12, apr: percent('9.9'), firstPayment: { kind: 'one_period' } }));
    expect(JSON.parse(JSON.stringify(ev))).toEqual(ev);
    expect(JSON.parse(JSON.stringify(ev.result))).toEqual(ev.result);
  });

  it('an ended series with endDate null keeps counting (05.1-06 isCounting); an end date stops it', () => {
    const base = sam();
    const baseline = evaluate(base, checkOnce(15000));
    const ended = (endDate: string | null): ReturnType<typeof toV3Inputs> => ({
      ...base,
      series: base.series.map((s) => (s.id === 'sam-utils' ? v3Series({ ...s, amount: s.amount, status: 'ended', endDate }) : s)),
    });
    // status 'ended' alone does not stop a series: only endDate does. Nothing changes.
    const stillCounting = evaluate(ended(null), checkOnce(15000));
    expect(stillCounting.month).toEqual(baseline.month);
    expect(stillCounting.result).toEqual(baseline.result);
    // With the end date set before today the 30,000 bill stops being due: October has 30,000 more room.
    const stopped = evaluate(ended('2026-09-30'), checkOnce(15000));
    expect(stopped.month.monthLeft).toBe(42500 + 30000);
  });
});
