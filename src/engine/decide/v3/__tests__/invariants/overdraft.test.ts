/**
 * I47, I48, I49 and the named property I-limit (05.4 FIN-03 / ENG-02; D-26..D-28, D-36..D-38; 05.4-12 revision notes section 4).
 * Golden persons with an overdraft on their main account (overdraftInputsArb), plus the approved overdraft cases for the
 * limit boundary. needs_input asks for a figure, not a verdict, so a pair where either side asks is skipped.
 */
import * as fc from 'fast-check';
import { minorUnits } from '../../../../money/types';
import { evaluate } from '../../evaluate';
import type { CheckV2, Result, V3Account, V3Inputs } from '../../types';
import { checkOnce } from '../helpers/fixtures';
import { fcRuns } from '../helpers/fcRuns';
import { toEngineInputs } from '../rightAnswers/fixture';
import { loadCases } from '../rightAnswers/loader';
import { checkArb, codeRank, overdraftInputsArb, withOverdraft } from './arbitraries';

const run = (inputs: V3Inputs, check: CheckV2): Result => evaluate(inputs, check).result;
const asking = (...rs: Result[]): boolean => rs.some((r) => r.code === 'needs_input');

/** The approved cases whose answer uses the overdraft (the limit boundary is read from them). */
const OVERDRAFT_CASES = loadCases().filter((c) => c.topic === 'overdraft' && c.expected.code === 'fits_uses_overdraft');

function withLimit(inputs: V3Inputs, limit: number | null): V3Inputs {
  return {
    ...inputs,
    accounts: (inputs.accounts ?? []).map((a): V3Account => (a.kind === 'checking' || a.kind === 'current' ? { ...a, overdraftLimit: limit === null ? null : minorUnits(limit) } : a)),
  };
}

describe('overdraft invariants', () => {
  it('I47 a lower balance never gives a better answer', () => {
    fc.assert(
      fc.property(overdraftInputsArb, checkArb, fc.integer({ min: 0, max: 2_000_000 }), ({ base, o }, check, d) => {
        const before = run(withOverdraft(base, o), check);
        const after = run(withOverdraft(base, { ...o, balanceDrop: o.balanceDrop + d }), check);
        fc.pre(!asking(before, after));
        expect(codeRank(after.code)).toBeLessThanOrEqual(codeRank(before.code));
      }),
      { numRuns: fcRuns(300), seed: 0x0547 }
    );
  });

  it('I48 past the overdraft limit is Not yet, and Uses your overdraft only ever comes from a dip inside it', () => {
    fc.assert(
      fc.property(overdraftInputsArb, checkArb, ({ base, o }, check) => {
        const ev = evaluate(withOverdraft(base, o), check);
        fc.pre(ev.result.code !== 'needs_input');
        const limit = o.overdraftLimit ?? 0;
        if (ev.cash.kind === 'payday' || ev.cash.kind === 'not_covered') {
          expect(ev.cash.shortBy).toBeGreaterThan(limit);
          expect(ev.result.code).toBe('not_yet');
        }
        if (ev.result.parts.oneOff === 'fits_uses_overdraft') {
          expect(ev.cash.kind).toBe('overdraft');
          expect(ev.result.facts.some((f) => f.code === 'overdraft_use')).toBe(true);
        }
        if (ev.cash.kind === 'overdraft' && ev.result.code !== 'not_yet') expect(ev.result.facts.some((f) => f.code === 'overdraft_use')).toBe(true);
      }),
      { numRuns: fcRuns(300), seed: 0x0548 }
    );
  });

  it('I49 no limit set gives the same answer as a limit of 0', () => {
    fc.assert(
      fc.property(overdraftInputsArb, checkArb, ({ base, o }, check) => {
        const none = run(withOverdraft(base, { ...o, overdraftLimit: null }), check);
        const zero = run(withOverdraft(base, { ...o, overdraftLimit: 0 }), check);
        // The answer is the same; only the D-38 question differs (a null limit is asked about, an explicit 0 is an answer).
        expect({ code: zero.code, variant: zero.variant, readyBy: zero.readyBy, split: zero.split }).toEqual({
          code: none.code,
          variant: none.variant,
          readyBy: none.readyBy,
          split: none.split,
        });
        expect(zero.facts.filter((f) => f.code !== 'no_overdraft_limit' && f.code !== 'clearing_first' && f.code !== 'ready_without_interest')).toEqual(
          none.facts.filter((f) => f.code !== 'no_overdraft_limit' && f.code !== 'clearing_first' && f.code !== 'ready_without_interest')
        );
        expect(zero.facts.some((f) => f.code === 'no_overdraft_limit')).toBe(false);
      }),
      { numRuns: fcRuns(300), seed: 0x0549 }
    );
  });

  it('I-limit exactly at the overdraft limit is inside it; 1 cent past is Not yet', () => {
    expect(OVERDRAFT_CASES.map((c) => c.id)).toEqual(['OD-01', 'OD-03', 'OD-11', 'OD-12']);
    fc.assert(
      fc.property(fc.constantFrom(...OVERDRAFT_CASES), fc.integer({ min: 1, max: 300_000 }), (c, price) => {
        const { inputs } = toEngineInputs(c.fixture);
        const check = checkOnce(price);
        const wide = evaluate(withLimit(inputs, 100_000_000), check);
        fc.pre(wide.result.code === 'fits_uses_overdraft' && wide.cash.kind === 'overdraft');
        const limit = wide.cash.kind === 'overdraft' ? -wide.cash.lowest.balance : 0;
        expect(run(withLimit(inputs, limit), check).code).toBe('fits_uses_overdraft');
        expect(run(withLimit(inputs, limit - 1), check).code).toBe('not_yet');
      }),
      { numRuns: fcRuns(200), seed: 0x054a }
    );
  });

  it('I-limit OD-01 (Priya): a 460 low point is inside a 460 limit and past a 459.99 one', () => {
    const { inputs, check } = toEngineInputs(OVERDRAFT_CASES[0]!.fixture);
    expect(run(withLimit(inputs, 46_000), check).code).toBe('fits_uses_overdraft');
    expect(run(withLimit(inputs, 45_999), check).code).toBe('not_yet');
    expect(run(withLimit(inputs, null), check).code).toBe('not_yet');
  });
});
