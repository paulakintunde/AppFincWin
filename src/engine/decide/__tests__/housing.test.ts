/**
 * E8 (D-103; UI-SPEC R18.4): the housing line and its soft warning.
 *
 * The baseline earns 600_000 a month and spends 300_000, so the money-in basis is 600_000 and 28% of it is exactly
 * 168_000. A check adds housing cost only when it is a property check with a positive monthly effect (mineMonthly +
 * mineRunning > 0); every other check is never blamed for housing already over the line.
 */
import { minorUnits } from '../../money/types';
import { percent } from '../../payoff/types';
import { WARNING_ORDER } from '../constants';
import { assess, prepareContext } from '../assess';
import type { Assessment, BuyCheck, DecideSnapshot, InvestCheck, PurchaseCheck, Warning } from '../types';
import { USD, buyCash, monthsOf, snapshotOf } from './helpers/fixtures';

const mu = minorUnits;
const LINE_MONEY = 168_000; // 28% of the 600_000 money-in basis

function snap(over: Partial<DecideSnapshot> = {}): DecideSnapshot {
  return snapshotOf({ housingMonthly: mu(100_000), ...over });
}
function property(running: number, over: Partial<BuyCheck> = {}): BuyCheck {
  return buyCash(1_000, { itemType: 'property', runningCostsNet: mu(running), ...over });
}
function run(s: DecideSnapshot, c: PurchaseCheck): Assessment {
  const v = assess(s, c);
  if (v.state === 'missing') throw new Error('expected a resolved verdict');
  return v;
}
const housingWarning = (a: Assessment): Warning | undefined => a.warnings.find((w) => w.code === 'housing');

