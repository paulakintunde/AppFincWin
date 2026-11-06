/**
 * 05.4 FIN-05 / ENG-08 / UX-13 / D-48 (05.4-22): the borrowing rule through the engine, on the approved right-answer people.
 * The hand figures are each case's `why`: BR-01 (£656.77, ready May 2027), BR-02 ($35.48, $400 left), BR-04 ($1,282.14, $1,000 left),
 * DB-09 (£304.66, £200 left), BR-12 / BR-19 / BR-20 (whole cost inside the 90 days), BR-13 (the first payment), BR-15 (home loan).
 */
import { minorUnits } from '../../../money/types';
import { percent } from '../../../payoff/types';
import { evaluate } from '../evaluate';
import { planTile } from '../plan/planCard';
import type { CheckV2, Fact, PayV2, Result, V3Inputs } from '../types';
import { toEngineInputs } from './rightAnswers/fixture';
import { loadCases } from './rightAnswers/loader';
import { corpus } from './reviewed/corpus';
import type { RightAnswerFixture } from './rightAnswers/schema';

const mu = minorUnits;
const byId = (id: string): RightAnswerFixture => {
  const c = loadCases().find((x) => x.id === id);
  if (c === undefined) throw new RangeError(id);
  return c.fixture;
};
type Plan = Extract<PayV2, { mode: 'plan' }>;
const withPay = (check: CheckV2, over: Partial<Plan>): CheckV2 => ({ ...check, pay: { ...(check.pay as Plan), ...over } });
const run = (id: string, over: Partial<Plan> = {}, inputsOver: Partial<V3Inputs> = {}): Result => {
  const { inputs, check } = toEngineInputs(byId(id));
  return evaluate({ ...inputs, ...inputsOver }, withPay(check, over)).result;
};
const fact = (r: Result, code: Fact['code']): Fact['values'] | undefined => r.facts.find((f) => f.code === code)?.values;
const codes = (r: Result): string[] => r.facts.map((f) => f.code);

