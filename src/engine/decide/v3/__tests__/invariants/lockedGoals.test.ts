/**
 * I-06-03 (06 D-05, D-06, D-22): `locked` absent gives the same answer as `locked: true` (only the new facts differ), and
 * flipping a goal from unlocked to locked never raises the lowest point and never makes the answer less strict.
 * Golden persons with one goal linked to no account; a pair where either side asks is skipped.
 */
import * as fc from 'fast-check';
import { evaluate } from '../../evaluate';
import type { Envelope, Fact, V3Inputs } from '../../types';
import { fcRuns } from '../helpers/fcRuns';
import { checkArb, codeRank, inputsArb, mu } from './arbitraries';

const NEW_FACTS = new Set<string>(['locked_goals_kept', 'net_and_goals_kept', 'unlocked_goals_counted', 'net_locked']);
const goalOf = (saved: number, locked: boolean | undefined): Envelope => ({
  id: 'g1',
  kind: 'pot',
  target: mu(1_000_000),
  monthlyAmount: null,
  readyBy: null,
  saved: mu(saved),
  purposeId: null,
  accountId: null,
  ...(locked === undefined ? {} : { locked }),
});
const withGoal = (i: V3Inputs, saved: number, locked: boolean | undefined): V3Inputs => ({ ...i, envelopes: [...i.envelopes, goalOf(saved, locked)] });
const withoutNew = (facts: readonly Fact[]): readonly Fact[] => facts.filter((f) => !NEW_FACTS.has(f.code));
const savedArb = fc.integer({ min: 1, max: 500_000 });

describe('locked goal invariants', () => {
  it('locked absent and locked true give the same answer; only the new facts differ', () => {
    fc.assert(
      fc.property(inputsArb, checkArb, savedArb, (base, check, saved) => {
        const absent = evaluate(withGoal(base, saved, undefined), check);
        const locked = evaluate(withGoal(base, saved, true), check);
        expect(absent.result.code).toBe(locked.result.code);
        expect(absent.result.variant).toBe(locked.result.variant);
        expect(absent.result.split).toEqual(locked.result.split);
        expect(absent.result.readyBy).toEqual(locked.result.readyBy);
        expect(withoutNew(absent.result.facts)).toEqual(withoutNew(locked.result.facts));
        expect(absent.result.facts.some((f) => NEW_FACTS.has(f.code) && f.code !== 'net_locked')).toBe(false);
      }),
      { numRuns: fcRuns(200), seed: 0x0603 }
    );
  });

  it('locking a goal never raises the lowest point and never gives a less strict answer', () => {
    fc.assert(
      fc.property(inputsArb, checkArb, savedArb, (base, check, saved) => {
        const unlocked = evaluate(withGoal(base, saved, false), check);
        const locked = evaluate(withGoal(base, saved, true), check);
        fc.pre(locked.result.code !== 'needs_input' && unlocked.result.code !== 'needs_input');
        expect(codeRank(locked.result.code)).toBeLessThanOrEqual(codeRank(unlocked.result.code));
        if (locked.cash.kind === 'ok' && unlocked.cash.kind === 'ok') {
          expect(locked.cash.lowest.balance).toBeLessThanOrEqual(unlocked.cash.lowest.balance);
        }
      }),
      { numRuns: fcRuns(200), seed: 0x0604 }
    );
  });
});
