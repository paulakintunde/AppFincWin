/**
 * D-107: the 'month' basis. prepareContext asks deriveMoney for the worst basis, then overlays the current month as it is
 * expected to end (expectedMonthMoney). Only income and spending are replaced; the history figures stay.
 */
import fc from 'fast-check';
import { minorUnits } from '../../money/types';
import { percent } from '../../payoff/types';
import { assess, prepareContext } from '../assess';
import { cashPathForSnapshot } from '../cashPath';
import { expectedMonth } from '../expectedMonth';
import { deriveMoney } from '../money';
import type { AssessContext, BuyCheck, DebtRecord, DecideSnapshot, RecordLine } from '../types';
import { USD, bill, fullMonth, income, line, snapshotOf } from './helpers/fixtures';

const mu = minorUnits;

const HISTORY = [
  fullMonth('2026-04', 600_000, 300_000),
  fullMonth('2026-05', 520_000, 340_000),
  fullMonth('2026-06', 640_000, 310_000),
];

/** July as of the 10th: 450_000 in, 380_000 out so far, plus whatever lines are given. */
function july(over: Partial<DecideSnapshot> = {}, extra: readonly RecordLine[] = []): DecideSnapshot {
  return snapshotOf({
    asOf: '2026-07-10',
    months: [
      ...HISTORY,
      {
        month: '2026-07',
        full: false,
        lines: [
          line({ id: 'j-in', date: '2026-07-03', direction: 'in', amount: 450_000 }),
          line({ id: 'j-out', date: '2026-07-04', direction: 'out', amount: 380_000 }),
          ...extra,
        ],
      },
    ],
    ...over,
  });
}

function ctxOf(s: DecideSnapshot): AssessContext {
  const r = prepareContext(s);
  if (!r.ok) throw new Error(`context did not resolve: ${r.reasons.join(',')}`);
  return r.context;
}

const DEBT: DebtRecord = { id: 'd', balance: mu(900_000), minimumPayment: mu(30_000), secured: false, apr: percent('18'), currency: USD };
const QUARTERLY = bill({ seriesId: 'q', freq: 'quarterly', anchorDate: '2026-01-15', latestAmount: 30_000 });

