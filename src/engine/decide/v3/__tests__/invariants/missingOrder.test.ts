/**
 * D-59 (05.1-46): the missing list is always in MISSING_PRIORITY order, whatever the inputs and the check.
 * A fixed-seed property over evaluate, plus hand-built cases that make several questions fire at once.
 */
import fc from 'fast-check';
import { minorUnits } from '../../../../money/types';
import { MISSING_PRIORITY } from '../../constants';
import { evaluate } from '../../evaluate';
import type { MissingCode, V3Inputs, V3Month } from '../../types';
import { toV3Inputs, personById } from '../golden/adapter';
import { checkOnce, checkPlan } from '../helpers/fixtures';
import { percent } from '../../../../payoff/types';
import { checkArb, inputsArb } from './arbitraries';

const mu = minorUnits;

const isInPriorityOrder = (missing: readonly MissingCode[]): boolean => {
  const idx = missing.map((m) => MISSING_PRIORITY.indexOf(m));
  return idx.every((i, k) => i >= 0 && (k === 0 || (idx[k - 1] as number) < i));
};

describe('D-59 the missing list is in priority order', () => {
  it('D-59 for every result of evaluate (fixed seed)', () => {
    fc.assert(
      fc.property(inputsArb, checkArb, (inputs, check) => {
        expect(isInPriorityOrder(evaluate(inputs, check).result.missing)).toBe(true);
      }),
      { numRuns: 200, seed: 0x0559 }
    );
  });

  it('D-59 several questions at once come out account, pay, then the check own fields', () => {
    const sam = toV3Inputs(personById('sam'));
    const noPay = (b: V3Inputs): V3Inputs => ({
      ...b,
      months: b.months.map((m): V3Month => (m.month === '2026-10' ? { ...m, lines: m.lines.filter((l) => l.role !== 'income') } : m)),
    });
    const many: V3Inputs = {
      ...noPay(sam),
      accounts: [{ id: 'acc-1', balance: mu(1_307_500), use: null }],
      unspent: null,
    };
    const r = evaluate(many, checkPlan(204_000, { count: null, apr: percent('0'), firstPayment: { kind: 'one_period' } })).result;
    expect(r.code).toBe('needs_input');
    expect(r.missing.length).toBeGreaterThanOrEqual(3);
    expect(r.missing[0]).toBe('account_use_question');
    expect(r.missing[1]).toBe('pay_arrival_question');
    expect(isInPriorityOrder(r.missing)).toBe(true);
  });

  it('D-59 a single question is returned as it is', () => {
    const sam = toV3Inputs(personById('sam'));
    const r = evaluate({ ...sam, unspent: null }, checkOnce(5_000_000)).result;
    expect(r.missing).toEqual(['unspent_not_confirmed']);
  });
});
