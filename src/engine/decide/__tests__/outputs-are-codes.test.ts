/**
 * D-21 guard: every string the engine emits is a code (snake_case), a caller-supplied identifier or a date derived from
 * input dates. No English copy leaves engine/decide; Phase 5 maps codes to the i18n catalogue. Also a static scan that
 * keeps the advice vocabulary out of engine source (DCU-09 is enforced on copy in Phase 5).
 */
import * as fs from 'fs';
import * as path from 'path';
import { minorUnits } from '../../money/types';
import { ZERO_PERCENT, percent } from '../../payoff/types';
import {
  DEFAULT_SETBACKS,
  RUNNING_COST_PROMPTS,
  applySetbacks,
  assess,
  buildAlternatives,
  buildOptions,
  buildWaitPlan,
  decide,
  estimateBias,
  firstRead,
  incomeAtRisk,
  investmentViews,
  lossOfValueMonthly,
  netRunningCosts,
  prepareContext,
  type AssessContext,
  type Assessment,
  type BuyCheck,
  type DebtRecord,
  type DecideLimits,
  type DecideSnapshot,
  type InvestCheck,
  type PastDecision,
  type PurchaseCheck,
  type SetbackInput,
  type Verdict,
} from '../index';
import { USD, bill, buyCash, fullMonth, income, line, monthsOf, outflow, snapshotOf } from './helpers/fixtures';

const m = minorUnits;

// ── the walker ──
const CODE = /^[a-z][a-z0-9_]*$/;
const DATE = /^\d{4}-\d{2}(-\d{2})?$/;
// caller-supplied identifiers used by the fixtures below
const CALLER_IDS = new Set([
  'USD',
  'd1',
  'd2',
  'c1',
  'line_a',
  'line_b',
  's_ins',
  'pay',
  'fc1',
  'fc2',
  'o_past',
  'o_ahead',
  'o_pending',
  'dec1',
  'dec2',
  'dec3',
]);

interface Found {
  readonly path: string;
  readonly value: string;
}

function collectStrings(value: unknown, at: string, out: Found[] = []): Found[] {
  if (typeof value === 'string') {
    out.push({ path: at, value });
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => collectStrings(v, `${at}[${i}]`, out));
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      // context.snapshot is the caller's own input handed back (record line ids and so on), not an engine output
      if (k === 'snapshot') continue;
      collectStrings(v, `${at}.${k}`, out);
    }
  }
  return out;
}

const seen = new Set<string>();
function walk(label: string, value: unknown): void {
  const found = collectStrings(value, label);
  const bad = found.filter((f) => !(CODE.test(f.value) || DATE.test(f.value) || CALLER_IDS.has(f.value)));
  expect(bad).toEqual([]);
  for (const f of found) seen.add(f.value);
}

// ── fixtures ──
const D1: DebtRecord = {
  id: 'd1',
  balance: m(800_000),
  minimumPayment: m(20_000),
  secured: false,
  apr: percent('19.9'),
  currency: USD,
};
const D2: DebtRecord = {
  id: 'd2',
  balance: m(15_000_000),
  minimumPayment: m(90_000),
  secured: true,
  apr: percent('5.1'),
  currency: USD,
};
const LIMITS_BL: DecideLimits = {
  reserve: m(600_000),
  dsrLine: percent('36'),
  housingLine: null,
  unsecuredIncomeMultiple: 12,
  investingFloor: m(40_000),
  savingFloor: m(25_000),
  spareFloor: null,
};
const BL = (over: Partial<DecideSnapshot> = {}): DecideSnapshot =>
  snapshotOf({ debts: [D1, D2], monthlySaving: m(25_000), monthlyInvesting: m(40_000), limits: LIMITS_BL, ...over });
const B = (over: Partial<DecideSnapshot> = {}): DecideSnapshot =>
  snapshotOf({ debts: [D1, D2], monthlySaving: m(25_000), monthlyInvesting: m(40_000), ...over });
const PAY = income({
  seriesId: 'pay',
  freq: 'monthly',
  anchorDate: '2026-01-25',
  lastPaidDate: '2026-06-25',
  latestAmount: 600_000,
});
const PB = (over: Partial<DecideSnapshot> = {}): DecideSnapshot => BL({ incomeSeries: [PAY], ...over });
const YEARLY_DUE = bill({
  seriesId: 's_ins',
  freq: 'yearly',
  anchorDate: '2025-09-01',
  lastPaidDate: '2025-09-01',
  latestAmount: 120_000,
});
const BILL_BEFORE_PAY = bill({
  seriesId: 's_ins',
  freq: 'yearly',
  anchorDate: '2025-07-24',
  lastPaidDate: '2025-07-24',
  latestAmount: 120_000,
});
const BIG_LOAN: BuyCheck = buyCash(1_450_000, {
  payment: { method: 'loan', deposit: m(300_000), termMonths: 48, apr: percent('9.4') },
});
const investLump = (amount: number): InvestCheck => ({
  kind: 'invest',
  currency: USD,
  amount: m(amount),
  payment: { method: 'lump' },
});
const ALL_ON: readonly SetbackInput[] = DEFAULT_SETBACKS.map((s) => ({ ...s, enabled: true }));

