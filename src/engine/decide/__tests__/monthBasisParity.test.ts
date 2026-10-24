/**
 * D-107 parity: the 'month' basis is a first-class basis. When this month's expected income and spending equal the worst
 * history month's, everything downstream of the money basis must agree with 'worst', except the fields that name the basis.
 */
import { minorUnits } from '../../money/types';
import { percent } from '../../payoff/types';
import { DEFAULT_SETBACKS } from '../constants';
import { assess, prepareContext } from '../assess';
import { buildAlternatives } from '../alternatives';
import { cashPathForSnapshot } from '../cashPath';
import { confidenceOf } from '../confidence';
import { decide, lineMargins } from '../decision';
import { incomeAtRisk } from '../incomeAtRisk';
import { buildOptions } from '../options';
import { positionContext } from '../position';
import { applySetbacks } from '../setbacks';
import { stressTest } from '../stress';
import { buildWaitPlan } from '../wait';
import type {
  AssessContext,
  Assessment,
  BuyCheck,
  Basis,
  DebtRecord,
  DecideSnapshot,
  InvestCheck,
  PurchaseCheck,
  SetbackInput,
  StackedCheckInput,
} from '../types';
import { USD, bill, buyCash, fullMonth, income, line, snapshotOf } from './helpers/fixtures';

const mu = minorUnits;

const DEBT: DebtRecord = { id: 'd', balance: mu(900_000), minimumPayment: mu(30_000), secured: false, apr: percent('18'), currency: USD };
const RENT = bill({ seriesId: 'rent', freq: 'monthly', anchorDate: '2026-01-01', latestAmount: 100_000 });
const PAY = income({ seriesId: 'pay', freq: 'monthly', anchorDate: '2026-01-05', latestAmount: 500_000 });

/**
 * History: worst income 500_000, worst spending 350_000. July so far: the pay (500_000), the rent (100_000) and 250_000
 * of other spending, nothing still due, so the expected month equals the worst month.
 */
function world(over: Partial<DecideSnapshot> = {}, julySpending = 250_000, julyIncome = 500_000): DecideSnapshot {
  return snapshotOf({
    asOf: '2026-07-10',
    bills: [RENT],
    incomeSeries: [PAY],
    debts: [DEBT],
    monthlySaving: mu(10_000),
    monthlyInvesting: mu(5_000),
    housingMonthly: mu(100_000),
    cashOnHand: mu(1_200_000),
    months: [
      fullMonth('2026-04', 600_000, 300_000),
      fullMonth('2026-05', 500_000, 350_000),
      fullMonth('2026-06', 650_000, 320_000),
      {
        month: '2026-07',
        full: false,
        lines: [
          line({ id: 'j-pay', date: '2026-07-05', direction: 'in', amount: julyIncome, seriesId: 'pay' }),
          line({ id: 'j-rent', date: '2026-07-01', direction: 'out', amount: 100_000, seriesId: 'rent' }),
          line({ id: 'j-out', date: '2026-07-04', direction: 'out', amount: julySpending }),
        ],
      },
    ],
    expenseLines: [
      { lineId: 'food', averageMonthly: mu(80_000), cuttable: true },
      { lineId: 'fun', averageMonthly: mu(40_000), cuttable: true },
    ],
    ...over,
  });
}

const withBasis = (s: DecideSnapshot, basis: Basis): DecideSnapshot => ({ ...s, basisOverride: basis });

/** Everything but the name of the basis: `basis` fields and the snapshot's override are blanked. */
function norm(v: unknown): unknown {
  if (typeof v === 'bigint') return v;
  if (Array.isArray(v)) return v.map(norm);
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      if (k === 'basisOverride') continue;
      out[k] = k === 'basis' && (x === 'month' || x === 'worst') ? 'BASIS' : norm(x);
    }
    return out;
  }
  return v;
}

const ON: readonly SetbackInput[] = DEFAULT_SETBACKS.map((s) => ({ ...s, enabled: true }));

const LOAN: BuyCheck = buyCash(800_000, { payment: { method: 'loan', deposit: mu(100_000), termMonths: 36, apr: percent('9'), variable: true } });
const INSTALMENT: BuyCheck = buyCash(120_000, { payment: { method: 'instalment', instalmentAmount: mu(10_000), instalmentCount: 12 } });
const CARD: BuyCheck = buyCash(150_000, {
  payment: {
    method: 'card',
    card: { id: 'c1', apr: percent('21'), minimumTerms: { floor: mu(2_500), minimumPercent: percent('1'), interestAdded: true }, currency: USD },
    payoff: { kind: 'months', months: 6 },
    dealerCap: null,
  },
});
const INVEST_LUMP: InvestCheck = { kind: 'invest', currency: USD, amount: mu(300_000), payment: { method: 'lump' } };
const INVEST_MONTHLY: InvestCheck = { kind: 'invest', currency: USD, amount: mu(20_000), payment: { method: 'monthly', termMonths: 24 } };
const PROPERTY: BuyCheck = buyCash(2_000_000, {
  itemType: 'property',
  runningCostsNet: mu(70_000),
  payment: { method: 'loan', deposit: mu(400_000), termMonths: 240, apr: percent('6'), variable: false },
});
const CASH_BUY: BuyCheck = buyCash(900_000);
const WITH_INCOME: BuyCheck = buyCash(300_000, {
  incomeChange: { monthlyAmount: mu(-40_000), startDate: '2026-09-01', likelihood: 'likely' },
});

