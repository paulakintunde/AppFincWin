/**
 * I44 (05.4-13, ENG-12): preparing once and judging per check gives the same answer as the single call, on 2,000 generated
 * (inputs, check) pairs. The "before" side is a committed digest file captured from the pre-refactor evaluate()
 * (PREPARE_CAPTURE=1 rewrites it); a digest is a sha256 of the key-sorted JSON of the whole Evaluation.
 */
import { createHash } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import fc from 'fast-check';
import { evaluate } from '../../evaluate';
import { judgeCheck, prepare } from '../../prepare';
import { fcRuns } from '../helpers/fcRuns';
import { checkArb, inputsArb } from './arbitraries';

const FILE = join(__dirname, '__snapshots__', 'prepare-before.json');
const SEED = 0x0544;
const RUNS = 2000;

function stable(v: unknown): string {
  return JSON.stringify(v, (_k, x: unknown) =>
    x !== null && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
      : x
  );
}
const digest = (v: unknown): string => createHash('sha256').update(stable(v)).digest('hex').slice(0, 16);

const cases = fc.sample(fc.tuple(inputsArb, checkArb), { numRuns: RUNS, seed: SEED });

describe('I44 prepare once, judge per check equals evaluate', () => {
  it('I44 evaluate matches the pre-refactor digests on 2,000 cases', () => {
    const now = cases.map(([i, c]) => digest(evaluate(i, c)));
    if (process.env['PREPARE_CAPTURE'] === '1') {
      writeFileSync(FILE, `${JSON.stringify(now)}\n`);
      return;
    }
    const before = JSON.parse(readFileSync(FILE, 'utf8')) as string[];
    expect(before).toHaveLength(RUNS);
    expect(now).toEqual(before);
  });

  it('I44 judgeCheck(prepare(inputs), check) deep-equals evaluate(inputs, check)', () => {
    fc.assert(
      fc.property(inputsArb, checkArb, (inputs, check) => {
        expect(judgeCheck(prepare(inputs), check)).toEqual(evaluate(inputs, check));
      }),
      { numRuns: fcRuns(300), seed: SEED }
    );
  });

  it('I44 one Prepared serves many checks', () => {
    fc.assert(
      fc.property(inputsArb, fc.array(checkArb, { minLength: 2, maxLength: 5 }), (inputs, checks) => {
        const p = prepare(inputs);
        for (const c of checks) expect(judgeCheck(p, c)).toEqual(evaluate(inputs, c));
      }),
      { numRuns: fcRuns(100), seed: SEED }
    );
  });
});
