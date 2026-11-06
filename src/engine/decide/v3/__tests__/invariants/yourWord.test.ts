/**
 * I61, I62 and I63 (05.4-23: FIN-08 / ENG-07 / CMP-F01, settled dispute 4, FIN-15). Ada (QE-04) and Omar (QE-06), perturbed.
 *
 * I61: a yes to "Can you cover the low months?" never turns a records gap green: with the answer changed from no or none to yes, the
 * answer is never fits_month or fits_unspent unless the records alone give that same answer. A yes that decides is
 * fits_on_your_answer, ranked stricter than every fit the records show.
 * I62: when stricterOf compares two readings whose codes tie, the one without rests_on_your_answer wins, whichever comes first, and
 * the loser's user_said_cover reason does not follow it.
 * I63: a steady earner's last 3 pays arriving below the set-up pay never improve the answer; lowering them further never does either.
 * Asks are left out (an ask is not an answer to compare).
 */
import * as fc from 'fast-check';
import { evaluate, stricterOf, type Evaluation } from '../../evaluate';
import type { Code } from '../../types';
import { toEngineInputs } from '../rightAnswers/fixture';
import { loadCases } from '../rightAnswers/loader';
import type { RightAnswerFixture } from '../rightAnswers/schema';
import { fcRuns, isFullRun } from '../helpers/fcRuns';
import { codeRank } from './arbitraries';

const byId = (id: string): RightAnswerFixture => {
  const c = loadCases().find((x) => x.id === id);
  if (c === undefined) throw new Error(id);
  return c.fixture;
};
const ADA = byId('QE-04');
const OMAR = byId('QE-06');
type Answer = 'yes' | 'no' | null;

/** Ada with a random low month, savings, safety net and plan. */
const adaArb = fc
  .record({
    low: fc.integer({ min: 0, max: 300_000 }),
    savings: fc.integer({ min: 0, max: 800_000 }),
    net: fc.option(fc.record({ size: fc.integer({ min: 0, max: 600_000 }), saved: fc.integer({ min: 0, max: 600_000 }), locked: fc.boolean() }), { nil: null }),
    price: fc.integer({ min: 12_000, max: 1_200_000 }),
    months: fc.integer({ min: 2, max: 36 }),
  })
  .map((r): RightAnswerFixture => {
    const pay = { ...ADA.pay, lastThree: [300_000, r.low, 300_000] as [number, number, number], lean: [{ month: '2026-09', amount: r.low }] };
    const accounts = ADA.accounts.map((a) => (a.kind === 'savings' ? { ...a, balance: r.savings, use: r.net === null ? null : ('emergency' as const) } : a));
    const safetyNet = r.net === null ? null : { protect: true, size: r.net.size, saved: Math.min(r.net.saved, r.savings), locked: r.net.locked };
    const check = { ...ADA.check, price: r.price, pay: { ...(ADA.check.pay as Extract<RightAnswerFixture['check']['pay'], { mode: 'plan' }>), months: r.months } };
    return { ...ADA, pay, accounts, safetyNet, check };
  });

const run = (f: RightAnswerFixture, answer: Answer): Evaluation => {
  const { inputs, check } = toEngineInputs({ ...f, check: { ...f.check, yourAnswer: answer } });
  return evaluate(inputs, check);
};
const GREEN: readonly Code[] = ['fits_month', 'fits_unspent'];
const rests = (e: Evaluation): boolean => e.result.facts.some((f) => f.code === 'rests_on_your_answer');

