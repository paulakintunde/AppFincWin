/**
 * QA-03: the engine and the plain calculator must agree on the code (and money left once FIN-09 lands)
 * for random fixtures. Fixtures that trigger a rule still in PENDING_RULES are skipped and counted.
 */
import * as fc from 'fast-check';
import { evaluate } from '../../evaluate';
import { toEngineInputs } from '../rightAnswers/fixture';
import { pick } from '../rightAnswers/pick';
import { fixtureArb } from './fixtureArb';
import { pendingFixIds } from './pendingRules';
import { plainAnswer } from './plain';

const RUNS = Number(process.env.CROSSCHECK_RUNS ?? 1000);
const SEED = process.env.CROSSCHECK_SEED ? Number(process.env.CROSSCHECK_SEED) : Date.now() % 2_000_000_000;

describe('cross-check calculator vs engine', () => {
  it(`agrees on ${RUNS} random fixtures`, () => {
    const skipped: Record<string, number> = {};
    let compared = 0;
    try {
      fc.assert(
        fc.property(fixtureArb, (f) => {
          const blocking = pendingFixIds(f).filter((id) => id !== 'FIN-09');
          if (blocking.length > 0) {
            for (const id of blocking) skipped[id] = (skipped[id] ?? 0) + 1;
            return;
          }
          compared++;
          const { inputs, check } = toEngineInputs(f);
          const got = pick(evaluate(inputs, check));
          const plain = plainAnswer(f);
          expect({ code: got.code }).toEqual({ code: plain.code });
        }),
        { numRuns: RUNS, seed: SEED }
      );
    } catch (e) {
      console.log(`crosscheck seed ${SEED}`);
      throw e;
    }
    console.log(`crosscheck: compared ${compared}, skipped ${JSON.stringify(skipped)}, seed ${SEED}`);
    expect(compared).toBeGreaterThan(0);
  });
});