describe('D-103 housing line (E8)', () => {
  it('D-103 exactly 28.00 percent is not a breach and one minor unit over is', () => {
    const s = snap();
    expect(prepareContext(s)).toMatchObject({ ok: true, context: { money: { incomeBasis: 600_000 } } });
    const exact = run(s, property(LINE_MONEY - 100_000));
    expect(exact.housingAfter).toBe(LINE_MONEY);
    expect(exact.housingRatioAfter).toBe(percent('28'));
    expect(housingWarning(exact)).toBeUndefined();
    expect(exact.checks.housing).toBe(true);
    expect(exact.state).toBe('fits');

    const over = run(s, property(LINE_MONEY - 100_000 + 1));
    expect(housingWarning(over)).toEqual({ code: 'housing', shortfall: 1 });
    expect(over.checks.housing).toBe(false);
    expect(over.state).toBe('adjust');
  });

  it('D-103 shortfall is the housing cost less the half-up line in money', () => {
    // 27.5% of 600_001 is 165_000.275; half-up line = 165_000, so the shortfall is housingAfter - 165_000
    const s = snap({
      months: monthsOf([[600_001, 300_000], [600_001, 300_000], [600_001, 300_000]], '2026-04'),
      limits: { ...snapshotOf().limits, housingLine: percent('27.5') },
    });
    const a = run(s, property(70_000));
    expect(a.context.money.incomeBasis).toBe(600_001);
    expect(housingWarning(a)).toEqual({ code: 'housing', shortfall: 170_000 - 165_000 });
    // 27.5% of 600_005 = 165_001.375 rounds down; 27.5% of 600_007 = 165_001.925 rounds up
    const up = snap({
      months: monthsOf([[600_007, 300_000], [600_007, 300_000], [600_007, 300_000]], '2026-04'),
      limits: { ...snapshotOf().limits, housingLine: percent('27.5') },
    });
    expect(housingWarning(run(up, property(70_000)))).toEqual({ code: 'housing', shortfall: 170_000 - 165_002 });
  });

  it('D-103 no income: any housing cost is over the line', () => {
    const s = snap({ months: monthsOf([[0, 300_000], [0, 300_000], [0, 300_000]], '2026-04') });
    const a = run(s, property(1));
    expect(a.context.money.incomeBasis).toBe(0);
    expect(a.housingRatioBefore).toBeNull();
    expect(a.housingRatioAfter).toBeNull();
    expect(housingWarning(a)).toEqual({ code: 'housing', shortfall: 100_001 });
    expect(a.checks.housing).toBe(false);
  });

  it('D-103 only property checks that add housing are tested', () => {
    // housing is already over the line (200_000 > 168_000) before any check
    const s = snap({ housingMonthly: mu(200_000) });
    for (const itemType of ['general', 'rent_bill', 'vehicle', 'loan_repayment', 'tax', 'insurance_premium', 'cash_equivalent', 'tuition'] as const) {
      const a = run(s, buyCash(1_000, { itemType, runningCostsNet: mu(50_000) }));
      expect(housingWarning(a)).toBeUndefined();
      expect(a.checks.housing).toBe(true);
      expect(a.housingAfter).toBe(200_000);
    }
    // a property check with no monthly effect, or one that nets to nothing, is not tested either
    for (const running of [0, -30_000]) {
      const a = run(s, property(running));
      expect(housingWarning(a)).toBeUndefined();
      expect(a.checks.housing).toBe(true);
    }
    // a property check that does add housing is tested
    expect(housingWarning(run(s, property(1)))).toBeDefined();
    // an invest check is never tested
    const invest: InvestCheck = { kind: 'invest', currency: USD, amount: mu(100_000), payment: { method: 'monthly', termMonths: 12 } };
    const inv = run(s, invest);
    expect(housingWarning(inv)).toBeUndefined();
    expect(inv.housingAfter).toBe(200_000);
  });

  it('D-103 housingAfter is floored at 0', () => {
    // replaced expenses (a negative running cost) that net the effect to zero or below are not tested, so the figure is
    // the housing already there, never negative, whatever the size of the saving
    const a = run(snap({ housingMonthly: mu(0) }), property(-500_000));
    expect(a.housingAfter).toBe(0);
    expect(a.housingBefore).toBe(0);
    expect(a.housingRatioBefore).toBe(percent('0'));
    expect(housingWarning(a)).toBeUndefined();
  });

  it('D-103 housingAfter adds my monthly and running cost on a loan', () => {
    const loan = property(5_000, { payment: { method: 'loan', deposit: mu(0), termMonths: 10, apr: percent('0') } });
    const a = run(snap(), loan);
    expect(a.newMonthly).toBe(5_100); // 1_000 over 10 months at 0% plus 5_000 running
    expect(a.housingAfter).toBe(105_100);
    expect(a.housingBefore).toBe(100_000);
  });

  it('D-103 the tie-break puts housing after dsr and before owe', () => {
    expect(WARNING_ORDER.indexOf('dsr')).toBeLessThan(WARNING_ORDER.indexOf('housing'));
    expect(WARNING_ORDER.indexOf('housing')).toBeLessThan(WARNING_ORDER.indexOf('owe'));
    // Build the three-way tie through the limits: a 0% line makes each shortfall the whole amount over it.
    const s = snap({
      housingMonthly: mu(0),
      debts: [{ id: 'd', balance: mu(30_000), minimumPayment: mu(30_000), secured: false, apr: null, currency: USD }],
      limits: { ...snapshotOf().limits, dsrLine: percent('0'), housingLine: percent('0'), unsecuredIncomeMultiple: 0 },
    });
    // property check: running 30_000 -> housing shortfall 30_000; dsr shortfall 30_000 (the debt payment); owe 30_000
    const a = run(s, property(30_000));
    const tied = a.warnings.filter((w) => ['dsr', 'housing', 'owe'].includes(w.code));
    expect(tied.map((w) => [w.code, w.shortfall])).toEqual([
      ['dsr', 30_000],
      ['housing', 30_000],
      ['owe', 30_000],
    ]);
  });

  it('D-103 the warning never makes the state no on its own', () => {
    const a = run(snap({ housingMonthly: mu(500_000) }), property(1));
    expect(a.warnings.map((w) => w.code)).toEqual(['housing']);
    expect(a.state).toBe('adjust');
  });

  it('D-103 a changed line applies and the default is 28 percent', () => {
    const s = snap({ limits: { ...snapshotOf().limits, housingLine: percent('40') } });
    const a = run(s, property(100_000));
    expect(a.context.limits.housingLine).toBe(percent('40'));
    expect(housingWarning(a)).toBeUndefined(); // 200_000 <= 240_000
    expect(run(snap(), property(1)).context.limits.housingLine).toBe(percent('28'));
  });

  it('D-103 a negative housing line or housing figure is rejected', () => {
    expect(() => prepareContext(snap({ limits: { ...snapshotOf().limits, housingLine: -1n as never } }))).toThrow(
      /^prepareContext: limits\.housingLine/
    );
    expect(() => prepareContext(snap({ housingMonthly: -1 as never }))).toThrow(/^prepareContext: housingMonthly -1/);
  });
});