describe('your word and your records', () => {
  it('I61 a yes never turns a records gap green: fits_month or fits_unspent only when the records alone say so', () => {
    let decided = 0;
    fc.assert(
      fc.property(adaArb, fc.constantFrom<Answer>(null, 'no'), (f, before) => {
        const records = run(f, before);
        const yes = run(f, 'yes');
        if (GREEN.includes(yes.result.code)) expect({ records: records.result.code, yes: yes.result.code }).toEqual({ records: yes.result.code, yes: yes.result.code });
        // the yes never loosens past the records' own fit, and an answer that rests on it is amber
        if (yes.result.code === 'fits_on_your_answer') {
          decided += 1;
          expect(rests(yes)).toBe(true);
          expect(codeRank(yes.result.code)).toBeLessThan(codeRank('fits_by_borrowing'));
        }
        if (yes.result.code !== 'fits_on_your_answer') expect(rests(yes)).toBe(false);
      }),
      { numRuns: fcRuns(300), seed: 0x0561 }
    );
    if (isFullRun(300)) expect(decided).toBeGreaterThan(0);
  });

  it('I62 on a tie the reading without on your answer wins, whichever comes first', () => {
    let tied = 0;
    fc.assert(
      fc.property(adaArb, (f) => {
        const yes = run(f, 'yes');
        if (!rests(yes)) return;
        tied += 1;
        // the same code read from the records alone: the rests line and the user_said_cover reason taken off
        const plain: Evaluation = {
          ...yes,
          result: {
            ...yes.result,
            facts: yes.result.facts.filter((x) => x.code !== 'rests_on_your_answer'),
            confidence: { ...yes.result.confidence, reasons: yes.result.confidence.reasons.filter((r) => r.code !== 'user_said_cover') },
          },
        };
        for (const out of [stricterOf(yes, plain), stricterOf(plain, yes)]) {
          expect(rests(out)).toBe(false);
          expect(out.result.confidence.reasons.some((r) => r.code === 'user_said_cover')).toBe(false);
          expect(out.result.reasons.includes('thin_history_stricter')).toBe(false);
        }
      }),
      { numRuns: fcRuns(200), seed: 0x0562 }
    );
    if (isFullRun(200)) expect(tied).toBeGreaterThan(0);
  });

  it('I63 a pay cut shows up in the next answer: last pays below the set-up pay never improve the code', () => {
    let named = 0;
    fc.assert(
      fc.property(
        fc.tuple(fc.integer({ min: 150_000, max: 300_000 }), fc.integer({ min: 150_000, max: 300_000 }), fc.integer({ min: 150_000, max: 300_000 })),
        fc.integer({ min: 0, max: 50_000 }),
        fc.integer({ min: 100_000, max: 1_500_000 }),
        fc.constantFrom<'once' | 'plan'>('once', 'plan'),
        (three, cut, price, mode) => {
          const base: RightAnswerFixture = { ...OMAR, pay: { ...OMAR.pay, lastThree: null }, check: { ...OMAR.check, price, pay: mode === 'once' ? { mode: 'once' } : OMAR.check.pay } };
          const lower: RightAnswerFixture = { ...base, pay: { ...base.pay, lastThree: three } };
          const lowest: RightAnswerFixture = { ...base, pay: { ...base.pay, lastThree: three.map((x) => x - cut) as [number, number, number] } };
          const res = (f: RightAnswerFixture) => evaluate(toEngineInputs(f).inputs, toEngineInputs(f).check).result;
          const [a, b, c] = [res(base), res(lower), res(lowest)];
          if (b.reasons.includes('pay_gap')) named += 1;
          // an ask is not an answer: an earlier ask (the cover question) that a lower pay turns into Short each month is not looser
          if (a.code === 'needs_input' || b.code === 'needs_input' || c.code === 'needs_input') return;
          expect({ base: a.code, lower: b.code, ok: codeRank(b.code) <= codeRank(a.code) }).toEqual({ base: a.code, lower: b.code, ok: true });
          expect({ lower: b.code, lowest: c.code, ok: codeRank(c.code) <= codeRank(b.code) }).toEqual({ lower: b.code, lowest: c.code, ok: true });
        }
      ),
      { numRuns: fcRuns(200), seed: 0x0563 }
    );
    if (isFullRun(200)) expect(named).toBeGreaterThan(0);
  });
});
