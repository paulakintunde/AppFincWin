/**
 * Phase 5 gate: every Phase 5 plan imports only this barrel. If a name here goes missing, Phase 4 changed its public
 * API and Phase 5 plans must be re-checked against 04-PHASE5-ALIGNMENT.md.
 */
import * as decide from '@/engine/decide';
import * as payoff from '@/engine/payoff';
import type {
  DecideSnapshot, RecordLine, MonthRecord, RecurringBill, RecurringIncome, FutureChange, DebtRecord, CardRecord,
  DecideLimits, BuyCheck, InvestCheck, BuyPayment, PriceAdjustment, CostLine, Plan, PaymentStep, PlanResult, Verdict,
  Assessment, FirstRead, RoughFigures, AssessContext, ContextResult, DecideOption, Alternatives, AlternativeRow,
  SuppressionCode, WarningCode, PurchaseSize, MissingReason, SetbackInput, SetbackReport, WaitPlan, MonthTable, Ledger,
  LedgerCode, Steadiness, CashOutcome, Percent, Decision, StackedCheckInput, StackedCheck, Confidence, CashPathReport,
  LineMargin, WorstMonthReport, BasisCode, RunningCostCategory, InvestmentViews, IncomeAtRiskReport, PastDecision,
  EstimateBias, CashTightFact, PromoTerms, PurchaseIncomeChange, StressOutcome, NetWorthPath, ProjectionRate,
  LossOfValueInput, CardPlanDetail, NetProjectionRate, CurrencyCode, MinorUnits, ScheduledOutflow,
  ProjectionRangeCode, RateFigure, PromoOutcome, MinimumOutcome, PlanReason,
} from '@/engine/decide';
import type { AmortisationResult, ScheduledAmortisation } from '@/engine/payoff';

const FUNCTIONS = ['decide','assess','prepareContext','buildOptions','buildAlternatives','applySetbacks','affordablePrice','firstRead','positionContext','stressTest','paybackMonths','investmentViews','resolveProjectionRates','incomeAtRisk','runningCostPrompts','isNonCashCategory','estimateBias','confidenceOf','defaultReserve','worstFutureMonth','lineMargins','rateScheduleFor','cashTightFact','isSmoothedPayFreq','monthlyEquivalent','nextDueDate','billsDueWithin','resolveSpendingShare','purchaseSize','resolvePriceInputs','salesTaxAmount','netRunningCosts','resolvePlan','withPrice','buildWaitPlan','memberParts','myPart','resolveShare','cardEligibility','suggestItemType','suggestSecured','minimumTermsFromDefaults','percent','lossOfValueMonthly','scheduledOutflowsDue'] as const;