describe('05.4-22 borrowing through the engine', () => {
  it('BR-01: cash Not yet and 39.9% is "Only by borrowing", saving ready May 2027, borrowing £656.77 more', () => {
    const r = run('BR-01');
    expect({ code: r.code, variant: r.variant, legacy: r.legacyState }).toEqual({ code: 'fits_by_borrowing', variant: null, legacy: 'adjust' });
    expect(r.facts[0]).toEqual({ code: 'save_vs_borrow', values: { kind: 'ready', readyBy: '2027-05', more: 65_677 } });
    expect(fact(r, 'interest_is_a_cost')).toEqual({ interest: 65_677, total: 155_677 });
    // the tight floor still shows under the borrowing caution (BR-01: "the borrowing caution comes first")
    expect(codes(r)).toEqual(expect.arrayContaining(['tight_floor', 'net_covers_surprises', 'income_or_costs_first']));
  });

  it('BR-02: exactly 20% with cash fitting is "Fits, but borrowing costs more": cash leaves $400, borrowing $35.48 more', () => {
    const r = run('BR-02');
    expect({ code: r.code, variant: r.variant }).toEqual({ code: 'fits_by_borrowing', variant: 'borrowing_costs_more' });
    expect(fact(r, 'save_vs_borrow')).toEqual({ kind: 'cash_fits', left: 40_000, more: 3_548 });
  });

  it('BR-03: 19.9% and $35.31 (5.88%) stays a plain Fits, with the D-48 lines and no comparison', () => {
    const r = run('BR-03');
    expect({ code: r.code, variant: r.variant }).toEqual({ code: 'fits_month', variant: null });
    expect(codes(r)).not.toContain('save_vs_borrow');
    expect(fact(r, 'interest_is_a_cost')).toEqual({ interest: 3_531, total: 63_531 });
  });

  it('BR-04 and DB-09: the 10% line and a 29.9% plan, cash fitting: $1,000 and £200 left', () => {
    expect(fact(run('BR-04'), 'save_vs_borrow')).toEqual({ kind: 'cash_fits', left: 100_000, more: 128_214 });
    const { inputs, check } = toEngineInputs(loadCases().find((x) => x.id === 'DB-09')!.fixture);
    const db = evaluate(inputs, check).result;
    expect({ code: db.code, variant: db.variant }).toEqual({ code: 'fits_by_borrowing', variant: 'borrowing_costs_more' });
    expect(fact(db, 'save_vs_borrow')).toEqual({ kind: 'cash_fits', left: 20_000, more: 30_466 });
  });

  it('BR-15: a home loan skips the 10% line, so a plain Fits with no comparison; the same fixture not a home loan is "Only by borrowing"', () => {
    const home = run('BR-15');
    expect(home.code).not.toBe('fits_by_borrowing');
    expect(codes(home)).not.toContain('save_vs_borrow');
    expect(codes(home)).toEqual(expect.arrayContaining(['housing_cost', 'interest_is_a_cost', 'net_covers_surprises', 'income_or_costs_first']));
    // the new mortgage's $1,658.04 is 20.7% of $8,000 pay, a whole percent: 21
    expect(fact(home, 'housing_cost')).toEqual({ amount: 165_804, pay: 800_000, share: 21 });
    expect(fact(home, 'interest_is_a_cost')).toEqual({ interest: 22_740_936, total: 52_740_936 });
    const notHome = run('BR-15', { housing: false });
    expect({ code: notHome.code, variant: notHome.variant }).toEqual({ code: 'fits_by_borrowing', variant: null });
    expect(codes(notHome)).toContain('save_vs_borrow');
    expect(codes(notHome)).not.toContain('housing_cost');
  });

  it('BR-15 at 20%: a home loan cash cannot pay is "Only by borrowing" without the comparison (D-39c keeps the 20% line)', () => {
    const r = run('BR-15', { apr: percent('20') });
    expect({ code: r.code, variant: r.variant }).toEqual({ code: 'fits_by_borrowing', variant: null });
    expect(codes(r)).not.toContain('save_vs_borrow');
  });

  it('a home loan at 20% that cash could pay is "Fits, but borrowing costs more" with the comparison', () => {
    const r = run('BR-02', { housing: true });
    expect({ code: r.code, variant: r.variant }).toEqual({ code: 'fits_by_borrowing', variant: 'borrowing_costs_more' });
    expect(codes(r)).toContain('save_vs_borrow');
  });

  it('a plan with no rate but a quoted payment reads the rate the quote implies: $110 a month for the $600 chair is over 20%', () => {
    const r = run('BR-02', { apr: null, quotedPayment: mu(11_000) });
    expect({ code: r.code, variant: r.variant }).toEqual({ code: 'fits_by_borrowing', variant: 'borrowing_costs_more' });
    expect(codes(r)).toContain('implied_rate');
    // a quote that matches the typed rate keeps the typed rate (19.9%, under the lines: a plain Fits)
    expect(run('BR-03', { quotedPayment: mu(10_589) }).code).toBe('fits_month');
  });

  it('BR-14: a 0% plan gets only the two D-48 lines; the fact-lines switch never hides them (D-50 (3))', () => {
    const r = run('BR-14', {}, { factLines: false });
    expect(codes(r)).toEqual(expect.arrayContaining(['net_covers_surprises', 'income_or_costs_first']));
    expect(codes(r)).not.toContain('interest_is_a_cost');
  });

  it('a once-mode answer carries none of the borrowing lines', () => {
    const { inputs, check } = toEngineInputs(byId('BR-02'));
    const r = evaluate(inputs, { ...check, pay: { mode: 'once' } }).result;
    expect(codes(r).filter((c) => ['save_vs_borrow', 'interest_is_a_cost', 'net_covers_surprises', 'income_or_costs_first'].includes(c))).toEqual([]);
  });

  it('QE-12: Short each month with an expensive plan still shows the comparison (cash fits), and keeps its month-short headline', () => {
    const r = toEngineResult('QE-12');
    expect({ code: r.code, variant: r.variant }).toEqual({ code: 'monthly_short', variant: 'month_already_short' });
    // the engine reads a first payment 15 days away as paid before any interest (annuity due, 05.1 D-24): £1,641.24, not the
    // case's hand £1,720.75 (an ordinary annuity); both are over 10% of the £8,000, so the comparison shows either way
    expect(fact(r, 'save_vs_borrow')).toMatchObject({ kind: 'cash_fits', more: 164_124 });
    // the interest is stated once (the depletion lines), never twice
    expect(codes(r).filter((c) => c === 'interest_is_a_cost')).toHaveLength(1);
  });

  it('a cash route that asks first: still fits_by_borrowing (the code never depends on the cash route), with no variant and the D-79 ask line', () => {
    // with no confirmed spare money, paying the $6,000 at once asks (it is more than this month's room); the plan's day one is $0.
    // The plan is still expensive and fits, so it is fits_by_borrowing (the code never depends on the cash route), with no variant
    // and no comparison (cash cannot be judged yet)
    const once = toEngineInputs(byId('BR-04'));
    expect(evaluate({ ...once.inputs, unspent: null }, { ...once.check, pay: { mode: 'once' } }).result.code).toBe('needs_input');
    const r = run('BR-04', {}, { unspent: null });
    expect({ code: r.code, variant: r.variant }).toEqual({ code: 'fits_by_borrowing', variant: null });
    // D-79 (owner, 2026-11-04): the line says what to add before cash can be compared
    expect(fact(r, 'save_vs_borrow')).toEqual({ kind: 'ask', missing: 'unspent_not_confirmed' });
  });

  it('D-80 gen:46 by hand: 156 weekly payments of $41.73 at 19.9% ($1,595.28 interest, 32.47%); cash on payday 8 October, 5 days after the 3 October check: Fits, but borrowing costs more', () => {
    const c = corpus().find((x) => x.key === 'gen:46')!;
    const r = evaluate(c.inputs, c.check).result;
    const cash = evaluate(c.inputs, { ...c.check, pay: { mode: 'once' } }).result;
    expect({ code: cash.code, variant: cash.variant, readyBy: cash.readyBy }).toEqual({ code: 'not_yet', variant: 'payday', readyBy: { kind: 'date', date: '2026-10-08' } });
    expect({ asOf: c.inputs.asOf, code: r.code, variant: r.variant }).toEqual({ asOf: '2026-10-03', code: 'fits_by_borrowing', variant: 'borrowing_costs_more' });
    expect(fact(r, 'save_vs_borrow')).toEqual({ kind: 'ready', readyBy: '2026-10-08', more: 159_528 });
  });

  it('BR-22 at 29.99%: an expensive plan judged by cash in an already-short month is fits_by_borrowing with its D-65 headline', () => {
    const plain = toEngineResult('BR-22');
    const r = run('BR-22', { apr: percent('29.99') });
    expect({ code: r.code, variant: r.variant }).toEqual({ code: 'fits_by_borrowing', variant: plain.variant });
    expect(r.facts[0]?.code).toBe(plain.facts[0]?.code);
    expect(codes(r)).toEqual(expect.arrayContaining(['short_plan_from_cash', 'save_vs_borrow', 'interest_is_a_cost']));
  });

  it('BR-12, BR-19, BR-20: a Not yet plan inside the 90 days is ready when its whole cost is (May 2027, March 2027, April 2027)', () => {
    expect(['BR-12', 'BR-19', 'BR-20'].map((id) => toEngineResult(id).readyBy)).toEqual([
      { kind: 'month', month: '2027-05' },
      { kind: 'month', month: '2027-03' },
      { kind: 'month', month: '2027-04' },
    ]);
  });

  it('BR-13 over 6 months with the first payment today (past the 90 days): it waits for day one, which holds that payment', () => {
    const r = run('BR-13', { count: 6, termMonths: 6, firstPayment: { kind: 'today' } });
    expect(r.code).toBe('not_yet');
    // about £1,577 below £0 + the £50 paid today, at £400 a month: 4.07, so 5 months from October
    expect(r.readyBy).toEqual({ kind: 'month', month: '2027-03' });
  });

  it('BR-13: a longer Not yet plan waits for its first payment too (£1,577 below £0 + £100 at £400 a month: March 2027)', () => {
    expect(toEngineResult('BR-13').readyBy).toEqual({ kind: 'month', month: '2027-03' });
  });

  it('BR-06: spare money short of the first payment only by what payday brings keeps the payday date (1 December)', () => {
    expect(toEngineResult('BR-06').readyBy).toEqual({ kind: 'date', date: '2026-12-01' });
  });

  it('UX-13: the live tile reads the payment, the number of payments and the interest from the schedule', () => {
    const { inputs, check } = toEngineInputs(byId('BR-01'));
    const e = evaluate(inputs, check);
    expect(planTile(e.purchase!.schedule!)).toEqual({ payment: 4_325, payments: 36, cadence: { unit: 'month', every: 1 }, interest: 65_677 });
    const fee = { ...e.purchase!.schedule!, fees: { setup: mu(0), perPeriod: mu(150), end: mu(0) } };
    expect(planTile(fee).payment).toBe(4_475);
  });
});

function toEngineResult(id: string): Result {
  const { inputs, check } = toEngineInputs(byId(id));
  return evaluate(inputs, check).result;
}
