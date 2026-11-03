/**
 * 05.4 D-52 unit tests: expected pay from history (month/historyPay.ts) and its wiring into the 90-day cash path, the payday and
 * the pay_expected_from_history notice. Every branch of historyPay.ts is pinned both ways.
 */
import { minorUnits } from '../../../money/types';
import { evaluate } from '../evaluate';
import { historyPay } from '../month/historyPay';
import { prepare } from '../prepare';
import type { IncomeProfile, V3Inputs } from '../types';
import { corpus } from './reviewed/corpus';
import { inputsOf, monthOf, v3Line, v3Series } from './helpers/fixtures';

const mu = minorUnits;
const freelance: IncomeProfile = { types: ['freelance'], variable: null, steady: null, billsHorizonMonths: null };

/** Full months of freelance income, each paid on `day` (one line per month), oldest first. */
function earner(amounts: readonly number[], over: Partial<V3Inputs> = {}, day = '05'): V3Inputs {
  const months = amounts.map((a, i) => {
    const m = `2026-${String(4 + i).padStart(2, '0')}`;
    return monthOf(m, a === 0 ? [] : [v3Line({ id: `in-${m}`, date: `${m}-${day}`, amount: a, role: 'income' })]);
  });
  return inputsOf({ profile: freelance, months: [...months, monthOf('2026-10', [], { full: false })], ...over });
}

const CORPUS = corpus();
const caseOf = (key: string) => {
  const c = CORPUS.find((x) => x.key === key);
  if (c === undefined) throw new RangeError(key);
  return c;
};

