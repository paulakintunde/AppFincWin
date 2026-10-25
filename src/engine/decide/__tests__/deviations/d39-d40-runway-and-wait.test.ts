/**
 * Named deviation tests, D-39 and D-40 (runway and wait plan, plan 04-10).
 *
 * Prototype runway (line 4568): `(cash / burn).toFixed(1)` on cash before the purchase.
 * Prototype wait panel (lines 4720-4730): `target = max(mineCash, price * sh - max(0, cash - reserve))` and
 * `months = max(1, ceil(target / max(25, waitAmt)))`.
 */
import { minorUnits } from '../../../money/types';
import { percent } from '../../../payoff/types';
import { assessPlan, prepareContext } from '../../assess';
import { DEFAULT_SETBACKS } from '../../constants';
import { resolvePlanStrict } from '../../plan';
import { applySetbacks } from '../../setbacks';
import type { DecideSnapshot, PurchaseCheck } from '../../types';
import { buildWaitPlan } from '../../wait';
import { USD, buyCash, snapshotOf } from '../helpers/fixtures';

const mu = minorUnits;
const D1 = {
  id: 'd1',
  balance: mu(800_000),
  minimumPayment: mu(20_000),
  secured: false,
  apr: percent('19.9'),
  currency: USD,
};
const D2 = { ...D1, id: 'd2', balance: mu(15_000_000), minimumPayment: mu(90_000), secured: true };
const BL = (): DecideSnapshot =>
  snapshotOf({
    debts: [D1, D2],
    monthlySaving: mu(25_000),
    monthlyInvesting: mu(40_000),
    limits: {
      reserve: mu(600_000),
      dsrLine: null,
      housingLine: null,
      unsecuredIncomeMultiple: null,
      investingFloor: null,
      savingFloor: null,
      spareFloor: null,
    },
  });
function ctxOf(s: DecideSnapshot) {
  const r = prepareContext(s);
  if (!r.ok) throw new Error('expected ok');
  return r.context;
}
const waitOf = (check: PurchaseCheck, amount: number | null = null) =>
  buildWaitPlan(ctxOf(BL()), check, amount === null ? null : mu(amount));

describe('D-39 / D-40', () => {
  it('D-39: runway uses cash after the purchase in whole months (the prototype used cash before it, to one decimal)', () => {
    // Prototype: (cash / burn).toFixed(1) = (2_000_000 / 560_000) -> '3.6'.
    const check = buyCash(300_000);
    const ctx = ctxOf(BL());
    const a = { ...assessPlan(ctx, check, resolvePlanStrict(check)), burn: mu(560_000) };
    expect(a.cashAfter).toBe(1_700_000);
    expect((2_000_000 / 560_000).toFixed(1)).toBe('3.6');
    expect(applySetbacks(a, DEFAULT_SETBACKS).runwayMonths).toBe(3);
  });

  it('D-40: the wait target is what spare cash does not cover (the prototype used max(mineCash, …), so a cash purchase waited for the whole price)', () => {
    // Prototype target 1_700_000 -> 14 months at 125_000; engine target 300_000 -> 3 months.
    expect(Math.ceil(1_700_000 / 125_000)).toBe(14);
    const w = waitOf(buyCash(1_700_000));
    expect(w.target).toBe(300_000);
    expect(w.months).toBe(3);
  });

  it('D-40: no 25.00 minimum amount in the engine', () => {
    // Prototype: max(25, waitAmt). An amount of 10.00 (1_000) is accepted as typed.
    const w = waitOf(buyCash(1_700_000), 1_000);
    expect(w.monthlyAmount).toBe(1_000);
    expect(w.months).toBe(300);
  });
});