const DECIDE_RUNTIME_EXPORTS = ['ALTERNATIVES_HORIZON_FALLBACK','ALTERNATIVES_HORIZON_MAX','ALTERNATIVES_HORIZON_MIN','AVERAGING_WINDOW_MONTHS','BASIS_POINTS_PER_UNIT','BILLS_DUE_HORIZON_DAYS','CARD_MAX_PURCHASE_USD','CASH_PATH_DAYS','CONFIDENCE_STRONG_MIN_MONTHS','CUT_LINE_COUNT','CUT_LINE_FRACTION_PERCENT','DAYS_PER_YEAR','DEFAULT_CHEAPER_RATIO_PERCENT','DEFAULT_DSR_LINE','DEFAULT_PROJECTION_HORIZON_MONTHS','DEFAULT_RESERVE_MONTHS','DEFAULT_SETBACKS','DEFAULT_UNSECURED_INCOME_MULTIPLE','DO_WITHOUT_FALLBACK_HORIZON_MONTHS','EDGE_MARGIN_PERCENT','ESTIMATE_BIAS_MIN_DECISIONS','FORTNIGHTS_PER_YEAR','FUTURE_CHANGE_MONTHS','HALF_MONTHS_PER_MONTH','ITEM_TYPES','LATE_INVOICE_DAYS_PER_MONTH','LATE_PAYMENT_COUNTS','LONGER_TERM_STEP_MONTHS','MARKET_DEFAULTS','MAX_APR_PERCENT','MAX_INSTALMENTS','MAX_POTS','MAX_PROJECTION_RATE','MAX_PROJECTION_RATES','MIN_MONTHS_FOR_STEADINESS','MONTHS_PER_QUARTER','MONTHS_PER_YEAR','RESERVE_HALF_MONTHS','RUNNING_COST_CATEGORIES','RUNNING_COST_PROMPTS','SIMULATION_MONTH_CAP','SOLE_SHARE','STEADY_CV_BELOW','STRESS_OFFSETS','VARIABLE_CV_BELOW','WARNING_ORDER','WEEKS_PER_YEAR','ZERO_PERCENT','addDays','affordablePrice','applyChanges','applyOutflows','applySetbacks','assertCurrency','assertValidBill','assertValidChange','assess','assessPlan','billsDueWithin','bisectLargest','buildAlternatives','buildCashPath','buildOptions','buildWaitPlan','cardEligibility','cashPathForSnapshot','cashPathMargin','cashPathReport','cashTightFact','changeActiveIn','classifyCashDip','confidenceOf','decide','defaultReserve','deriveMoney','dipShortfall','edgeMargin','estimateBias','firstRead','incomeAtRisk','investmentViews','isDeductedAheadFreq','isNonCashCategory','isOnEdge','isSecured','isSmoothedFreq','isSmoothedPayFreq','lineMargins','lossOfValueMonthly','lowestPoint','memberParts','minimumTermsFromDefaults','monthAfter','monthlyEquivalent','monthlyStepsOf','myPart','netRunningCosts','nextDueDate','paybackMonths','percent','positionContext','potSetAside','prepareContext','purchaseFlows','purchaseSize','rateScheduleFor','reserveHalfMonthsFor','resolvePlan','resolvePlanStrict','resolvePriceInputs','resolveProjectionRates','resolveShare','resolveSpendingShare','runningCostPrompts','runwayMonthsOf','salesTaxAmount','scheduledOutflowsDue','seriesDatesInPath','setbackHit','setbackHitFor','shareForCategory','spareCashOf','spreadUndatedSpending','stackCheck','stressTest','suggestItemType','suggestSecured','summariseMonth','totalSetAside','withPrice','worstFutureMonth'] as const;

const PAYOFF_RUNTIME_EXPORTS = ['MAX_APR','MAX_IMPLIED_APR_COUNT','MAX_TERM_MONTHS','MONTHLY_RATE_DENOMINATOR','ONE_HUNDRED_PERCENT','PERCENT_SCALE','SIMULATION_MONTH_CAP','ZERO_PERCENT','amortise','amortiseDue','amortiseSchedule','assertValidSchedule','ceilDivide','futureValue','futureValueExact','futureValueNet','futureValueNetExact','futureValuePath','futureValuePathExact','impliedApr','impliedAprDisplay','minorFromBigInt','minorOrNull','percent','percentFromScaled','promoMonthsOf','rateDenominator','simulateMinimum','simulateMinimumSchedule','singleRate'] as const;

// Compile-only: tsc fails if any of these types leaves the barrel.
type _Gate = [
  DecideSnapshot, RecordLine, MonthRecord, RecurringBill, RecurringIncome, FutureChange, DebtRecord, CardRecord,
  DecideLimits, BuyCheck, InvestCheck, BuyPayment, PriceAdjustment, CostLine, Plan, PaymentStep, PlanResult, Verdict,
  Assessment, FirstRead, RoughFigures, AssessContext, ContextResult, DecideOption, Alternatives, AlternativeRow,
  SuppressionCode, WarningCode, PurchaseSize, MissingReason, SetbackInput, SetbackReport, WaitPlan, MonthTable, Ledger,
  LedgerCode, Steadiness, CashOutcome, Percent, Decision, StackedCheckInput, StackedCheck, Confidence, CashPathReport,
  LineMargin, WorstMonthReport, BasisCode, RunningCostCategory, InvestmentViews, IncomeAtRiskReport, PastDecision,
  EstimateBias, CashTightFact, PromoTerms, PurchaseIncomeChange, StressOutcome, NetWorthPath, ProjectionRate,
  LossOfValueInput, CardPlanDetail, NetProjectionRate, CurrencyCode, MinorUnits, ScheduledOutflow,
  ProjectionRangeCode, RateFigure, PromoOutcome, MinimumOutcome, PlanReason, AmortisationResult, ScheduledAmortisation,
];
export type { _Gate };