describe('historyPay (D-52)', () => {
  it('Maya: payday 5 at the lowest month, 2,800, from 6 months; October already received, so no October date', () => {
    const maya = caseOf('persona:maya:6000:cash');
    expect(historyPay(prepare(maya.inputs).inputs)).toEqual({ day: 5, amount: 280_000, months: 6, dates: ['2026-11-05', '2026-12-05'] });
  });

  it('Maya $60 and $500 cash, and the 48 x $219.30 plan, are plain Fits from pay expected on her usual payday', () => {
    const at = (key: string) => {
      const c = caseOf(key);
      return evaluate(c.inputs, c.check);
    };
    const left = (e: ReturnType<typeof at>) => e.result.facts.find((f) => f.code === 'month_left_after')?.values['left'];
    const s60 = at('persona:maya:6000:cash');
    expect([s60.result.code, s60.result.variant, left(s60)]).toEqual(['fits_month', null, 74_000]);
    const s500 = at('persona:maya:50000:cash');
    expect([s500.result.code, s500.result.variant, left(s500)]).toEqual(['fits_month', null, 30_000]);
    const plan = at('persona:maya:900000:plan');
    expect(plan.result.code).toBe('fits_month');
    for (const e of [s60, s500, plan]) {
      expect(e.cash.kind).toBe('ok');
      if (e.cash.kind === 'ok') expect(e.cash.lowest.balance).toBeGreaterThanOrEqual(0);
      expect(e.result.notices).toContainEqual({ code: 'pay_expected_from_history', values: { amount: 280_000, day: 5, months: 6 } });
    }
  });

  it('audit-p2-rich: the 12-month window holds a month of 0, so nothing lands and the answers stay fits_unspent (D-65 tiers)', () => {
    // her usual month is 150.00 short and she has 15,109.68 of spare money: $60 is less than one month of it (Small); $500 is more
    // (Moderate: floor(1,510,968 / 15,000) = 100 months, floor(1,460,968 / 15,000) = 97 after)
    const tier: Record<string, string> = { 'persona:audit-p2-rich:6000:cash': 'month_short_small', 'persona:audit-p2-rich:50000:cash': 'month_short_moderate' };
    for (const key of ['persona:audit-p2-rich:6000:cash', 'persona:audit-p2-rich:50000:cash']) {
      const c = caseOf(key);
      expect(historyPay(prepare(c.inputs).inputs)).toMatchObject({ amount: 0, months: 12, dates: [] });
      const e = evaluate(c.inputs, c.check);
      // the code stays; her usual month is already short (D-63), so the headline is a D-65 tier and its line leads (no_net's fact stays)
      expect([e.result.code, e.result.variant]).toEqual(['fits_unspent', tier[key]]);
      expect(['month_short_fits', 'money_lasts_shorter']).toContain(e.result.facts[0]?.code);
      expect(e.result.facts.map((f) => f.code)).toContain('net_none_start');
      expect(e.result.notices.map((n) => n.code)).not.toContain('pay_expected_from_history');
    }
  });

  it('sam (a pay series) has no history pay and no notice', () => {
    const sam = caseOf('persona:sam:6000:cash');
    expect(historyPay(prepare(sam.inputs).inputs)).toBeNull();
    expect(evaluate(sam.inputs, sam.check).result.notices.map((n) => n.code)).not.toContain('pay_expected_from_history');
  });

  it('null with a live pay series, with no profile, for a regular salary profile, or with fewer than 3 full months', () => {
    const pay = v3Series({ id: 'pay', role: 'pay', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-04-25', amount: 300_000 });
    expect(historyPay(earner([300_000, 300_000, 300_000], { series: [pay] }))).toBeNull();
    expect(historyPay(earner([300_000, 300_000, 300_000], { profile: null }))).toBeNull();
    expect(historyPay(earner([300_000, 300_000, 300_000], { profile: { ...freelance, types: ['salary'] } }))).toBeNull();
    expect(historyPay(earner([300_000, 300_000]))).toBeNull();
  });

  it('irregular: freelance, a variable method, or a stated variable or seasonal pattern', () => {
    const salary: IncomeProfile = { ...freelance, types: ['salary'] };
    expect(historyPay(earner([300_000, 300_000, 300_000], { profile: { ...salary, variable: 'match' } }))).not.toBeNull();
    expect(historyPay(earner([300_000, 300_000, 300_000], { profile: { ...salary, pattern: 'variable' } }))).not.toBeNull();
    expect(historyPay(earner([300_000, 300_000, 300_000], { profile: { ...salary, pattern: 'seasonal' } }))).not.toBeNull();
    expect(historyPay(earner([300_000, 300_000, 300_000], { profile: { ...salary, pattern: 'steady' } }))).toBeNull();
  });

  it('the upper median payday and the lowest month; nothing received this month and a payday after asOf adds this month', () => {
    // asOf 2026-10-03, payday 20: October has no income yet, so 2026-10-20 is the first date
    const hp = historyPay(earner([310_000, 290_000, 300_000], {}, '20'));
    expect(hp).toEqual({ day: 20, amount: 290_000, months: 3, dates: ['2026-10-20', '2026-11-20', '2026-12-20'] });
    // a payday on or before asOf's day is not added for this month
    expect(historyPay(earner([300_000, 300_000, 300_000], {}, '02'))?.dates).toEqual(['2026-11-02', '2026-12-02']);
    // two lines a month: days 1 and 15 x 3 -> sorted 1,1,1,15,15,15, upper median 15
    const two = inputsOf({
      profile: freelance,
      months: ['2026-07', '2026-08', '2026-09'].map((m) =>
        monthOf(m, [v3Line({ id: `a-${m}`, date: `${m}-01`, amount: 100_000, role: 'income' }), v3Line({ id: `b-${m}`, date: `${m}-15`, amount: 100_000, role: 'income' })])
      ),
    });
    expect(historyPay(two)).toMatchObject({ day: 15, amount: 200_000 });
  });

  it('a month shorter than the payday uses its last day (payday 31 in November is 2026-11-30)', () => {
    const asOf = '2026-11-02';
    const months = ['2026-07', '2026-08', '2026-10'].map((m) => monthOf(m, [v3Line({ id: `in-${m}`, date: `${m}-31`, amount: 300_000, role: 'income' })]));
    const hp = historyPay(inputsOf({ asOf, profile: freelance, months: [...months, monthOf('2026-11', [], { full: false })] }));
    expect(hp).toEqual({ day: 31, amount: 300_000, months: 3, dates: ['2026-11-30', '2026-12-31'] }); // 2027-01-31 is the path end (asOf + 90), not inside it
  });

  it('a month already paid this month keeps only later months; a pending or ineligible line does not count as received', () => {
    const paid = earner([300_000, 300_000, 300_000], {}, '20');
    const withNow = { ...paid, months: [...paid.months.slice(0, -1), monthOf('2026-10', [v3Line({ id: 'now', date: '2026-10-01', amount: 50_000, role: 'income' })], { full: false })] };
    expect(historyPay(withNow)?.dates).toEqual(['2026-11-20', '2026-12-20']);
    const pending = { ...paid, months: [...paid.months.slice(0, -1), monthOf('2026-10', [v3Line({ id: 'now', date: '2026-10-01', amount: 50_000, role: 'income', status: 'pending' })], { full: false })] };
    expect(historyPay(pending)?.dates[0]).toBe('2026-10-20');
    const spend = { ...paid, months: [...paid.months.slice(0, -1), monthOf('2026-10', [v3Line({ id: 'now', date: '2026-10-01', amount: 50_000 })], { full: false })] };
    expect(historyPay(spend)?.dates[0]).toBe('2026-10-20');
  });

  it('a low month of 0 lands nothing; months with no income at all give day 1 and no dates', () => {
    expect(historyPay(earner([300_000, 0, 300_000]))).toEqual({ day: 5, amount: 0, months: 3, dates: [] });
    expect(historyPay(earner([0, 0, 0]))).toEqual({ day: 1, amount: 0, months: 3, dates: [] });
  });

  it('the cash path lands the history pays, the payday reads them, and the notice is said; never for a low month of 0', () => {
    const inputs = earner([300_000, 280_000, 290_000], { balance: mu(0) }, '20');
    const p = prepare(inputs);
    const r = p.readings[0];
    expect(r?.payDate).toBe('2026-10-20');
    expect(r?.paydays).toEqual(['2026-10-20', '2026-11-20', '2026-12-20']);
    expect(r?.hp?.amount).toBe(280_000);
    const zero = prepare(earner([300_000, 0, 290_000], {}, '20')).readings[0];
    expect(zero?.payDate).toBeNull();
    expect(zero?.paydays).toEqual([]);
  });

  it('with a pay series there is no history pay, so the series gives the payday', () => {
    const pay = v3Series({ id: 'pay', role: 'pay', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-04-25', amount: 300_000 });
    const r = prepare(earner([300_000, 300_000, 300_000], { series: [pay] }, '20')).readings[0];
    expect(r?.hp).toBeNull();
    expect(r?.payDate).toBe('2026-10-25');
  });
});
