/**
 * 05.4-37 D-64 (4), (5), D-118, D-119: the contextual caveats. Each condition both ways, the order, the figures a big purchase rests
 * on, and I75 (caveats never change the answer: every other field of the result is what it was without them).
 */
import fc from 'fast-check';
import { minorUnits } from '../../../money/types';
import { percent } from '../../../payoff/types';
import { CAVEAT_ORDER, LONG_PLAN_MONTHS, caveatsFor, planMonths, type CaveatSource } from '../caveats';
import { reasonItem } from '../confidence/reasons';
import { evaluate, type Evaluation } from '../evaluate';
import type { CaveatCode, CheckV2, Result, V3Inputs } from '../types';
import { personById, toV3Inputs } from './golden/adapter';
import { checkOnce, checkPlan } from './helpers/fixtures';
import { fcRuns } from './helpers/fcRuns';
import { checkArb, inputsArb } from './invariants/arbitraries';

const mu = minorUnits;
const sam = (): V3Inputs => toV3Inputs(personById('sam'));
// Tax included, so no tax_not_included caveat on the base answer (D-90).
const T = { taxIncluded: true } as const;
const ONCE = checkOnce(15000, T);
const base: Evaluation = evaluate(sam(), ONCE);

function src(over: Partial<Result> = {}, ev: Evaluation = base): CaveatSource {
  return { result: { ...ev.result, ...over }, month: ev.month, purchase: ev.purchase };
}
const codes = (s: CaveatSource, inputs: V3Inputs = sam(), check: CheckV2 = ONCE): CaveatCode[] => caveatsFor(s, inputs, check).map((c) => c.code);
const conf = (r: Result, ...items: ReturnType<typeof reasonItem>[]): Result['confidence'] => ({ ...r.confidence, reasons: [...r.confidence.reasons, ...items] });

