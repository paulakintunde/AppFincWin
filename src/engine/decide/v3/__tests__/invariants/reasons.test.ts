/**
 * I45, I46 (05.4-16, FIN-25 / ENG-10 / UX-04 / CMP-F12): the reasons that replace Rough / Fair / Firm.
 * I45: reasons come sorted by the fixed weight table. I46: the basis sentence is never more confident than the answer.
 * Plus the thin-records fact (round 1, research section 6): no complete month says so next to the reason.
 */
import * as fc from 'fast-check';
import { percent } from '../../../../payoff/types';
import { REASON_WEIGHT } from '../../confidence/reasons';
import { evaluate } from '../../evaluate';
import type { Code, Result, V3Inputs } from '../../types';
import { checkPlan, volatileInputs } from '../helpers/fixtures';
import { fcRuns } from '../helpers/fcRuns';
import { toEngineInputs } from '../rightAnswers/fixture';
import { loadCases } from '../rightAnswers/loader';
import { checkArb, inputsArb } from './arbitraries';

const FITS: readonly Code[] = ['fits_month', 'fits_unspent'];

function cleanBasisWithAnswerReason(r: Result): boolean {
  return FITS.includes(r.code) && r.confidence.basis.kind === 'records' && r.confidence.reasons.some((x) => x.audience === 'answer');
}

describe('I45 reasons are sorted by REASON_WEIGHT', () => {
  it('I45 result.confidence.reasons follow the weight table, each code once, each with its table weight', () => {
    fc.assert(
      fc.property(inputsArb, checkArb, fc.integer({ min: 0, max: 3 }), (inputs, check, unsaved) => {
        const r = evaluate({ ...inputs, unsavedWrites: unsaved }, check).result;
        const weights = r.confidence.reasons.map((x) => x.weight);
        expect(weights).toEqual([...weights].sort((a, b) => a - b));
        for (const x of r.confidence.reasons) expect(x.weight).toBe(REASON_WEIGHT[x.code]);
        expect(new Set(r.confidence.reasons.map((x) => x.code)).size).toBe(r.confidence.reasons.length);
        // At most one next step, and it names a reason the answer carries.
        const step = r.confidence.nextStep;
        if (step !== null) expect(r.confidence.reasons.map((x) => x.code)).toContain(step.reason);
      }),
      { numRuns: fcRuns(200), seed: 0x0545 }
    );
  });
});

describe('I46 the basis is never more confident than the answer', () => {
  it('I46 a fits answer with any answer-audience reason never carries the clean records basis', () => {
    fc.assert(
      fc.property(inputsArb, checkArb, (inputs, check) => {
        expect(cleanBasisWithAnswerReason(evaluate(inputs, check).result)).toBe(false);
      }),
      { numRuns: fcRuns(200), seed: 0x0546 }
    );
  });

  it('I46 your own word (D-48 yes): the reason leads and the basis is not the clean sentence', () => {
    // 05.4-23 (FIN-08): QE-03, Only on your answer. (volatileInputs' plan is Not yet on its records alone, so its yes no longer
    // decides the answer and carries no user_said_cover reason.)
    const qe03 = loadCases().find((c) => c.id === 'QE-03');
    if (qe03 === undefined) throw new Error('no case QE-03');
    const { inputs, check } = toEngineInputs(qe03.fixture);
    const r = evaluate(inputs, check).result;
    expect(r.code).toBe('fits_on_your_answer');
    expect(r.confidence.reasons[0]?.code).toBe('user_said_cover');
    expect(r.confidence.basis.kind).not.toBe('records');
    const plan = checkPlan(150_000, { count: 6, apr: percent('0'), firstPayment: { kind: 'one_period' } }, { volatileCover: true });
    expect(evaluate(volatileInputs(), plan).result.confidence.reasons.map((x) => x.code)).not.toContain('user_said_cover');
  });
});

describe('no_full_month (FIN-25, thin records)', () => {
  const cases = loadCases();
  const byId = (id: string) => {
    const c = cases.find((x) => x.id === id);
    if (c === undefined) throw new Error(`no case ${id}`);
    return toEngineInputs(c.fixture);
  };
  const facts = (r: Result): string[] => r.facts.map((f) => f.code);
  const codes = (r: Result): string[] => r.confidence.reasons.map((x) => x.code);

  it.each(['QE-01', 'QE-13'])('%s: no complete month gives the fact no_full_month and the quick_estimates reason and basis', (id) => {
    const { inputs, check } = byId(id);
    const r = evaluate(inputs, check).result;
    expect(facts(r)).toContain('no_full_month');
    expect(codes(r)).toContain('quick_estimates');
    expect(r.confidence.basis).toEqual({ kind: 'quick_estimates' });
  });

  it('QE-02: 2 complete months: no no_full_month fact; few_months with its numbers and the partial basis', () => {
    const { inputs, check } = byId('QE-02');
    const r = evaluate(inputs, check).result;
    expect(facts(r)).not.toContain('no_full_month');
    expect(r.confidence.reasons.find((x) => x.code === 'few_months')?.numbers).toEqual({ used: 2, lookedFor: 3 });
    expect(r.confidence.basis).toEqual({ kind: 'partial', used: 2, lookedFor: 3, upTo: '2026-11-15' });
  });

  it('a past month that is not full does not count as complete, and an ask carries the fact too', () => {
    const { inputs, check } = byId('QE-02');
    const thin: V3Inputs = { ...inputs, months: inputs.months.map((m) => (m.month < '2026-11' ? { ...m, full: false } : m)) };
    const r = evaluate(thin, check).result;
    expect(r.code).toBe('needs_input');
    expect(facts(r)).toContain('no_full_month');
  });
});