function ctxOf(s: DecideSnapshot): AssessContext {
  const r = prepareContext(s);
  if (!r.ok) throw new Error('expected a resolved context');
  return r.context;
}
function run(s: DecideSnapshot, c: PurchaseCheck): Assessment {
  const v = assess(s, c);
  if (v.state === 'missing') throw new Error('expected a resolved verdict');
  return v;
}
function stateOf(v: Verdict): string {
  return v.state;
}

describe('D-21: engine outputs are codes, ids and dates', () => {
  it('walks fits, adjust, no and missing verdicts (D-35 pause warning, D-36 sizes)', () => {
    const fits = assess(BL(), buyCash(50_000));
    expect(stateOf(fits)).toBe('fits');
    walk('fits', fits);
    // 150_000 a month on a 125_000 month: pausing saving and investing closes it (D-35)
    const adjust = assess(
      BL(),
      buyCash(1_800_000, { payment: { method: 'instalment', instalmentAmount: m(150_000), instalmentCount: 12 } })
    );
    expect(stateOf(adjust)).toBe('adjust');
    expect(
      run(
        BL(),
        buyCash(1_800_000, { payment: { method: 'instalment', instalmentAmount: m(150_000), instalmentCount: 12 } })
      ).warnings.map((w) => w.code)
    ).toContain('inv');
    walk('adjust', adjust);
    const no = assess(
      BL({
        months: monthsOf([
          [1_000_000, 700_000],
          [1_000_000, 700_000],
          [1_000_000, 700_000],
        ]),
      }),
      buyCash(6_000_000, { payment: { method: 'loan', deposit: m(0), termMonths: 36, apr: percent('9.4') } })
    );
    expect(stateOf(no)).toBe('no');
    walk('no', no);
    walk('savings', assess(BL(), buyCash(1_300_000)));
    walk('spreading', assess(BL(), buyCash(1_400_001)));
    const missing = assess(
      BL(),
      buyCash(100_000, { payment: { method: 'loan', deposit: m(0), termMonths: null, apr: null } })
    );
    expect(stateOf(missing)).toBe('missing');
    walk('missing', missing);
    walk('missing_no_months', assess(BL({ months: [] }), buyCash(100_000)));
    walk(
      'missing_card',
      assess(
        BL(),
        buyCash(100_000, { payment: { method: 'card', card: null, payoff: { kind: 'full' }, dealerCap: null } })
      )
    );
  });

  it('walks an invest verdict with the D-31 debt-rate fact', () => {
    const v = run(B(), investLump(50_000));
    expect(v.facts.map((f) => f.code)).toContain('debt_rate_exceeds_return');
    walk('invest', v);
  });

  it('walks a verdict with a bill due (D-24 billsDueDetail with series ids and dates)', () => {
    const v = run(PB({ bills: [YEARLY_DUE] }), buyCash(1_300_000));
    expect(v.context.billsDueDetail.length).toBeGreaterThan(0);
    // the D-24 deduction is kept for spare-money figures even though the cash path carries the bill
    expect(v.cashAfterBillsAndPurchase).toBeLessThan(v.cashAfter);
    walk('bills_due_no_path', run(BL({ bills: [YEARLY_DUE] }), buyCash(1_300_000)));
    walk('bills_due', v);
    walk('bills_due_context', v.context.billsDueDetail);
  });

  it('walks the month table, ledgers, directions and the wait plan (D-38, D-40)', () => {
    const v = run(BL(), buyCash(150_000));
    walk('month_table', v.monthTable);
    walk('ledgers', v.ledgers);
    expect(v.ledgers.map((l) => l.code)).toEqual(['income', 'expenses', 'debt', 'cash', 'investments']);
    walk('wait', buildWaitPlan(v.context, buyCash(150_000), null));
    const wait = buildWaitPlan(v.context, buyCash(150_000), m(10_000));
    expect(wait.readyBy).toMatch(DATE);
    walk('wait_amount', wait);
    walk('wait_invest', buildWaitPlan(v.context, investLump(50_000), null));
  });

  it('walks buildOptions with every option code (D-13, D-51)', () => {
    const s = BL({
      months: monthsOf([
        [1_000_000, 700_000],
        [1_000_000, 700_000],
        [1_000_000, 700_000],
      ]),
      expenseLines: [
        { lineId: 'line_a', averageMonthly: m(100_000), cuttable: true },
        { lineId: 'line_b', averageMonthly: m(60_000), cuttable: true },
      ],
      projectionRates: [percent('5')],
    });
    // a 1_500_000 deposit leaves cash under the reserve (save_first); the loan itself leaves a gap (the other five)
    const check = buyCash(6_000_000, {
      payment: { method: 'loan', deposit: m(1_500_000), termMonths: 36, apr: percent('9.4') },
    });
    const a = run(s, check);
    const options = buildOptions(a.context, check, a);
    expect(options.map((o) => o.code)).toEqual(
      expect.arrayContaining(['affordable_price', 'longer_term', 'cut_line', 'earn_more', 'save_first', 'do_without'])
    );
    walk('options', options);
    const doWithout = options.find((o) => o.code === 'do_without');
    if (doWithout === undefined || doWithout.code !== 'do_without') throw new Error('expected do_without');
    expect(doWithout.byRate).toHaveLength(2);
    expect(doWithout.byRate[0]?.rate).toBe(ZERO_PERCENT);
    expect(buildOptions(a.context, buyCash(50_000), run(s, buyCash(50_000)))).toEqual([]);
  });

  it('walks buildAlternatives with suppression codes and a byRate per projection rate (D-51)', () => {
    const rates = { projectionRates: [percent('5')] };
    const tight = BL({
      ...rates,
      months: [1, 2, 3].map((i) => fullMonth(`2026-0${3 + i}`, 600_000, 445_000)),
    });
    const scenarios: [string, DecideSnapshot, PurchaseCheck][] = [
      ['full', BL(rates), buyCash(100_000)],
      ['month_short', tight, buyCash(100_000)],
      ['nothing_freed', BL({ ...rates, cashOnHand: m(600_000) }), buyCash(1_000_000)],
      [
        'too_thin',
        BL({
          ...rates,
          cashOnHand: m(600_000),
          months: monthsOf([
            [600_000, 424_000],
            [600_000, 424_000],
            [600_000, 424_000],
          ]),
          limits: { ...LIMITS_BL, spareFloor: m(2_500) },
        }),
        buyCash(1_000_000),
      ],
      [
        'past_horizon',
        BL({
          ...rates,
          months: monthsOf([
            [600_000, 420_000],
            [600_000, 420_000],
            [600_000, 420_000],
          ]),
        }),
        buyCash(1_700_000),
      ],
    ];
    const codes = new Set<string>();
    for (const [label, s, c] of scenarios) {
      const a = run(s, c);
      const alts = buildAlternatives(a.context, c, a);
      walk(`alts_${label}`, alts);
      for (const row of alts.rows) {
        if (row.suppression !== null) codes.add(row.suppression.code);
        if (row.byRate !== null) {
          expect(row.byRate).toHaveLength(2);
          expect(row.byRate[0]?.rate).toBe(ZERO_PERCENT);
        }
      }
    }
    expect(codes.size).toBeGreaterThanOrEqual(3);
  });

  it('walks applySetbacks with all four enabled, and incomeAtRisk (D-39, D-54)', () => {
    const a = run(BL(), buyCash(150_000));
    walk('setbacks', applySetbacks(a, ALL_ON));
    walk('setbacks_default', applySetbacks(a, DEFAULT_SETBACKS));
    walk('income_at_risk', incomeAtRisk(a.context, a, ALL_ON));
  });

  it('walks firstRead fits, adjust, no and missing', () => {
    const rough = { currency: USD, cash: m(2_000_000), monthlyIncome: m(600_000), monthlySpending: m(300_000) };
    const results = [
      firstRead(rough, buyCash(50_000)),
      firstRead(rough, buyCash(450_000)),
      firstRead(rough, buyCash(2_500_000)),
      firstRead(rough, buyCash(100_000, { payment: { method: 'loan', deposit: m(0), termMonths: null, apr: null } })),
    ];
    expect(results.map((r) => r.state).sort()).toEqual(expect.arrayContaining(['fits', 'missing', 'no']));
    results.forEach((r, i) => walk(`first_read_${i}`, r));
    walk('first_read_adjust', firstRead({ ...rough, cash: m(500_000) }, buyCash(450_000)));
  });

  it('walks a Decision with stacked checks, a future change, a variable loan and expected income (D-41..D-53)', () => {
    const gain = { monthlyAmount: m(400_000), startDate: '2026-08-01', likelihood: 'uncertain' as const };
    const s = BL({
      months: monthsOf([
        [1_000_000, 300_000],
        [1_000_000, 300_000],
        [1_000_000, 300_000],
      ]),
      incomeSeries: [PAY],
      futureChanges: [
        { id: 'fc1', kind: 'spending', monthlyAmount: m(10_000), startMonth: '2026-09', endMonth: null, currency: USD },
      ],
    });
    const check = buyCash(1_200_000, {
      incomeChange: gain,
      payment: { method: 'loan', deposit: m(0), termMonths: 36, apr: percent('9.4'), variable: true },
    });
    const missingOther = buyCash(100_000, {
      payment: { method: 'loan', deposit: m(0), termMonths: null, apr: null },
    });
    const d = decide(s, check, [
      { check: buyCash(100_000), purchaseRule: null },
      { check: missingOther, purchaseRule: null },
    ]);
    expect(d.stacked.map((x) => x.status)).toEqual(['applied', 'missing']);
    expect(d.withExpectedIncome).not.toBeNull();
    expect(d.stress).toHaveLength(2);
    walk('decision', d);
    walk('decision_plain', decide(BL(), buyCash(100_000)));
    walk('decision_missing', decide(BL({ months: [] }), buyCash(100_000)));
  });

  it('walks a cash_dip with its cash path, and an assessment with no pay series (cash_path_unavailable)', () => {
    const dip = run(PB({ bills: [BILL_BEFORE_PAY] }), buyCash(1_300_000));
    expect(dip.warnings.map((w) => w.code)).toContain('cash_dip');
    walk('cash_dip', dip);
    walk('cash_path', dip.cashPath);
    const none = run(BL(), buyCash(100_000));
    expect(none.basisCodes).toContain('cash_path_unavailable');
    walk('no_path', none);
  });

  it('walks the D-59 fact cash_tight_before_payday and its report date', () => {
    const tight = PB({ cashOnHand: m(150_000), limits: { ...LIMITS_BL, reserve: m(0) } });
    const a = run(tight, buyCash(100_000));
    expect(a.facts.map((f) => f.code)).toContain('cash_tight_before_payday');
    if (a.cashPath.status !== 'available') throw new Error('expected a cash path');
    expect(a.cashPath.tightBeforePayday?.date).toMatch(DATE);
    walk('tight_facts', a.facts);
    walk('tight_path', a.cashPath);
  });

  it('walks one-off basis codes, margins on the edge and a with-expected-income assessment', () => {
    const oneOff = BL({
      months: [
        fullMonth('2026-04', 600_000, 300_000, [
          line({ id: 'x1', date: '2026-04-20', direction: 'out', amount: 10_000, oneOff: true }),
        ]),
        fullMonth('2026-05', 600_000, 300_000),
        fullMonth('2026-06', 600_000, 300_000),
      ],
    });
    const v = run(oneOff, buyCash(1_370_001));
    expect(v.basisCodes).toContain('one_offs_excluded');
    walk('one_offs', v);
    const d = decide(BL(), buyCash(1_370_001));
    expect(d.margins.map((x) => x.flag)).toContain('on_edge');
    walk('margins', d.margins);
  });

  it('walks promo, deferred interest and late fees (D-48, D-50)', () => {
    const promo = buyCash(1_200_000, {
      payment: {
        method: 'loan',
        deposit: m(0),
        termMonths: 36,
        apr: percent('9.9'),
        promo: { apr: ZERO_PERCENT, months: 12, deferredInterest: true },
      },
    });
    const p = run(BL(), promo);
    expect(p.plan.promo?.deferredInterestCode).toBe('deferred_interest_charged');
    walk('promo', p);
    const late = buyCash(1_400_000, {
      payment: { method: 'instalment', instalmentAmount: m(62_000), instalmentCount: 24, lateFee: m(800) },
    });
    walk('late_fees', run(BL(), late));
  });

  it('walks a card plan with user-entered card fees (D-63)', () => {
    const card = buyCash(300_000, {
      payment: {
        method: 'card',
        card: {
          id: 'c1',
          apr: percent('22.9'),
          minimumTerms: { minimumPercent: percent('1'), interestAdded: true, floor: m(2_500) },
          currency: USD,
        },
        payoff: { kind: 'months', months: 12 },
        dealerCap: null,
        cardFees: m(3_500),
      },
    });
    const a = run(BL(), card);
    expect(a.plan.card?.fees).toBe(3_500);
    expect(a.plan.card?.cardCosts).not.toBeNull();
    walk('card_fees', a.plan);
    const minimum = buyCash(300_000, {
      payment: { ...(card.payment as Extract<BuyCheck['payment'], { method: 'card' }>), payoff: { kind: 'minimum' } },
    });
    walk('card_minimum', run(BL(), minimum));
  });

  it('walks investment views with a holding fee and user rates (D-51, D-52, D-63)', () => {
    const s = BL({ projectionRates: [percent('5')] });
    const a = run(s, BIG_LOAN);
    const views = investmentViews(a.context, BIG_LOAN, a, { horizonMonths: null, holdingFee: percent('1') });
    expect(views.netRates.some((r) => r.netRateScaled < 0n)).toBe(true);
    expect(views.priceInvested.byRate).toHaveLength(2);
    walk('views', views);
    const labels = views.rates.map((r) => r.label);
    expect(labels).toEqual(['held_not_grown', 'projection_at_entered_rate']);
    walk('views_none', investmentViews(a.context, BIG_LOAN, a, { horizonMonths: 24, holdingFee: null }));
  });

  it('walks running costs with a loss_of_value line, the prompt table and estimate bias (D-55, D-56, D-63)', () => {
    const lossOfValue = lossOfValueMonthly({ kind: 'percent_per_year', percentPerYear: percent('15') }, m(1_450_000));
    const costs = netRunningCosts(
      [
        { id: 'line_a', amount: m(5_000), counted: true, category: 'fuel' },
        { id: 'line_b', amount: lossOfValue, counted: true, category: 'loss_of_value' },
      ],
      []
    );
    expect(costs.nonCash).toBe(lossOfValue);
    walk('running_costs', costs);
    walk('prompts', RUNNING_COST_PROMPTS);
    const dec = (id: string, over: number): PastDecision => ({
      id,
      currency: USD,
      estimate: { dayOne: m(100_000), monthlyPayment: m(10_000), runningCosts: m(5_000) },
      actual: { dayOne: m(100_000 + over), monthlyPayment: m(10_000), runningCosts: m(5_000) },
    });
    const bias = estimateBias([dec('dec1', 1_000), dec('dec2', 2_000), dec('dec3', 3_000)], USD);
    walk('bias', bias);
    walk('bias_few', estimateBias([dec('dec1', 1_000)], USD));
  });

  it('walks scheduled outflows (D-61): ids are caller ids and dates match the date rule', () => {
    const s = PB({
      scheduledOutflows: [
        outflow({ id: 'o_past', date: '2026-07-07', amount: 50_000 }),
        outflow({ id: 'o_ahead', date: '2026-07-30', amount: 50_000 }),
      ],
    });
    const a = run(s, buyCash(100_000));
    expect(a.context.outflowsDueNow).toBe(50_000);
    expect(a.context.outflowsDueAhead).toBe(50_000);
    expect(a.ledgerCashAfterPurchase).toBe(a.context.ledgerCash - a.mineDayOne);
    walk('outflows', a);
    walk('outflows_context', ctxOf(s).cashPath);
  });

  it('saw every code the guard is meant to cover', () => {
    const expected = [
      'debt_rate_exceeds_return',
      'inv',
      'from_spare_this_month',
      'from_savings',
      'needs_spreading',
      'income',
      'expenses',
      'debt',
      'cash',
      'investments',
      'worse',
      'same',
      'cash_dip',
      'cash_path_unavailable',
      'cash_tight_before_payday',
      'one_offs_excluded',
      'on_edge',
      'applied',
      'deferred_interest_charged',
      'held_not_grown',
      'projection_at_entered_rate',
      'loss_of_value',
      'running_costs',
      'first_read',
      'rough',
      'affordable_price',
      'longer_term',
      'cut_line',
      'earn_more',
      'save_first',
      'do_without',
    ];
    for (const code of expected) expect(seen.has(code)).toBe(true);
    expect(seen.has('hard') || seen.has('soft')).toBe(true);
    for (const code of ['month_short', 'nothing_freed', 'too_thin', 'past_horizon']) {
      expect(seen.has(code)).toBe(true);
    }
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

describe('DCU-09: no advice vocabulary in engine source', () => {
  const engineRoot = path.join(__dirname, '..', '..');
  const files = [...sourceFiles(path.join(engineRoot, 'decide')), ...sourceFiles(path.join(engineRoot, 'payoff'))];

  it.each(files.map((f) => [path.relative(engineRoot, f), f] as const))('%s has no advice words', (_name, f) => {
    const text = fs
      .readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    // the three words the compliance rules forbid: advice, recommend, "you should"
    expect(text).not.toMatch(/advice|recommend|you should/i);
  });
});
