// 08.1-12 (D-12): Purchase.full carries the whole purchase and the up-front part BEFORE my share, only when the share splits.
import { evaluate } from '../../index';
import { minorUnits } from '../../../../money/types';
import { percent } from '../../../../payoff/types';
import { checkOnce, checkPlan, inputsOf } from '../../__tests__/helpers/fixtures';
import type { CheckV2 } from '../../types';

const mu = minorUnits;
const inputs = inputsOf({ balance: mu(50000000) });
const even: CheckV2['share'] = { kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'even' } };

describe('Purchase.full', () => {
  it('a split cash purchase carries the full whole and day-one; my part is the smaller figure', () => {
    const p = evaluate(inputs, checkOnce(100001, { share: even })).purchase;
    expect(p?.full?.whole).toBeGreaterThanOrEqual(100001);
    expect(p?.full?.dayOne).toBe(p?.full?.whole);
    expect(p?.whole).toBeLessThan(p?.full?.whole ?? 0);
  });
  it('a split plan carries the full up-front part, never less than mine', () => {
    const plan = checkPlan(120001, { count: 12, apr: percent('0'), deposit: mu(20001), firstPayment: { kind: 'one_period' } }, { share: even });
    const p = evaluate(inputs, plan).purchase;
    expect(p?.full?.dayOne).toBeGreaterThanOrEqual(20001);
    expect(p?.full?.dayOne).toBeGreaterThan(p?.dayOne ?? 0);
  });
  it('a personal purchase has no full (whole and dayOne are already the full amounts)', () => {
    expect(evaluate(inputs, checkOnce(100001, { share: { kind: 'personal' } })).purchase?.full).toBeUndefined();
  });
  it('a rule that keeps everything with me has no full either', () => {
    expect(evaluate(inputs, checkOnce(100001, { share: { kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'mine' } } })).purchase?.full).toBeUndefined();
  });
});
