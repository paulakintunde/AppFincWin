/**
 * QA-03: the engine and the plain calculator must agree on the code (and, since 05.4-24 FIN-09, on the month figure after buying), on the tight caution
 * (05.4-21), and, for a fixture with a card or loan, on the costly-debt caution (05.4-20)
 * for random fixtures. Fixtures that trigger a rule still in PENDING_RULES are skipped and counted. 05.4-27: endOnFailure, so a
 * counterexample prints as drawn instead of shrinking for hours (each fixture runs the whole engine; seed 14 shrank for 5+ hours).
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
          const blocking = pendingFixIds(f);
          if (blocking.length > 0) {
            for (const id of blocking) skipped[id] = (skipped[id] ?? 0) + 1;
            return;
          }
          compared++;
          const { inputs, check } = toEngineInputs(f);
          const got = pick(evaluate(inputs, check));
          const plain = plainAnswer(f);
          // 05.4-20 (D-39b): with a card or loan drawn, the costly-debt caution is compared too. 05.4-21 (FIN-07, D-40): and tight.
          const costly = (v: string | null): boolean | null => (f.debts.length === 0 ? null : v === 'costly_debt');
          const tight = (v: string | null): boolean => v === 'tight';
          // 05.4-24 (FIN-09): the month figure after buying; an ask has none.
          const month = (code: string, m: number | null): number | null => (code === 'needs_input' ? null : m);
          expect({ code: got.code, costly: costly(got.variant), tight: tight(got.variant), month: month(got.code, got.afterBuy.month) }).toEqual({
            code: plain.code,
            costly: costly(plain.variant),
            tight: tight(plain.variant),
            month: month(plain.code, plain.afterBuy),
          });
        }),
        { numRuns: RUNS, seed: SEED, endOnFailure: true }
      );
    } catch (e) {
      console.log(`crosscheck seed ${SEED}`);
      throw e;
    }
    console.log(`crosscheck: compared ${compared}, skipped ${JSON.stringify(skipped)}, seed ${SEED}`);
    expect(compared).toBeGreaterThan(0);
  });
});

/**
 * 05.4-22 (FIN-05 / ENG-08, D-07, D-39a, D-39c): the borrowing rule on random plans. Plans stay out of the whole-code comparison
 * above (pendingRules PLAIN-PLANS: the plain plan branch is not ladder-complete), so here they are compared on the borrowing answer alone:
 * wherever both sides say the plan fits, they agree on "Only by borrowing", "Fits, but borrowing costs more" or neither.
 */
describe('cross-check calculator vs engine: borrowing on plans', () => {
  const FITS = new Set(['fits_month', 'fits_unspent', 'fits_uses_net', 'fits_uses_overdraft', 'fits_by_borrowing']);
  const borrowing = (code: string, variant: string | null): string => (code === 'fits_by_borrowing' ? `fits_by_borrowing/${String(variant)}` : 'no');
  it(`agrees on the borrowing answer for the random plans among ${RUNS} fixtures`, () => {
    let compared = 0;
    let borrowed = 0;
    try {
      fc.assert(
        fc.property(fixtureArb, (f) => {
          if (f.check.pay.mode !== 'plan' || pendingFixIds(f).some((id) => id !== 'PLAIN-PLANS')) return;
          if ((f.check.runningCosts?.length ?? 0) > 0 || f.check.replaces != null || f.check.closingPercent != null) return;
          const { inputs, check } = toEngineInputs(f);
          const got = pick(evaluate(inputs, check));
          const plain = plainAnswer(f);
          if (!FITS.has(got.code) || !FITS.has(plain.code)) return;
          compared++;
          if (got.code === 'fits_by_borrowing') borrowed++;
          expect(borrowing(got.code, got.variant)).toBe(borrowing(plain.code, plain.variant));
        }),
        { numRuns: RUNS, seed: SEED, endOnFailure: true }
      );
    } catch (e) {
      console.log(`crosscheck (borrowing) seed ${SEED}`);
      throw e;
    }
    console.log(`crosscheck (borrowing): compared ${compared} plans, ${borrowed} borrowed, seed ${SEED}`);
    expect(compared).toBeGreaterThan(0);
  });
});