const CHECKS: readonly (readonly [string, PurchaseCheck])[] = [
  ['cash buy', CASH_BUY],
  ['loan', LOAN],
  ['instalment', INSTALMENT],
  ['card', CARD],
  ['invest lump', INVEST_LUMP],
  ['invest monthly', INVEST_MONTHLY],
  ['property with a housing line', PROPERTY],
  ['typed income change', WITH_INCOME],
];

const OTHERS: readonly StackedCheckInput[] = [
  { check: buyCash(200_000), purchaseRule: null },
  { check: INSTALMENT, purchaseRule: null },
];

function contextOf(s: DecideSnapshot): AssessContext {
  const r = prepareContext(s);
  if (!r.ok) throw new Error(`context did not resolve: ${r.reasons.join(',')}`);
  return r.context;
}

/** Every output built on the money basis, for one snapshot and check. */
function everything(s: DecideSnapshot, check: PurchaseCheck, others: readonly StackedCheckInput[]) {
  const ctx = contextOf(s);
  const verdict = assess(s, check, others);
  const decision = decide(s, check, others);
  const position = positionContext(ctx, check, others);
  const a: Assessment | null = verdict.state === 'missing' ? null : verdict;
  return {
    ctx,
    verdict,
    decision,
    position,
    margins: a ? lineMargins(a, check) : null,
    options: a ? buildOptions(a.context, check, a) : null,
    alternatives: a ? buildAlternatives(a.context, check, a) : null,
    cheaper: a ? buildAlternatives(a.context, check, a, { price: mu(Math.max(1, Math.floor((check.kind === 'buy' ? check.price : check.amount) / 2))) }) : null,
    wait: a ? buildWaitPlan(a.context, check, null) : null,
    waitFixed: a ? buildWaitPlan(a.context, check, mu(25_000)) : null,
    setbacks: a ? applySetbacks(a, ON) : null,
    atRisk: a ? incomeAtRisk(a.context, a, ON) : null,
    stress: a ? stressTest(a.context, check) : null,
    cashPath: cashPathForSnapshot({
      snapshot: s,
      money: ctx.money,
      spendingShare: ctx.spendingShare,
      debtPayments: ctx.debtPayments,
      protectedCash: ctx.protectedCash,
    }),
    confidence: confidenceOf({
      fullMonths: ctx.money.fullMonthsUsed,
      steadiness: ctx.money.steadiness,
      firstRead: false,
      provisionalRates: ctx.snapshot.provisionalRates,
    }),
  };
}

type Everything = ReturnType<typeof everything>;
const both = (s: DecideSnapshot, check: PurchaseCheck, others: readonly StackedCheckInput[] = []): { month: Everything; worst: Everything } => ({
  month: everything(withBasis(s, 'month'), check, others),
  worst: everything(withBasis(s, 'worst'), check, others),
});