describe('D-107 the month basis', () => {
  it('D-107 basis month takes income and spending from the expected month', () => {
    const c = ctxOf(july({ basisOverride: 'month' }));
    expect(c.money.basis).toBe('month');
    expect(c.money.incomeBasis).toBe(450_000);
    expect(c.money.spendingBasis).toBe(380_000);
    expect(c.mySpendingBasis).toBe(380_000);
  });

  it('D-107 leftBefore on the month basis equals expectedMonth(context).result', () => {
    const c = ctxOf(july({ basisOverride: 'month', debts: [DEBT], monthlySaving: mu(10_000), monthlyInvesting: mu(5_000) }));
    expect(c.leftBefore).toBe(450_000 - 380_000 - 30_000 - 15_000);
    expect(c.leftBefore).toBe(expectedMonth(c).result);
    expect(c.leftThisMonth).toBe(c.leftBefore);
  });

  it('D-107 the history figures are unchanged on the month basis', () => {
    const m = ctxOf(july({ basisOverride: 'month', bills: [QUARTERLY] }));
    const w = ctxOf(july({ basisOverride: 'worst', bills: [QUARTERLY] }));
    const keep = ['incomeAverage', 'incomeWorst', 'incomeBest', 'spendingAverage', 'spendingWorst', 'steadiness', 'fullMonthsUsed', 'smoothedBillsMonthly'] as const;
    for (const k of keep) expect(m.money[k]).toEqual(w.money[k]);
    expect(m.limits.reserve).toBe(w.limits.reserve);
    expect(m.monthCosts).toBe(w.monthCosts);
    expect(m.annualIncome).toBe(w.annualIncome);
  });

  it('D-107 average and worst are byte for byte as before', () => {
    for (const basis of ['average', 'worst'] as const) {
      const s = july({ basisOverride: basis, bills: [bill({ seriesId: 'r', freq: 'monthly', anchorDate: '2026-01-01', latestAmount: 100_000 })] });
      const c = ctxOf(s);
      const direct = deriveMoney({
        currency: s.currency,
        months: s.months,
        bills: s.bills,
        incomeSeries: s.incomeSeries,
        basisOverride: basis,
        spendingShare: c.spendingShare,
      });
      expect(direct.ok).toBe(true);
      if (direct.ok) expect(c.money).toEqual(direct.money);
      expect(c.money.basis).toBe(basis);
    }
  });

  it('D-107 a snapshot with no full month is still no_full_month on the month basis', () => {
    const r = prepareContext(
      snapshotOf({ basisOverride: 'month', months: [{ month: '2026-07', full: false, lines: [] }], asOf: '2026-07-10' })
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons).toContain('no_full_month');
  });

  it('D-107 the month basis changes the verdict only through the money', () => {
    const base = { debts: [DEBT], cashOnHand: mu(1_500_000), monthlySaving: mu(10_000) };
    const [a, w, avg] = (['month', 'worst', 'average'] as const).map((b) => ctxOf(july({ ...base, basisOverride: b })));
    for (const other of [w!, avg!]) {
      expect(a!.snapshot.debts).toEqual(other.snapshot.debts);
      expect(a!.debtPayments).toBe(other.debtPayments);
      expect(a!.setAside).toBe(other.setAside);
      expect(a!.pausable).toBe(other.pausable);
      expect(a!.limits.dsrLine).toBe(other.limits.dsrLine);
      expect(a!.leftBefore).not.toBe(other.leftBefore);
      expect(a!.money.incomeBasis).not.toBe(other.money.incomeBasis);
    }
  });

  it("D-107 the debt-service ratio uses the expected month's income", () => {
    const check: BuyCheck = { kind: 'buy', currency: USD, price: mu(10_000), dayFees: mu(0), itemType: 'general', runningCostsNet: mu(0), payment: { method: 'cash' } };
    const m = assess(july({ basisOverride: 'month', debts: [DEBT] }), check);
    const w = assess(july({ basisOverride: 'worst', debts: [DEBT] }), check);
    if (m.state === 'missing' || w.state === 'missing') throw new Error('resolved');
    expect(m.context.debtPayments).toBe(30_000);
    expect(m.context.money.incomeBasis).toBe(450_000);
    expect(w.context.money.incomeBasis).toBe(520_000);
    // 30_000 / 450_000 against 30_000 / 520_000
    expect(m.debtServiceRatioAfter).not.toBe(w.debtServiceRatioAfter);
    expect(Number(m.debtServiceRatioAfter)).toBeGreaterThan(Number(w.debtServiceRatioAfter));
  });

  it('D-107 the month table adds up on the month basis', () => {
    const check: BuyCheck = { kind: 'buy', currency: USD, price: mu(50_000), dayFees: mu(0), itemType: 'general', runningCostsNet: mu(0), payment: { method: 'cash' } };
    const v = assess(july({ basisOverride: 'month', debts: [DEBT] }), check);
    if (v.state === 'missing') throw new Error('resolved');
    const { now } = v.monthTable;
    expect(now.income).toBe(450_000);
    expect(now.left).toBe(now.income - now.living - now.debtPayments - now.savingInvesting - now.setAside - now.thisPurchase);
    expect(now.left).toBe(v.context.leftBefore);
  });

  it('D-107 the cash path uses the month basis spending as its undated burn and still reconciles', () => {
    const pay = income({ seriesId: 'pay', freq: 'monthly', anchorDate: '2026-01-05', latestAmount: 450_000 });
    const s = july({ basisOverride: 'month', incomeSeries: [pay], debts: [DEBT] });
    const c = ctxOf(s);
    const path = cashPathForSnapshot({
      snapshot: s,
      money: c.money,
      spendingShare: c.spendingShare,
      debtPayments: c.debtPayments,
      protectedCash: c.protectedCash,
    });
    expect(path).not.toBeNull();
    expect(c.cashPath).toEqual(path);
    // the worst basis spends more a month, so the same path ends lower
    const worse = ctxOf(july({ basisOverride: 'worst', incomeSeries: [pay], debts: [DEBT] }));
    expect(worse.money.spendingBasis).toBe(340_000);
    expect(worse.cashPath).not.toBeNull();
    expect(worse.cashPath).not.toEqual(path);
  });

  it('D-107 a month with no income yet still resolves', () => {
    const s = snapshotOf({
      asOf: '2026-07-02',
      basisOverride: 'month',
      debts: [DEBT],
      months: [...HISTORY, { month: '2026-07', full: false, lines: [line({ id: 'x', date: '2026-07-01', direction: 'out', amount: 20_000 })] }],
    });
    const c = ctxOf(s);
    expect(c.money.incomeBasis).toBe(0);
    expect(c.leftBefore).toBe(-20_000 - 30_000);
  });

  it('D-107 on the month basis leftBefore = income - spending - debts - saving - setAside for random current-month lines', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.constantFrom('in', 'out'), fc.integer({ min: 0, max: 200_000 }), fc.integer({ min: 1, max: 9 })), { maxLength: 8 }),
        fc.integer({ min: 0, max: 50_000 }),
        fc.integer({ min: 0, max: 50_000 }),
        (rows, saving, investing) => {
          const lines = rows.map(([dir, amount, day], i) =>
            line({ id: `p${i}`, date: `2026-07-0${day}`, direction: dir as 'in' | 'out', amount })
          );
          const s = snapshotOf({
            asOf: '2026-07-10',
            basisOverride: 'month',
            debts: [DEBT],
            monthlySaving: mu(saving),
            monthlyInvesting: mu(investing),
            months: [...HISTORY, { month: '2026-07', full: false, lines }],
          });
          const c = ctxOf(s);
          expect(c.leftBefore).toBe(c.money.incomeBasis - c.money.spendingBasis - 30_000 - saving - investing - c.setAside);
          expect(c.leftBefore).toBe(expectedMonth(c).result);
        }
      )
    );
  });
});
