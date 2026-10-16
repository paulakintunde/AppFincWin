import fc from 'fast-check';
import { minorUnits } from '../../money/types';
import { percent } from '../../payoff/types';
import { assessPlan, prepareContext } from '../assess';
import { DEFAULT_SETBACKS } from '../constants';
import { incomeAtRisk } from '../incomeAtRisk';
import { resolvePlanStrict } from '../plan';
import { applySetbacks, runwayMonthsOf } from '../setbacks';
import type { Assessment, BuyCheck, DecideSnapshot, SetbackInput } from '../types';
import { bill, buyCash, income, snapshotOf } from './helpers/fixtures';

const mu = minorUnits;

const D1 = {
  id: 'd1',
  balance: mu(800_000),
  minimumPayment: mu(20_000),
  secured: false,
  apr: percent('19.9'),
  currency: snapshotOf().currency,
};
const D2 = { ...D1, id: 'd2', balance: mu(15_000_000), minimumPayment: mu(90_000), secured: true, apr: percent('5.1') };
const BL = (over: Partial<DecideSnapshot> = {}): DecideSnapshot =>
  snapshotOf({ debts: [D1, D2], monthlySaving: mu(25_000), monthlyInvesting: mu(40_000), ...over });
const YEARLY_DUE = bill({
  seriesId: 's-ins',
  freq: 'yearly',
  anchorDate: '2025-09-01',
  lastPaidDate: '2025-09-01',
  latestAmount: 120_000,
});
const PAY = income({
  seriesId: 'pay',
  freq: 'monthly',
  anchorDate: '2026-01-25',
  lastPaidDate: '2026-06-25',
  latestAmount: 600_000,
});
const loanCheck = (): BuyCheck =>
  buyCash(1_450_000, {
    payment: { method: 'loan', deposit: mu(300_000), termMonths: 48, apr: percent('9.4') },
  });

function assessOf(s: DecideSnapshot, check: BuyCheck): Assessment {
  const r = prepareContext(s);
  if (!r.ok) throw new Error('expected ok');
  return assessPlan(r.context, check, resolvePlanStrict(check));
}

const A = assessOf(BL(), loanCheck());
const ctx = A.context;
const pick = (code: SetbackInput['code']) => (list: ReturnType<typeof incomeAtRisk>['setbacks']) =>
  list.find((s) => s.code === code)!;
const enableAll = (): SetbackInput[] => DEFAULT_SETBACKS.map((s) => ({ ...s, enabled: true }) as SetbackInput);

describe('incomeAtRisk fixture', () => {
  it('matches the plan figures', () => {
    expect(ctx.cashAfterBills).toBe(2_000_000);
    expect(ctx.monthCosts).toBe(410_000);
    expect(ctx.mySpendingBasis + ctx.debtPayments).toBe(410_000);
    expect(A.cashAfterBillsAndPurchase).toBe(1_700_000);
    expect(A.burn).toBe(410_000 + A.mineMonthly);
  });
});

describe('incomeAtRisk overall runway (D-54, D-39)', () => {
  it('with, without and lost', () => {
    const r = incomeAtRisk(ctx, A, DEFAULT_SETBACKS);
    expect(r.runwayWith).toBe(runwayMonthsOf(mu(1_700_000), A.burn));
    expect(r.runwayWith).toBe(3);
    expect(r.runwayWithout).toBe(4);
    expect(r.runwayLost).toBe(1);
  });
  it('null when a burn is 0 or below', () => {
    const noBurn = { ...A, burn: mu(0) };
    const r = incomeAtRisk(ctx, noBurn, DEFAULT_SETBACKS);
    expect(r.runwayWith).toBeNull();
    expect(r.runwayLost).toBeNull();
    expect(r.runwayWithout).toBe(4);
    const noWithout = incomeAtRisk({ ...ctx, mySpendingBasis: mu(0), debtPayments: mu(0) }, A, DEFAULT_SETBACKS);
    expect(noWithout.runwayWithout).toBeNull();
    expect(noWithout.runwayLost).toBeNull();
    expect(noWithout.runwayWith).toBe(3);
  });
});