describe('D-107 parity: month equals worst when the figures are the same', () => {
  it('D-107 parity: the worlds really are equal on the money', () => {
    const m = contextOf(withBasis(world(), 'month'));
    const w = contextOf(withBasis(world(), 'worst'));
    expect(m.money.incomeBasis).toBe(w.money.incomeBasis);
    expect(m.money.spendingBasis).toBe(w.money.spendingBasis);
    expect(m.leftBefore).toBe(w.leftBefore);
    expect(m.money.basis).toBe('month');
    expect(w.money.basis).toBe('worst');
  });

  it.each(CHECKS)('D-107 parity: the verdict state and figures equal worst (%s)', (_name, check) => {
    const { month, worst } = both(world(), check);
    expect(norm(month.ctx)).toEqual(norm(worst.ctx));
    expect(norm(month.verdict)).toEqual(norm(worst.verdict));
    expect(norm(month.decision)).toEqual(norm(worst.decision));
    expect(month.verdict.state).not.toBe('missing');
  });

  it('D-107 parity: the month warning and its shortfall equal worst', () => {
    // tight enough that the month warning fires on both
    const s = world({ debts: [{ ...DEBT, minimumPayment: mu(160_000) }] });
    const { month, worst } = both(s, CASH_BUY);
    if (month.verdict.state === 'missing' || worst.verdict.state === 'missing') throw new Error('resolved');
    const mw = month.verdict.warnings.find((x) => x.code === 'month');
    const ww = worst.verdict.warnings.find((x) => x.code === 'month');
    expect(mw).toBeDefined();
    expect(mw).toEqual(ww);
    expect(month.verdict.context.leftBefore).toBeLessThan(0);
  });

  it.each(CHECKS)('D-107 parity: line margins and the on-the-edge flag equal worst (%s)', (_name, check) => {
    const { month, worst } = both(world(), check);
    expect(norm(month.margins)).toEqual(norm(worst.margins));
  });

  it('D-107 parity: the cash path equals worst', () => {
    for (const [, check] of CHECKS) {
      const { month, worst } = both(world(), check);
      expect(month.cashPath).not.toBeNull();
      expect(month.cashPath).toEqual(worst.cashPath);
      expect(norm(month.verdict)).toEqual(norm(worst.verdict));
    }
  });

  it.each(CHECKS)('D-107 parity: options and alternatives equal worst (%s)', (_name, check) => {
    const { month, worst } = both(world(), check);
    expect(norm(month.options)).toEqual(norm(worst.options));
    expect(norm(month.alternatives)).toEqual(norm(worst.alternatives));
    expect(norm(month.cheaper)).toEqual(norm(worst.cheaper));
    expect(norm(month.wait)).toEqual(norm(worst.wait));
    expect(norm(month.waitFixed)).toEqual(norm(worst.waitFixed));
  });

  it('D-107 parity: options really exist for an adjust or no verdict', () => {
    const { month } = both(world({ cashOnHand: mu(400_000) }), CASH_BUY);
    expect(month.verdict.state === 'no' || month.verdict.state === 'adjust').toBe(true);
    expect((month.options ?? []).length).toBeGreaterThan(0);
  });

  it.each(CHECKS)('D-107 parity: stress, setbacks and income at risk equal worst (%s)', (_name, check) => {
    const { month, worst } = both(world(), check);
    expect(norm(month.stress)).toEqual(norm(worst.stress));
    expect(norm(month.setbacks)).toEqual(norm(worst.setbacks));
    expect(norm(month.atRisk)).toEqual(norm(worst.atRisk));
  });

  it.each(CHECKS)('D-107 parity: confidence and basis facts equal worst (%s)', (_name, check) => {
    const { month, worst } = both(world(), check);
    expect(month.confidence).toEqual(worst.confidence);
    if (month.verdict.state !== 'missing' && worst.verdict.state !== 'missing') {
      expect(month.verdict.confidence).toEqual(worst.verdict.confidence);
      expect(norm(month.verdict.facts)).toEqual(norm(worst.verdict.facts));
    }
  });

  it.each(CHECKS)('D-107 parity: stacked checks equal worst (%s)', (_name, check) => {
    const { month, worst } = both(world(), check, OTHERS);
    expect(norm(month.position)).toEqual(norm(worst.position));
    expect(norm(month.verdict)).toEqual(norm(worst.verdict));
    expect(norm(month.decision)).toEqual(norm(worst.decision));
  });

  it('D-107 parity: only the basis name differs', () => {
    const { month, worst } = both(world(), LOAN);
    if (month.verdict.state === 'missing' || worst.verdict.state === 'missing') throw new Error('resolved');
    expect(month.verdict.context.money.basis).toBe('month');
    expect(worst.verdict.context.money.basis).toBe('worst');
    for (const o of month.options ?? []) if ('basis' in o) expect(o.basis).toBe('month');
    for (const o of worst.options ?? []) if ('basis' in o) expect(o.basis).toBe('worst');
    // the unnormalised results differ (the name), the normalised ones do not
    expect(month.verdict).not.toEqual(worst.verdict);
    expect(norm(month.verdict)).toEqual(norm(worst.verdict));
  });
});

describe('D-107 month is not a copy of worst when the figures differ', () => {
  const warningOf = (v: ReturnType<typeof assess>, code: string) =>
    v.state === 'missing' ? undefined : v.warnings.find((w) => w.code === code);

  it('D-107 when this month is tighter than the worst month the month warning fires on month only', () => {
    // 450_000 out against the worst month's 350_000: month ends 100_000 lower than worst
    const s = world({ debts: [{ ...DEBT, minimumPayment: mu(60_000) }] }, 350_000);
    const m = assess(withBasis(s, 'month'), CASH_BUY);
    const w = assess(withBasis(s, 'worst'), CASH_BUY);
    expect(warningOf(m, 'month')).toBeDefined();
    expect(warningOf(w, 'month')).toBeUndefined();
  });

  it('D-107 when this month is looser than the worst month the month warning fires on worst only', () => {
    // 150_000 out against the worst month's 350_000
    const s = world({ debts: [{ ...DEBT, minimumPayment: mu(160_000) }] }, 50_000);
    const m = assess(withBasis(s, 'month'), CASH_BUY);
    const w = assess(withBasis(s, 'worst'), CASH_BUY);
    expect(warningOf(w, 'month')).toBeDefined();
    expect(warningOf(m, 'month')).toBeUndefined();
  });

  it('D-107 a different month gives a different set of figures for every check', () => {
    for (const [, check] of CHECKS) {
      const s = world({}, 300_000);
      const m = everything(withBasis(s, 'month'), check, []);
      const w = everything(withBasis(s, 'worst'), check, []);
      expect(norm(m.ctx)).not.toEqual(norm(w.ctx));
    }
  });
});
