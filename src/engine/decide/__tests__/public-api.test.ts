/**
 * The public barrel (DEC-12) and the in-suite mirror of dependency-cruiser: Phase 5 imports everything from
 * `engine/decide`, the verdict path never reaches the name-sniffing helpers or Record's suggestion code (D-14, D-25),
 * and no engine file imports anything impure.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as payoff from '../../payoff';
import * as decide from '../index';
import type { CurrencyCode, MinorUnits } from '../index';
import { USD, bill, buyCash, income, monthsOf, outflow, snapshotOf } from './helpers/fixtures';

const m = (n: number): MinorUnits => n as MinorUnits;
const CUR: CurrencyCode = USD;

const ENTRY_POINTS = [
  'assess',
  'prepareContext',
  'buildOptions',
  'buildAlternatives',
  'applySetbacks',
  'affordablePrice',
  'firstRead',
  'monthlyEquivalent',
  'nextDueDate',
  'billsDueWithin',
  'resolveSpendingShare',
  'resolvePlan',
  'withPrice',
  'memberParts',
  'setbackHitFor',
  'runwayMonthsOf',
  'suggestItemType',
  'suggestSecured',
  'minimumTermsFromDefaults',
  'cashPathForSnapshot',
  'purchaseFlows',
  'classifyCashDip',
  'dipShortfall',
  'cashPathMargin',
  'spreadUndatedSpending',
] as const;

describe('public barrel: entry points', () => {
  it.each(ENTRY_POINTS)('exports %s as a function', (name) => {
    expect(typeof (decide as Record<string, unknown>)[name]).toBe('function');
  });

  it('exports the constant data', () => {
    expect(typeof decide.MARKET_DEFAULTS).toBe('object');
    expect(typeof decide.DEFAULT_SETBACKS).toBe('object');
    expect(typeof decide.RUNNING_COST_PROMPTS).toBe('object');
  });

  it('exports the Phase 5 check-input, wait and size entry points', () => {
    expect(typeof decide.buildWaitPlan).toBe('function');
    expect(typeof decide.resolvePriceInputs).toBe('function');
    expect(typeof decide.salesTaxAmount).toBe('function');
    expect(typeof decide.netRunningCosts).toBe('function');
    expect(typeof decide.purchaseSize).toBe('function');
  });

  it('exports the D-41..D-57 expansion entry points', () => {
    expect(typeof decide.decide).toBe('function');
    expect(typeof decide.positionContext).toBe('function');
    expect(typeof decide.stressTest).toBe('function');
    expect(typeof decide.paybackMonths).toBe('function');
    expect(typeof decide.investmentViews).toBe('function');
    expect(typeof decide.incomeAtRisk).toBe('function');
    expect(typeof decide.runningCostPrompts).toBe('function');
    expect(typeof decide.estimateBias).toBe('function');
    expect(typeof decide.confidenceOf).toBe('function');
    expect(typeof decide.lineMargins).toBe('function');
    expect(typeof decide.rateScheduleFor).toBe('function');
    expect(typeof decide.resolveProjectionRates).toBe('function');
    expect(typeof decide.defaultReserve).toBe('function');
    expect(typeof decide.worstFutureMonth).toBe('function');
    expect(typeof decide.isNonCashCategory).toBe('function');
    expect(typeof decide.cashTightFact).toBe('function');
    expect(typeof decide.isSmoothedPayFreq).toBe('function');
  });

  it('exports the D-61 and D-63 entry points and the payoff projections', () => {
    expect(typeof decide.lossOfValueMonthly).toBe('function');
    expect(typeof payoff.futureValueNet).toBe('function');
    expect(typeof decide.scheduledOutflowsDue).toBe('function');
    expect(typeof payoff.amortiseSchedule).toBe('function');
    expect(typeof payoff.simulateMinimumSchedule).toBe('function');
    expect(typeof payoff.futureValuePath).toBe('function');
  });
});

const LOAN = buyCash(1_450_000, {
  payment: { method: 'loan', deposit: m(300_000), termMonths: 48, apr: decide.percent('9.4') },
});

function resolved(v: decide.Verdict): decide.Assessment {
  if (v.state === 'missing') throw new Error('expected a resolved verdict');
  return v;
}

const PAY = income({
  seriesId: 'pay',
  freq: 'monthly',
  anchorDate: '2026-01-25',
  lastPaidDate: '2026-06-25',
  latestAmount: 600_000,
});

describe('public barrel: end to end', () => {
  const snap = snapshotOf({
    currency: CUR,
    months: monthsOf([
      [600_000, 300_000],
      [600_000, 300_000],
      [600_000, 300_000],
      [600_000, 300_000],
    ]),
  });

  it('assess, options, alternatives, setbacks and wait run on a plain snapshot', () => {
    const v = resolved(decide.assess(snap, LOAN));
    expect(v.monthTable.after.left).toBe(v.left);
    expect(v.ledgers).toHaveLength(5);
    const ctx = v.context;
    expect(Array.isArray(decide.buildOptions(ctx, LOAN, v))).toBe(true);
    expect(decide.buildAlternatives(ctx, LOAN, v).rows).toHaveLength(4);
    const report = decide.applySetbacks(v, decide.DEFAULT_SETBACKS);
    expect(report.runwayMonths === null || typeof report.runwayMonths === 'number').toBe(true);
    expect(decide.buildWaitPlan(ctx, LOAN, null).target).toBeGreaterThanOrEqual(0);
    const fr = decide.firstRead(
      { currency: CUR, cash: m(2_000_000), monthlyIncome: m(600_000), monthlySpending: m(300_000) },
      LOAN
    );
    expect(fr.state).toBeDefined();
  });

  it('quick-check path (05 D-23): tax and fees feed a 12 month zero-rate loan', () => {
    const tax = decide.salesTaxAmount(m(100_000), decide.percent('8'));
    const price = decide.resolvePriceInputs({
      advertised: m(100_000),
      adjustments: [
        { id: 'tax', amount: tax, effect: 'adds', onDay: false, counted: true },
        { id: 'fee', amount: m(2_000), effect: 'adds', onDay: true, counted: true },
      ],
    });
    const check = buyCash(price.price, {
      dayFees: price.dayFees,
      payment: { method: 'loan', deposit: m(0), termMonths: 12, apr: decide.ZERO_PERCENT },
    });
    const v = resolved(decide.assess(snap, check));
    expect(v.size).toBeDefined();
    expect(v.plan.months).toBe(12);
    const fr = decide.firstRead(
      { currency: CUR, cash: m(2_000_000), monthlyIncome: m(600_000), monthlySpending: m(300_000) },
      check
    );
    expect(fr.state).not.toBe('missing');
  });

  it('decide returns the combined verdict equal to assess, with the D-41..D-53 report', () => {
    const s = snapshotOf({
      currency: CUR,
      incomeSeries: [PAY],
      projectionRates: [decide.percent('5')],
      futureChanges: [
        { id: 'fc1', kind: 'spending', monthlyAmount: m(10_000), startMonth: '2026-09', endMonth: null, currency: CUR },
      ],
    });
    const others = [{ check: buyCash(50_000), purchaseRule: null }];
    const d = decide.decide(s, LOAN, others);
    expect(d.verdict).toEqual(decide.assess(s, LOAN, others));
    expect(d.standalone).not.toBeNull();
    expect(d.worstMonth).not.toBeNull();
    expect(d.margins.length).toBeGreaterThan(0);
    const a = resolved(d.verdict);
    expect(a.cashPath.status).toBe('available');

    const views = decide.investmentViews(a.context, LOAN, a, { horizonMonths: null, holdingFee: null });
    expect(views.rates.map((r) => r.rate)).toEqual([decide.ZERO_PERCENT, decide.percent('5')]);
    const fee = decide.investmentViews(a.context, LOAN, a, { horizonMonths: null, holdingFee: decide.percent('1') });
    expect(fee.holdingFee).toBe(decide.percent('1'));
    expect(fee.netRates).toHaveLength(2);
    expect(decide.incomeAtRisk(a.context, a, decide.DEFAULT_SETBACKS).setbacks).toHaveLength(4);
  });

  it('D-61 / D-62: a scheduled outflow lowers cash after bills and leaves cash available and ledger cash alone', () => {
    const base = snapshotOf({
      currency: CUR,
      incomeSeries: [PAY],
      bills: [
        bill({
          seriesId: 's_ins',
          freq: 'yearly',
          anchorDate: '2025-09-01',
          lastPaidDate: '2025-09-01',
          latestAmount: 1,
        }),
      ],
    });
    const withOutflow = {
      ...base,
      scheduledOutflows: [outflow({ id: 'o_pending', date: '2026-07-30', amount: 50_000 })],
    };
    const a0 = resolved(decide.assess(base, buyCash(100_000)));
    const a1 = resolved(decide.assess(withOutflow, buyCash(100_000)));
    expect(a1.context.outflowsDueAhead).toBe(50_000);
    expect(a1.context.cashAfterBills).toBe(a0.context.cashAfterBills - 50_000);
    expect(a1.context.cashAvailable).toBe(a0.context.cashAvailable);
    expect(a1.context.ledgerCash).toBe(a0.context.ledgerCash);
    expect(a1.ledgerCashAfterPurchase).toBe(a1.context.ledgerCash - a1.mineDayOne);
  });
});

const SRC_DIR = path.join(__dirname, '..');
const VERDICT_PATH_FILES = [
  'plan.ts',
  'checkInputs.ts',
  'assess.ts',
  'options.ts',
  'alternatives.ts',
  'setbacks.ts',
  'wait.ts',
  'firstRead.ts',
  'bisect.ts',
  'money.ts',
  'series.ts',
  'currency.ts',
  'projectionRates.ts',
  'reserve.ts',
  'confidence.ts',
  'margins.ts',
  'futureChanges.ts',
  'runningCostPrompts.ts',
  'estimateBias.ts',
  'cashPath.ts',
  'position.ts',
  'stress.ts',
  'payback.ts',
  'decision.ts',
  'investmentViews.ts',
  'incomeAtRisk.ts',
];

// Comments may name the helpers they avoid; only code can reach them.
const stripComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('verdict-path isolation (D-14, DEC-11, D-25)', () => {
  it.each(VERDICT_PATH_FILES)('%s does not reach name sniffing, the market table or Record detection', (f) => {
    const text = stripComments(fs.readFileSync(path.join(SRC_DIR, f), 'utf8'));
    for (const banned of [
      'suggestItemType',
      'suggestSecured',
      'marketDefaults',
      'recurring/detect',
      'detectRecurring',
    ]) {
      expect(text).not.toContain(banned);
    }
    expect(text).not.toMatch(/from '\.\.\/recurring'/);
  });

  it('the pre-fill helpers stay exported for the import step', () => {
    // suggestItemType and detectRecurring stay out of the verdict path; only recurring/schedule may be imported
    expect(typeof decide.suggestItemType).toBe('function');
    expect(VERDICT_PATH_FILES).toContain('assess.ts');
  });
});

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('purity (DEC-12)', () => {
  const engineRoot = path.join(__dirname, '..', '..');
  const files = [...sourceFiles(path.join(engineRoot, 'decide')), ...sourceFiles(path.join(engineRoot, 'payoff'))];

  it('finds the engine sources', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it.each(files.map((f) => [path.relative(engineRoot, f), f] as const))('%s imports nothing impure', (_name, f) => {
    const text = fs.readFileSync(f, 'utf8');
    for (const banned of [
      "from 'react",
      "from 'expo",
      "from '@supabase",
      'fetch(',
      'AsyncStorage',
      '../../db',
      '../../state',
      '../../services',
      '../../ui',
    ]) {
      expect(text).not.toContain(banned);
    }
  });
});