type _Fee = InvestmentViews['holdingFee'];
type _Costs = CardPlanDetail['cardCosts'];
type _Sched = DecideSnapshot['scheduledOutflows'];
type _Cap = CardPlanDetail['remainingAtCap'];
type _Range = RateFigure['rangeCode'];
type _Term = AmortisationResult['termMonths'];
export type { _Fee, _Costs, _Sched, _Cap, _Range, _Term };

const _inv: InvestCheck extends StackedCheckInput['check'] ? true : never = true;
const _nullFig: null extends RateFigure['projected'] ? true : never = true;
const _nullPoint: null extends NetWorthPath['withPurchase'][number] ? true : never = true;
const _below: 'instalment_total_below_price' extends PlanReason ? true : never = true;
const _rateCap: 'projection_rate_out_of_range' extends MissingReason ? true : never = true;
void _inv; void _nullFig; void _nullPoint; void _below; void _rateCap;

type _DecideReturn = ReturnType<typeof decide.decide>;
const _v: _DecideReturn['verdict'] extends Verdict ? true : never = true;
const _s: _DecideReturn['standalone'] extends Verdict | null ? true : never = true;
void _v; void _s;

const surface = (m: object): string[] => Object.keys(m).filter((k) => k !== 'default' && k !== '__esModule').sort();

describe('Phase 4 barrel gate', () => {
  it.each(FUNCTIONS)('%s is a function', (n) => {
    expect(typeof (decide as Record<string, unknown>)[n]).toBe('function');
  });

  it('exports the expected values', () => {
    expect(decide.ZERO_PERCENT).toBe(0n);
    expect(Array.isArray(decide.DEFAULT_SETBACKS)).toBe(true);
    expect(decide.DEFAULT_SETBACKS.map((s) => s.code)).toEqual(
      expect.arrayContaining(['unexpected_expense', 'income_drop', 'job_loss', 'late_invoice']),
    );
    expect(Object.keys(decide.MARKET_DEFAULTS).sort()).toEqual(['CA', 'CA-QC', 'UK', 'US']);
    expect(decide.ITEM_TYPES).toEqual(['vehicle', 'rent_bill', 'loan_repayment', 'tax', 'insurance_premium', 'general', 'property', 'cash_equivalent', 'tuition']);
    expect(Object.keys(decide.RUNNING_COST_PROMPTS).length).toBeGreaterThan(0);
    expect(decide.MAX_PROJECTION_RATE).toBe(decide.percent('100'));
  });

  it('payoff barrel exposes the functions Phase 5 uses', () => {
    expect(typeof payoff.simulateMinimum).toBe('function');
    expect(typeof payoff.futureValueNet).toBe('function');
    expect(typeof payoff.amortiseSchedule).toBe('function');
    expect(typeof payoff.simulateMinimumSchedule).toBe('function');
  });

  it('the decide barrel exports exactly this surface', () => {
    expect(surface(decide)).toEqual([...DECIDE_RUNTIME_EXPORTS]);
  });

  it('the payoff barrel exports exactly this surface', () => {
    expect(surface(payoff)).toEqual([...PAYOFF_RUNTIME_EXPORTS]);
  });

  it('every gated function is in the surface', () => {
    FUNCTIONS.forEach((n) => expect(DECIDE_RUNTIME_EXPORTS).toContain(n));
  });

  it('smoke values', () => {
    expect(decide.percent('9.4')).toBe(94_000_000_000n);
    expect(decide.salesTaxAmount(1_450_000 as never, decide.percent('6'))).toBe(87_000);
  });
});