describe('incomeAtRisk per setback', () => {
  const r = incomeAtRisk(ctx, A, enableAll());
  it('keeps input order and echoes enabled', () => {
    expect(r.setbacks.map((s) => s.code)).toEqual(DEFAULT_SETBACKS.map((s) => s.code));
    const off = incomeAtRisk(ctx, A, DEFAULT_SETBACKS);
    expect(off.setbacks.map((s) => s.enabled)).toEqual(DEFAULT_SETBACKS.map((s) => s.enabled));
  });
  it('unexpected expense is one month of costs both ways when no amount is set', () => {
    const s = pick('unexpected_expense')(r.setbacks);
    expect(s.cashAfterWith).toBe(1_290_000);
    expect(s.cashAfterWithout).toBe(1_590_000);
    expect(s.paymentsMet).toBe(true);
    expect(s.breaksBecauseOfPurchase).toBe(false);
  });
  it('income drop 100% for 3 months breaks because of the purchase', () => {
    const list: SetbackInput[] = [{ code: 'income_drop', enabled: true, percentDrop: 100, months: 3 }];
    const s = incomeAtRisk(ctx, A, list).setbacks[0]!;
    expect(s.cashAfterWith).toBe(-100_000);
    expect(s.cashAfterWithout).toBe(200_000);
    expect(s.paymentsMet).toBe(false);
    expect(s.breaksBecauseOfPurchase).toBe(true);
    expect(s.runwayWith).toBe(0);
    expect(s.runwayWithout).toBe(0);
    expect(s.runwayLost).toBe(0);
  });
  it('job loss: each side uses its own burn; already broken without the purchase', () => {
    const list: SetbackInput[] = [{ code: 'job_loss', enabled: true, months: 8 }];
    const s = incomeAtRisk(ctx, A, list).setbacks[0]!;
    expect(s.cashAfterWith).toBe(1_700_000 - 8 * A.burn);
    expect(s.cashAfterWithout).toBe(2_000_000 - 3_280_000);
    expect(s.paymentsMet).toBe(false);
    expect(s.breaksBecauseOfPurchase).toBe(false);
  });
  it('late invoice 30 days takes 600_000 both ways', () => {
    const list: SetbackInput[] = [{ code: 'late_invoice', enabled: true, daysLate: 30 }];
    const s = incomeAtRisk(ctx, A, list).setbacks[0]!;
    expect(s.cashAfterWith).toBe(1_100_000);
    expect(s.cashAfterWithout).toBe(1_400_000);
  });
  it('null runways when a burn is 0 or below', () => {
    const list: SetbackInput[] = [{ code: 'late_invoice', enabled: true, daysLate: 30 }];
    const s = incomeAtRisk(ctx, { ...A, burn: mu(0) }, list).setbacks[0]!;
    expect(s.runwayWith).toBeNull();
    expect(s.runwayLost).toBeNull();
  });
});

describe('incomeAtRisk starts from cash after bills (D-24, D-54)', () => {
  const PB = BL({ incomeSeries: [PAY], bills: [YEARLY_DUE] });
  const a = assessOf(PB, loanCheck());
  it('deducts the bill on both sides even with a cash path', () => {
    expect(a.context.cashAvailable).toBe(2_000_000);
    expect(a.cashAfter).toBe(1_700_000);
    expect(a.context.cashAfterBills).toBe(1_880_000);
    expect(a.cashAfterBillsAndPurchase).toBe(1_580_000);
    const s = incomeAtRisk(a.context, a, DEFAULT_SETBACKS).setbacks[0]!;
    expect(s.code).toBe('unexpected_expense');
    expect(a.context.monthCosts).toBe(420_000);
    expect(s.cashAfterWithout).toBe(1_460_000);
    expect(s.cashAfterWith).toBe(1_160_000);
  });
});

describe('incomeAtRisk takes the same setbacks as applySetbacks (D-62)', () => {
  const edited: readonly SetbackInput[] = [
    { code: 'unexpected_expense', enabled: true, amount: mu(250_000) },
    { code: 'income_drop', enabled: true, percentDrop: 50, months: 2 },
    { code: 'job_loss', enabled: false, months: 3 },
    { code: 'late_invoice', enabled: true, daysLate: 45 },
  ];
  it.each([
    ['DEFAULT_SETBACKS', DEFAULT_SETBACKS],
    ['an edited list', edited],
  ])('reproduces applySetbacks for %s', (_name, list) => {
    const risk = incomeAtRisk(ctx, A, list);
    const applied = applySetbacks(A, list);
    expect(risk.setbacks.map((s) => [s.code, s.enabled])).toEqual(applied.results.map((x) => [x.code, x.enabled]));
    risk.setbacks.forEach((s, i) => {
      expect(s.cashAfterWith).toBe(applied.results[i]!.cashAfter);
      expect(s.runwayWith).toBe(applied.runwayMonths);
    });
  });
  it('an invalid setback fails the same way in both', () => {
    const bad: readonly SetbackInput[] = [{ code: 'income_drop', enabled: true, percentDrop: 101, months: 1 }];
    expect(() => incomeAtRisk(ctx, A, bad)).toThrow(/^setbackHit: /);
    expect(() => applySetbacks(A, bad)).toThrow(/^setbackHit: /);
  });
});

describe('incomeAtRisk properties', () => {
  it('the purchase never helps when monthly costs are non-negative', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 3_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 400_000 }),
        (price, deposit, extra) => {
          const check = buyCash(price, {
            runningCostsNet: mu(extra),
            payment: { method: 'loan', deposit: mu(Math.min(deposit, price)), termMonths: 24, apr: percent('8') },
          });
          const a = assessOf(BL(), check);
          const r = incomeAtRisk(a.context, a, enableAll());
          if (r.runwayWith !== null && r.runwayWithout !== null) {
            expect(r.runwayWith).toBeLessThanOrEqual(r.runwayWithout);
          }
          for (const s of r.setbacks) {
            expect(s.cashAfterWith).toBeLessThanOrEqual(s.cashAfterWithout);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
