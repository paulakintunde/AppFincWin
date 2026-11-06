/**
 * ENG-19 (05.4-40, D-135): the synthetic people exercise the Fits rules and reach every answer variant.
 * I77: over 1,000 synthetic draws, all Fits answers are at least 30% and plain Fits (fits_month, fits_unspent) at least 25%.
 * I78: the same draws reach every variant a right-answer case may expect, except payday (the right-answer cases reach it).
 * (I75 is the caveats property and I76 the free-help property, so these take the next two numbers.)
 */
import fc from 'fast-check';
import { evaluate } from '../../evaluate';
import { fcRuns, isFullRun } from '../helpers/fcRuns';
import { VARIANTS } from '../rightAnswers/schema';
import { syntheticInputsArb } from './synthetic';

const SAMPLES = 1000;
const SEED = 0x0577;
const FITS = ['fits_month', 'fits_unspent', 'fits_uses_net', 'fits_uses_overdraft', 'fits_by_borrowing', 'fits_on_your_answer'];
const PLAIN_FITS = ['fits_month', 'fits_unspent'];
/** Variants the synthetic people need not reach, each with its reason. */
const NOT_DRAWN: Readonly<Record<string, string>> = { payday: 'reached by the right-answer cases (OD-05), not by synthetic draws' };

const codes = new Map<string, number>();
const variants = new Map<string, number>();
let n = 0;

beforeAll(() => {
  n = fcRuns(SAMPLES);
  for (const { inputs, check } of fc.sample(syntheticInputsArb, { numRuns: n, seed: SEED })) {
    const r = evaluate(inputs, check).result;
    codes.set(r.code, (codes.get(r.code) ?? 0) + 1);
    if (r.variant !== null) variants.set(r.variant, (variants.get(r.variant) ?? 0) + 1);
  }
  console.log(`synthetic people: ${n} draws; codes ${JSON.stringify(Object.fromEntries(codes))}; variants ${JSON.stringify(Object.fromEntries(variants))}`);
}, 600_000);

const count = (list: readonly string[]): number => list.reduce((t, c) => t + (codes.get(c) ?? 0), 0);

describe('ENG-19 synthetic people', () => {
  it('I77 Fits answers are well sampled: all Fits >= 30% and plain Fits >= 25% of the draws', () => {
    const all = count(FITS) / n;
    const plain = count(PLAIN_FITS) / n;
    console.log(`I77 Fits family ${(all * 100).toFixed(1)}%, plain Fits ${(plain * 100).toFixed(1)}% of ${n}`);
    if (!isFullRun(SAMPLES)) return; // too few draws under Stryker or FC_RUNS=10 for a share to mean anything
    expect(all).toBeGreaterThanOrEqual(0.3);
    expect(plain).toBeGreaterThanOrEqual(0.25);
  });

  it('I78 every answer variant is reached by some synthetic person (payday by the right-answer cases)', () => {
    if (!isFullRun(SAMPLES)) return;
    const missing = VARIANTS.filter((v) => NOT_DRAWN[v] === undefined && !variants.has(v));
    expect(missing).toEqual([]);
  });

  it('I78 the variants left out are named with a reason and are real variants', () => {
    for (const [v, why] of Object.entries(NOT_DRAWN)) {
      expect(VARIANTS as readonly string[]).toContain(v);
      expect(why.length).toBeGreaterThan(10);
    }
  });
});
