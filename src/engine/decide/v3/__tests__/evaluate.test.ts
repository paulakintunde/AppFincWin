import { minorUnits } from '../../../money/types';
import { percent } from '../../../payoff/types';
import { purchaseCashFlows } from '../judge/purchase';
import { evaluate } from '../evaluate';
import { personById, toV3Inputs } from './golden/adapter';
import { checkOnce, checkPlan, inputsOf, monthOf, v3Line, v3Series } from './helpers/fixtures';

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

  it('D-41: an ended series with endDate null counts as ended as of today', () => {
    const base = sam();
    const baseline = evaluate(base, checkOnce(15000));
    const ended = (endDate: string | null): ReturnType<typeof toV3Inputs> => ({
      ...base,
      series: base.series.map((s) => (s.id === 'sam-utils' ? v3Series({ ...s, amount: s.amount, status: 'ended', endDate }) : s)),
    });
    // ended with no end date behaves exactly like an end date the day before asOf (2026-10-03).
    const openEnded = evaluate(ended(null), checkOnce(15000));
    const dated = evaluate(ended('2026-10-02'), checkOnce(15000));
    expect(openEnded.month).toEqual(dated.month);
    expect(openEnded.result).toEqual(dated.result);
    expect(openEnded.month.monthLeft).not.toBe(baseline.month.monthLeft);
    // With the end date set before today the 30,000 bill stops being due: October has 30,000 more room.
    const stopped = evaluate(ended('2026-09-30'), checkOnce(15000));
    expect(stopped.month.monthLeft).toBe(42500 + 30000);
  });

  describe('logged pay is not landed again in the cash path (H-01, H-02, W4)', () => {
    const MONTHLY = { unit: 'month', every: 1 } as const;
    const payOn = (anchorDate: string) => v3Series({ id: 'pay', role: 'pay', cadence: MONTHLY, anchorDate, amount: 400000 });
    const payLine = (date: string) => v3Line({ id: `p-${date}`, date, amount: 400000, role: 'income', seriesId: 'pay' });
    const buy = checkOnce(150000);

    it('H-01 pay due and logged on asOf is not added a second time', () => {
      const logged = evaluate(
        inputsOf({ asOf: '2026-10-03', balance: mu(100000), series: [payOn('2026-01-03')], months: [monthOf('2026-10', [payLine('2026-10-03')])] }),
        buy
      );
      expect(logged.cash.kind).toBe('not_covered');
      const unlogged = evaluate(inputsOf({ asOf: '2026-10-03', balance: mu(100000), series: [payOn('2026-01-03')] }), buy);
      expect(unlogged.cash.kind).toBe('ok');
    });

    it('H-01 pay received 2026-10-26 for a due date 2026-10-31 does not land on 10-31', () => {
      const ev = evaluate(
        inputsOf({ asOf: '2026-10-28', balance: mu(100000), series: [payOn('2026-01-31')], months: [monthOf('2026-10', [payLine('2026-10-26')])] }),
        buy
      );
      expect(ev.cash.kind).toBe('not_covered');
    });

    it('W4 pay due Sun 11-01 received Fri 10-30: not added on asOf 10-31 or on asOf 11-01', () => {
      const oct = monthOf('2026-10', [payLine('2026-10-30')]);
      const a = evaluate(inputsOf({ asOf: '2026-10-31', balance: mu(100000), series: [payOn('2026-01-01')], months: [oct] }), buy);
      expect(a.cash.kind).toBe('not_covered');
      const b = evaluate(
        inputsOf({ asOf: '2026-11-01', balance: mu(100000), series: [payOn('2026-01-01')], months: [oct, monthOf('2026-11', [])] }),
        buy
      );
      expect(b.cash.kind).toBe('not_covered');
    });

    it('M-02 a typed bill payment of the right amount takes the bill off the cash path (D-56)', () => {
      const rent = v3Series({ id: 'rent', role: 'bill', cadence: MONTHLY, anchorDate: '2026-01-10', amount: 80000 });
      const base = { asOf: '2026-10-08', balance: mu(215000), series: [rent] }; // three rents in 90 days: paying one leaves just enough
      const paid = evaluate(inputsOf({ ...base, months: [monthOf('2026-10', [v3Line({ id: 't', date: '2026-10-09', amount: 80000 })])] }), checkOnce(50000));
      const unpaid = evaluate(inputsOf(base), checkOnce(50000));
      expect(unpaid.cash.kind).not.toBe('ok');
      expect(paid.cash.kind).toBe('ok');
    });
  });
});