describe('05.4-37 caveats (D-64, D-118, D-119)', () => {
  it('a clean $150 fit for Sam carries none', () => {
    expect(base.result.caveats).toEqual([]);
    expect(codes(src())).toEqual([]);
  });

  it('an ask and a not-ready answer carry none', () => {
    const ask = evaluate(sam(), checkOnce(0, { ...T, price: null }));
    expect(ask.result.caveats).toEqual([]);
    expect(codes(src({ readiness: { ready: false, missing: ['past_month_missing'] }, reasons: ['tax_not_included'] }))).toEqual([]);
    expect(codes(src({ readiness: { ready: true, missing: [] }, reasons: ['tax_not_included'] }))).toEqual(['tax_not_included']);
    const { readiness: _r, ...noReadiness } = base.result;
    expect(caveatsFor({ result: { ...noReadiness, reasons: ['tax_not_included'] }, month: base.month, purchase: base.purchase }, sam(), ONCE).map((c) => c.code)).toEqual(['tax_not_included']);
  });

  it('your_word: the user_said_cover reason, or Only on your answer', () => {
    expect(codes(src({ confidence: conf(base.result, reasonItem('user_said_cover', {})) }))).toEqual(['your_word']);
    expect(codes(src({ code: 'fits_on_your_answer' }))).toEqual(['your_word']);
  });

  it('quick_estimates and close_to_line read the confidence reasons', () => {
    expect(codes(src({ confidence: conf(base.result, reasonItem('quick_estimates', {})) }))).toEqual(['quick_estimates']);
    expect(codes(src({ confidence: conf(base.result, reasonItem('close_to_line', {})) }))).toEqual(['close_to_line']);
    // the tight rule's floor fact is the answer close to the line (FIN-07, D-40)
    expect(codes(src({ facts: [{ code: 'tight_floor', values: { floor: 19000, basis: 'tenth' } }] }))).toEqual(['close_to_line']);
  });

  it('records_out_of_date: records synced more than 3 days before the check, with their date', () => {
    const inputs = sam();
    expect(inputs.asOf).toBe('2026-10-03');
    const four = { ...inputs, recordsAsOf: '2026-09-29' };
    expect(caveatsFor(src(), four, ONCE)).toEqual([{ code: 'records_out_of_date', values: { date: '2026-09-29' } }]);
    expect(codes(src(), { ...inputs, recordsAsOf: '2026-09-30' })).toEqual([]);
    expect(codes(src(), { ...inputs, recordsAsOf: null })).toEqual([]);
    expect(codes(src(), { ...inputs, recordsAsOf: 'not a date' })).toEqual([]);
    expect(codes(src(), { ...inputs, recordsAsOf: '2026-10-09' })).toEqual([]);
  });

  it('no_debts_recorded follows the D-43 ask', () => {
    expect(codes(src({ facts: [...base.result.facts, { code: 'ask_debts_not_recorded', values: { kind: 'loan' } }] }))).toEqual(['no_debts_recorded']);
  });

  it('few_months: with at least one month used, naming the months used and looked for', () => {
    const two = caveatsFor(src({ confidence: conf(base.result, reasonItem('few_months', { used: 2, lookedFor: 3 })) }), sam(), ONCE);
    expect(two).toEqual([{ code: 'few_months', values: { months: 2, lookedFor: 3 } }]);
    expect(codes(src({ confidence: conf(base.result, reasonItem('few_months', { used: 0, lookedFor: 3 })) }))).toEqual([]);
  });

  it('irregular_income: lean months used, a declined volatile cover, or the income_volatile notice', () => {
    expect(codes(src({ reasons: ['lean_months_used'] }))).toEqual(['irregular_income']);
    expect(codes(src({ reasons: ['volatile_cover_declined'] }))).toEqual(['irregular_income']);
    expect(codes(src({ notices: [{ code: 'income_volatile', values: {} }] }))).toEqual(['irregular_income']);
  });

  it('rate_estimated: an implied rate or a quote used with no rate; tax_not_included its reason', () => {
    expect(codes(src({ facts: [{ code: 'implied_rate', values: { rate: '9.9' } }] }))).toEqual(['rate_estimated']);
    expect(codes(src({ reasons: ['quote_used_no_rate'] }))).toEqual(['rate_estimated']);
    expect(codes(src({ reasons: ['tax_not_included'] }))).toEqual(['tax_not_included']);
  });

  it('long_plan: a plan running longer than 12 months, weeks read as months', () => {
    const plan = (count: number, unit: 'month' | 'week' = 'month'): CheckV2 =>
      checkPlan(120000, { count, cadence: { unit, every: 1 }, apr: percent('9.9'), firstPayment: { kind: 'one_period' } }, T);
    const run = (c: CheckV2): CaveatCode[] => {
      const ev = evaluate(sam(), c);
      return caveatsFor(src({}, ev), sam(), c).map((x) => x.code);
    };
    expect(run(plan(LONG_PLAN_MONTHS))).not.toContain('long_plan');
    expect(run(plan(LONG_PLAN_MONTHS + 1))).toContain('long_plan');
    const ev24 = evaluate(sam(), plan(24));
    expect(caveatsFor(src({}, ev24), sam(), plan(24)).find((c) => c.code === 'long_plan')).toEqual({ code: 'long_plan', values: { months: 24 } });
    expect(planMonths(evaluate(sam(), plan(52, 'week')).purchase!)).toBe(12); // 52 weeks: ceil(52 x 84 / 365) = 12
    expect(planMonths(evaluate(sam(), plan(53, 'week')).purchase!)).toBe(13);
    expect(planMonths(base.purchase!)).toBeNull();
    // a plan answer with no purchase (an ask) carries none
    expect(caveatsFor(src({ code: 'fits_month' }, { ...ev24, purchase: null }), sam(), plan(24)).map((c) => c.code)).not.toContain('long_plan');
  });

  it('D-118 large_for_month: the price (a plan: with its interest) is at least one usual month of money in', () => {
    const moneyIn = base.month.typicalIncome;
    expect(moneyIn).toBeGreaterThan(0);
    const at = (price: number): Evaluation => evaluate(sam(), checkOnce(price, T));
    expect(at(moneyIn - 1).result.caveats?.map((c) => c.code)).not.toContain('large_for_month');
    const big = at(moneyIn).result.caveats ?? [];
    expect(big[0]?.code).toBe('large_for_month');
    const left = base.month.typicalLeft;
    expect(left).not.toBeNull();
    expect(big[0]?.values).toMatchObject({ moneyIn, costs: moneyIn - (left as number), price: moneyIn });
    // A plan's interest counts: a price just under a month's money in, with interest, reaches it.
    const plan = checkPlan(moneyIn - 100, { count: 24, apr: percent('19.9'), firstPayment: { kind: 'one_period' } }, T);
    const pev = evaluate(sam(), plan);
    expect(pev.result.caveats?.[0]?.code).toBe('large_for_month');
    expect(pev.result.caveats?.[0]?.values['price']).toBe((pev.purchase?.whole ?? 0) + (pev.purchase?.schedule?.totalInterest ?? 0));
  });

  it('large_for_month counts the money from earlier months used, and leaves costs out when the usual month is unknown', () => {
    const s = src({ split: [{ source: 'month', amount: mu(100) }, { source: 'envelope', amount: mu(5) }, { source: 'unspent_earlier', amount: mu(300) }, { source: 'extra_savings', amount: mu(200) }] });
    const purchase = { ...base.purchase!, whole: mu(base.month.typicalIncome) };
    const got = caveatsFor({ ...s, purchase }, sam(), ONCE)[0];
    expect(got?.values['used']).toBe(500);
    const noTypical = caveatsFor({ ...s, purchase, month: { ...s.month, typicalLeft: null } }, sam(), ONCE)[0];
    expect(noTypical?.code).toBe('large_for_month');
    expect('costs' in (noTypical?.values ?? {})).toBe(false);
  });

  it('D-119 every caveat at once comes in the owner order, each once', () => {
    const r = base.result;
    const s = src({
      code: 'fits_on_your_answer',
      confidence: conf(r, reasonItem('user_said_cover', {}), reasonItem('quick_estimates', {}), reasonItem('few_months', { used: 1, lookedFor: 3 }), reasonItem('close_to_line', {})),
      facts: [{ code: 'ask_debts_not_recorded', values: { kind: 'loan' } }, { code: 'implied_rate', values: { rate: '9.9' } }],
      reasons: ['lean_months_used', 'tax_not_included'],
    });
    const plan = checkPlan(120000, { count: 24, apr: percent('9.9'), firstPayment: { kind: 'one_period' } }, T);
    const pev = evaluate(sam(), plan);
    const purchase = { ...pev.purchase!, whole: mu(base.month.typicalIncome) };
    const got = caveatsFor({ ...s, purchase }, { ...sam(), recordsAsOf: '2026-09-01' }, plan).map((c) => c.code);
    expect(got).toEqual(CAVEAT_ORDER.filter((c) => c !== 'expected_bills' && c !== 'shared_money'));
    expect(new Set(got).size).toBe(got.length);
  });

  it('I75 caveats never change the answer: the rest of the result is exactly what it was', () => {
    fc.assert(
      fc.property(inputsArb, checkArb, (inputs, check) => {
        const ev = evaluate(inputs, check);
        const { caveats, ...rest } = ev.result;
        expect(Array.isArray(caveats)).toBe(true);
        // recomputing from the answer without its caveats gives the same caveats, and nothing in the answer reads them
        expect(caveatsFor({ result: rest as Result, month: ev.month, purchase: ev.purchase }, inputs, check)).toEqual(caveats);
        expect(new Set((caveats ?? []).map((c) => c.code)).size).toBe((caveats ?? []).length);
        const ranks = (caveats ?? []).map((c) => CAVEAT_ORDER.indexOf(c.code));
        expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
      }),
      { numRuns: fcRuns(200), seed: 0x0575 }
    );
  });
});
