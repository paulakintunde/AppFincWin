/**
 * Decide contracts (type-only: no runtime code in this file).
 *
 * DEC-12: the engine takes a plain DecideSnapshot plus a PurchaseCheck and returns codes and numbers only.
 * The snapshot is built outside engine/ by Phase 5.
 * D-21: every output is a code or a number, never an English string. Phase 5 maps codes to the i18n
 * catalogue, where the no-advice rule for verdict copy (DCU-09) is tested.
 * D-16 clarified: one currency per check. The snapshot builder converts every figure into
 * `DecideSnapshot.currency`; the engine rejects any other code (assertCurrency) and never converts.
 * D-30: the snapshot has no field for past or open checks. D-41 (2026-10-15): other open checks reach the
 * engine only as a separate per-call argument (StackedCheckInput[]); the engine keeps no state between calls.
 * D-34: two shares. `scope.rule` is the purchase's per-check split; `householdSpending` carries the
 * household rule (and per-category rules) for existing spending.
 *
 * Revised 2026-10-15 against 04-CONTEXT D-23…D-35, then expanded for D-41…D-63.
 */
import type { CurrencyCode, MinorUnits } from '../money/types';
import type { Percent, CardMinimumTerms, MinimumOutcome } from '../payoff/types';
import type { RecurringFreq } from '../recurring/schedule';
import type { ItemType, CardEligibility } from './cardRule';
import type { ShareScope, SplitRule, ResolvedShare } from './share';
export type {
  Percent,
  CardMinimumTerms,
  MinimumOutcome,
  ItemType,
  CardEligibility,
  ShareScope,
  SplitRule,
  ResolvedShare,
  RecurringFreq,
};

// ── Snapshot (in) — built by Phase 5 outside engine/ (DEC-12) ──
export type LineStatus = 'pending' | 'paid' | 'skipped'; // Record row status (recurring/cloneMonth.ts CloneSourceRow.status)
export interface RecordLine {
  readonly id: string;
  readonly date: string; // 'YYYY-MM-DD', inside its MonthRecord.month
  readonly direction: 'in' | 'out';
  readonly amount: MinorUnits; // >= 0, in `currency`
  readonly currency: CurrencyCode; // D-16: must equal DecideSnapshot.currency
  readonly status: LineStatus; // D-28: only 'paid' lines count toward past months
  readonly isRefund: boolean; // D-27: money in that nets against spending, never income; valid only with direction 'in'
  readonly transferId: string | null; // a transfer leg is neither income nor spending
  readonly seriesId: string | null; // Record recurring_series_id; lines of a smoothed series are replaced by its monthly equivalent (D-23)
  readonly categoryId: string | null; // D-34 per-category share lookup; null → the household rule
  readonly oneOff: boolean; // D-47: user-marked "one-off, won't recur"; left out of the averages and the worst month, counted in MoneyBasis.oneOffsExcluded
}
// Income lines ('in', not a refund) are MY income. Spending lines ('out') are my own spending in personal scope and the
// household's shared spending in household scope; the engine applies my existing-spending share (D-34). The builder omits
// debt repayments and saving/investing contributions that are not transfer legs: those enter through debts[].minimumPayment,
// monthlySaving and monthlyInvesting.
export interface MonthRecord {
  readonly month: string; // 'YYYY-MM'
  readonly full: boolean; // D-13: set by the snapshot builder; the engine never infers it
  readonly lines: readonly RecordLine[];
}
// A live recurring OUTFLOW series from Record; the builder omits ended series (their past lines then count as ordinary
// spending). Debt repayment series are never passed as bills: debts[].minimumPayment carries them, and the D-44 cash
// path would otherwise count them twice.
export interface RecurringBill {
  readonly seriesId: string;
  readonly confirmed: boolean; // D-25: created or accepted by the user; false (an unaccepted suggestion) → ignored everywhere
  readonly freq: RecurringFreq; // reused from src/engine/recurring/schedule.ts
  readonly anchorDate: string; // schedule anchor, 'YYYY-MM-DD'
  readonly endDate: string | null; // inclusive
  readonly occurrenceCount: number | null;
  readonly latestAmount: MinorUnits; // D-26: the latest scheduled amount, not an average of past occurrences
  readonly currency: CurrencyCode;
  readonly categoryId: string | null; // D-34
  readonly lastPaidDate: string | null; // D-24: date of the last settled occurrence ('paid' or 'skipped'); null when none. Set by the snapshot builder (Phase 5)
}
// D-44: a live confirmed PAY series (money in). Same schedule fields as a bill; income is mine and never shared, so there
// is no category. lastPaidDate = the last received (settled) occurrence. Only `confirmed: true` series count (D-25).
// D-60: a confirmed weekly or fortnightly pay series is smoothed in the income averages and the CV. In each month the
// series spans in full, its paid income lines (RecordLine.seriesId === seriesId) are replaced by
// monthlyEquivalent(latestAmount, freq) (D-26 latest amount); unconfirmed, monthly or other income is not smoothed.
// "Spans in full" (04-13) reads the schedule fields above: anchorDate is the series' first scheduled pay date
// (occurrence n = 0 in schedule.ts), and the series ends at endDate or, with occurrenceCount, at its last scheduled
// date; a month the series starts late in or ends inside counts its logged lines as they are.
export type RecurringIncome = Omit<RecurringBill, 'categoryId'>;
// D-61: a dated pending one-off outflow, e.g. the pending expense Go ahead writes (05). Not a series, and not a Record
// line the averages read. `amount` is MY share, already resolved by the snapshot builder: the engine applies no split to
// it (unlike bills). It sits on its date in the D-44 cash path (dated on or before asOf → day 0; dated after
// asOf + 90 days → outside the path, ignored) and reduces the cash ledger (the `cash` check's cashAvailable and the D-38
// Cash row's ledgerCash) only when dated on or before asOf, with or without a cash path; cashAfterBills (spare money)
// deducts every one dated within 90 days (series.ts scheduledOutflowsDue; AssessContext.outflowsDueNow / outflowsDueAhead).
export interface ScheduledOutflow {
  readonly id: string;
  readonly date: string; // 'YYYY-MM-DD', a valid local date (isValidLocalDate)
  readonly amount: MinorUnits; // > 0, in `currency`; my share, resolved by the builder
  readonly currency: CurrencyCode; // D-16: must equal DecideSnapshot.currency (the check's home currency)
}
export interface DebtRecord {
  readonly id: string;
  readonly balance: MinorUnits;
  readonly minimumPayment: MinorUnits;
  readonly secured: boolean; // DEC-11
  readonly apr: Percent | null; // D-31 only; null = not on record (never invented, D-07)
  readonly currency: CurrencyCode;
}
export interface CardRecord {
  readonly id: string;
  readonly apr: Percent | null;
  readonly minimumTerms: CardMinimumTerms | null;
  readonly currency: CurrencyCode;
} // D-07 / D-16: null = not on record; floor already in the check's currency
// MY share (D-34) on the paid, refund-netted basis; cuttable=false for housing, saving, debt (decided by the builder from the category)
export interface ExpenseLine {
  readonly lineId: string;
  readonly averageMonthly: MinorUnits;
  readonly cuttable: boolean;
}
export type Basis = 'average' | 'worst';
export interface DecideLimits {
  readonly reserve: MinorUnits | null; // D-01, D-42 (amended): null → month's costs × RESERVE_HALF_MONTHS[steadiness] ÷ 2, one half-up rounding
  readonly dsrLine: Percent | null; // D-04: null → DEFAULT_DSR_LINE (36%)
  readonly housingLine: Percent | null; // D-103: null → DEFAULT_HOUSING_LINE (28%)
  readonly unsecuredIncomeMultiple: number | null; // D-04: null → DEFAULT_UNSECURED_INCOME_MULTIPLE (12)
  readonly investingFloor: MinorUnits | null; // D-05: null → what the user invests now each month
  readonly savingFloor: MinorUnits | null; // D-05: null → what the user saves now each month
  readonly spareFloor: MinorUnits | null; // D-05: replaces the prototype's FLOOR = 25 for "too thin to be spare"; null → 0
}
export interface CategoryShareRule {
  readonly categoryId: string;
  readonly rule: SplitRule;
}
export interface HouseholdSpendingRule {
  readonly rule: SplitRule;
  readonly byCategory: readonly CategoryShareRule[];
} // D-34: existing spending only
// ── Pots (D-101, R18.2) ──
export type PotKind = 'wait' | 'pot';
export interface PotInput {
  readonly id: string;
  readonly kind: PotKind;
  readonly target: MinorUnits | null;
  readonly monthlyAmount: MinorUnits | null;
  readonly readyBy: string | null; // 'YYYY-MM-DD'
  readonly saved: MinorUnits; // opening saved + tagged paid lines
}
export type PotState = 'active' | 'reached' | 'past_due';
export interface PotLine {
  readonly id: string;
  readonly monthly: MinorUnits;
  readonly months: number | null;
  readonly state: PotState;
}

export interface DecideSnapshot {
  readonly currency: CurrencyCode; // D-16 clarified
  readonly asOf: string; // 'YYYY-MM-DD' check date; the engine has no clock (D-24 window)
  readonly months: readonly MonthRecord[];
  readonly bills: readonly RecurringBill[]; // D-23 / D-24 / D-25 / D-26
  readonly basisOverride: Basis | null;
  readonly cashOnHand: MinorUnits; // D-10: includes the current month's actual balances
  readonly debts: readonly DebtRecord[];
  readonly monthlySaving: MinorUnits; // goal contributions; pausable (D-35)
  readonly monthlyInvesting: MinorUnits; // automatic investing incl. recorded monthly investments (D-32); pausable (D-35)
  readonly scope: ShareScope; // PURCHASE share: rule = the per-check resolved split (D-15, D-34)
  readonly housingMonthly: MinorUnits; // D-103: my share of monthly housing costs (Housing-category spending plus payments on loans marked as housing), >= 0; the builder fills it
  readonly householdSpending: HouseholdSpendingRule | null; // EXISTING-spending share (D-34); required in household scope, ignored in personal scope
  readonly limits: DecideLimits;
  readonly projectionReturn: Percent | null; // D-06: null → 0%. The single rate behind the prototype-parity projection fields and the D-31 fact; the Phase 5 builder sets it to the first entered rate, or null
  readonly projectionRates: readonly Percent[]; // D-51: up to MAX_PROJECTION_RATES user-entered rates, entry order; [] → 0% only. Every projection is returned at 0% and at each of these (byRate); never defaulted (D-06)
  readonly expenseLines: readonly ExpenseLine[]; // for the cut-a-line option (DEC-13)
  readonly incomeSeries: readonly RecurringIncome[]; // D-44: confirmed pay series; none confirmed → no cash path (cash_path_unavailable). D-60: confirmed weekly/fortnightly ones are also smoothed in the income averages (deriveMoney)
  readonly futureChanges: readonly FutureChange[]; // D-45: the user's dated income/spending changes; never inferred
  readonly investmentBalance: MinorUnits; // D-52(d): current value of my investments, >= 0, for the net-worth path
  readonly scheduledOutflows: readonly ScheduledOutflow[]; // D-61: dated pending one-off outflows; [] = none
  readonly pots: readonly PotInput[]; // D-101: live, not-done pots in the home currency; [] = none. The builder drops a reopened check's own Wait pot
  readonly provisionalRates?: boolean; // D-69: some line was converted at the latest stored rate while its own rate is pending; caps confidence at fair. Absent = false
}

// ── Check (in) ──
export type CardPayoff =
  { readonly kind: 'full' } | { readonly kind: 'months'; readonly months: number } | { readonly kind: 'minimum' };
export type BuyPayment =
  | { readonly method: 'cash' }
  | {
      readonly method: 'loan';
      readonly deposit: MinorUnits;
      readonly termMonths: number | null;
      readonly apr: Percent | null; // apr = the standard rate (after any promo)
      readonly promo?: PromoTerms;
      readonly variable?: boolean; // D-48 / D-49: absent = none / not variable; never defaulted or inferred
    }
  | {
      readonly method: 'instalment';
      readonly instalmentAmount: MinorUnits | null;
      readonly instalmentCount: number | null;
      // D-80: absent = the plan has no rate; null = a rate is expected but not given (instalment_rate_missing); a Percent
      // works the payment out at APR / 12 over the count on the amount financed. A typed instalmentAmount is still the one scored.
      readonly apr?: Percent | null;
      // D-89 (R16.11 E3): how often the instalment falls; absent = 'monthly'. The payment is worked out at APR / periodsPerYear.
      readonly freq?: InstalmentFreq;
      // D-80 / D-49: absent = 'today' (an annuity-due: the first payment is on the day). D-89: 'next_period' is the first
      // payment one period on.
      readonly firstPayment?: 'today' | 'next_period';
      readonly lateFee?: MinorUnits;
      readonly lateFeeCapTotal?: MinorUnits; // D-50: user-entered fee per missed instalment and optional total cap; absent = none
    }
  | {
      readonly method: 'card';
      readonly card: CardRecord | null;
      readonly payoff: CardPayoff;
      readonly dealerCap: MinorUnits | null; // D-18, defaulted from the market table by the builder
      readonly region?: string | null; // D-92: the RD-02 country code; tax is blocked on a card in GB only
      // D-91: the card check limit in the plan currency (CARD_MAX_PURCHASE_USD converted by the snapshot). Absent = no
      // limit; null = no stored USD rate, so the card is `card_limit_rate_missing`.
      readonly cardMaxPurchase?: MinorUnits | null;
      readonly promo?: PromoTerms;
      readonly variable?: boolean; // D-48 / D-49: card.apr is the standard rate after any promo
      // D-63: one-off card fees the user typed that are charged for this purchase (e.g. a transaction or balance-transfer fee),
      // >= 0, household amount; absent = none, never defaulted. Paid on day one: added to dayOne and total, and to
      // CardPlanDetail.cardCosts. A recurring card fee is out of scope and must not be passed here.
      readonly cardFees?: MinorUnits;
    };
export type InvestPayment =
  { readonly method: 'lump' } | { readonly method: 'monthly'; readonly termMonths: number | null };
// price/dayFees/runningCostsNet come from resolvePriceInputs / netRunningCosts (D-37, plan 04-06); incomeChange: D-53, absent = none
export interface BuyCheck {
  readonly kind: 'buy';
  readonly currency: CurrencyCode;
  readonly price: MinorUnits;
  readonly dayFees: MinorUnits;
  readonly itemType: ItemType;
  readonly runningCostsNet: MinorUnits;
  readonly payment: BuyPayment;
  readonly incomeChange?: PurchaseIncomeChange;
}

// ── Check inputs (D-37: port of prototype dprice/downNet + the quick check's sales tax and fees) ──
export interface PriceAdjustment {
  // one step-2 line: a cost, fee, tax or trade-in
  readonly id: string;
  readonly amount: MinorUnits; // >= 0; the sign comes from `effect`
  readonly effect: 'adds' | 'takes_off';
  readonly onDay: boolean; // "Paid on the day"
  readonly counted: boolean; // the step-2 checkbox
}
export interface PriceInputs {
  readonly advertised: MinorUnits;
  readonly adjustments: readonly PriceAdjustment[];
} // amounts in the check's currency; the caller sets BuyCheck.currency
export interface ResolvedPrice {
  readonly advertised: MinorUnits;
  readonly adjustmentsNet: MinorUnits; // signed: counted adds − counted takes_off
  readonly price: MinorUnits; // max(0, advertised + adjustmentsNet) → BuyCheck.price
  readonly dayFees: MinorUnits; // counted, onDay, effect 'adds' → BuyCheck.dayFees; never more than price (LO-04: clamped when take-off lines floor the price)
  readonly countedLines: number;
  readonly totalLines: number; // "{n} of {m} lines counted"
}
// amount >= 0, monthly; category from the D-55 prompt the line came from (absent = a line the user added)
export interface CostLine {
  readonly id: string;
  readonly amount: MinorUnits;
  readonly counted: boolean;
  readonly category?: RunningCostCategory;
}
// D-63: the step-2 "Loss of value" prompt takes an amount or a %/year. lossOfValueMonthly (04-06 checkInputs.ts) turns either
// into the monthly non-cash amount of a CostLine with category 'loss_of_value'. Optional and never defaulted.
export type LossOfValueInput =
  | { readonly kind: 'amount'; readonly monthly: MinorUnits } // >= 0, per month, in the check's currency (the same unit as every CostLine)
  | { readonly kind: 'percent_per_year'; readonly percentPerYear: Percent }; // 0..100% per year of the advertised price (PriceInputs.advertised: the item's value before tax, fees and trade-ins), not ResolvedPrice.price
// net (signed) → BuyCheck.runningCostsNet; nonCash = counted loss_of_value lines, never in gross or net (D-55)
export interface RunningCosts {
  readonly gross: MinorUnits;
  readonly replaced: MinorUnits;
  readonly net: MinorUnits;
  readonly countedCosts: number;
  readonly totalCosts: number;
  readonly countedReplaced: number;
  readonly nonCash: MinorUnits;
}
export interface InvestCheck {
  readonly kind: 'invest';
  readonly currency: CurrencyCode;
  readonly amount: MinorUnits;
  readonly payment: InvestPayment;
}
export type PurchaseCheck = BuyCheck | InvestCheck;

// ── Plan (dplan) ──
export type PlanReason =
  | 'card_not_accepted'
  | 'card_missing'
  | 'card_apr_missing'
  | 'card_minimum_terms_missing'
  | 'dealer_cap_missing'
  | 'card_limit_rate_missing' // D-91: the card check limit has no stored USD rate to convert it
  | 'loan_term_missing'
  | 'loan_apr_missing'
  | 'instalment_amount_missing'
  | 'instalment_count_missing'
  | 'instalment_rate_missing' // D-80: the plan is expected to carry a rate and has none
  | 'instalment_total_below_price' // 04-REVIEW LO-05: amount x count is less than the financed price (price − dayFees)
  | 'invest_term_missing';
export interface CardPlanDetail {
  readonly eligibility: Exclude<CardEligibility, 'blocked'>;
  readonly onCard: MinorUnits; // prototype cardCap
  readonly remainderOnDay: MinorUnits; // D-18: part above the dealer cap, paid as day-one cash
  readonly capBy: 'dealer' | 'check_limit' | null; // D-91: which cap bound the card part (R16.11 card_check_limit); null = none; a tie reports the dealer cap
  readonly payoff: CardPayoff['kind'];
  readonly payoffMonths: number | null; // null when the minimum never clears or is still open at the 600-month cap (HI-02)
  readonly minimumOutcome: MinimumOutcome | null; // only for payoff 'minimum'
  readonly remainingAtCap: MinorUnits | null; // 04-REVIEW HI-02 / D-17: the balance still owed after SIMULATION_MONTH_CAP months when minimumOutcome is 'exceeds_month_cap'; null otherwise
  readonly fees: MinorUnits; // D-63: the payment's cardFees, 0 when absent (absence is "none", not a default)
  readonly cardCosts: MinorUnits | null; // D-63: Plan.interest (APR interest over the plan, incl. any D-48 promo / deferred interest) + fees; null exactly when Plan.interest is null (a minimum that never clears or is still open at the 600-month cap, HI-02)
}
export interface Plan {
  readonly price: MinorUnits;
  readonly dayOne: MinorUnits; // prototype `day`
  readonly monthly: MinorUnits; // prototype `mo`
  readonly months: number; // prototype `n`
  readonly financed: MinorUnits; // prototype `fin` (adds to debt; 0 for invest). Loan and instalment: price − deposit − dayFees (instalment: no deposit; 04-REVIEW ME-02, the on-the-day fees are paid on day one and dayOne/total include them)
  readonly total: MinorUnits | null; // null only when a card minimum never clears or is still open at the 600-month cap (HI-02: never a finite "cleared" total)
  readonly interest: MinorUnits | null;
  readonly dayFees: MinorUnits;
  readonly card: CardPlanDetail | null;
  // last scheduled payment (amortise finalPayment, D-20 residual) for loan and card-months; = monthly for instalment and
  // invest monthly; null for cash, lump and card full/minimum. For display only: Phase 5 writes recurring series from
  // `paymentSteps`, the source of truth (05 D-09). With a promo (D-48) `monthly` is the highest payment.
  readonly finalMonthly: MinorUnits | null;
  readonly impliedAnnualRate: Percent | null; // instalment only: the prototype's flat figure (instalments/financed − 1) × 12/n, half-up, where financed = price − dayFees (ME-02; equals the prototype's total/price when there are no on-the-day fees); ZERO_PERCENT when the instalments ≤ financed; null for every other method. Derived from the user's own numbers, never a default (D-07)
  // every payment after day one, month k >= 1, household amounts, contiguous runs; [] for cash, invest lump and card full.
  // THE source of truth for writing recurring series (05 D-09): Σ amount × run length === total − dayOne, promo or not (D-48)
  readonly paymentSteps: readonly PaymentStep[];
  readonly freq?: InstalmentFreq; // D-89: present on instalment plans; paymentSteps are then indexed by payment period (see PaymentStep)
  readonly promo: PromoOutcome | null; // D-48: present only for a loan or card-months/minimum plan with PromoTerms; then `monthly` = promo.highestMonthlyPayment
  readonly lateFees: LateFeeCost | null; // D-50: present only for an instalment plan with a user-entered lateFee; never changes any other figure
  readonly computedPayment?: MinorUnits; // D-80: present only for an instalment plan with a rate: the worked-out payment (a typed amount, when given, is the one scored)
}
export type PlanResult =
  | { readonly status: 'resolved'; readonly plan: Plan }
  | { readonly status: 'missing'; readonly reasons: readonly PlanReason[] };

// ── Money basis (dmoney, plan 04-13) ──
export interface SpendingShare {
  // D-34: resolved existing-spending share
  readonly byDefault: ResolvedShare;
  readonly byCategory: readonly {
    readonly categoryId: string;
    readonly share: ResolvedShare;
  }[];
}
export type SpendingShareResult =
  | { readonly ok: true; readonly share: SpendingShare }
  | {
      readonly ok: false;
      readonly reason: 'split_weights_zero' | 'split_amounts_zero';
    };
export interface MoneyInput {
  readonly currency: CurrencyCode;
  readonly months: readonly MonthRecord[];
  readonly bills: readonly RecurringBill[];
  readonly incomeSeries: readonly RecurringIncome[]; // D-60: = snapshot.incomeSeries; confirmed weekly/fortnightly pay is smoothed (04-13)
  readonly basisOverride: Basis | null;
  readonly spendingShare: SpendingShare;
}
export type Steadiness = 'steady' | 'variable' | 'volatile' | 'insufficient';
// my income; my net spending (refunds netted, floored at 0) plus smoothed bills; oneOffs: the paid, non-transfer one-off lines left out of this month (D-47)
export interface MonthSummary {
  readonly month: string;
  readonly income: MinorUnits;
  readonly spending: MinorUnits;
  readonly oneOffs: OneOffsExcluded;
}
export interface MoneyBasis {
  readonly fullMonthsUsed: number;
  readonly monthsUsed: readonly MonthSummary[]; // newest first: the window actually averaged
  readonly incomeAverage: MinorUnits;
  readonly incomeWorst: MinorUnits;
  readonly incomeBest: MinorUnits;
  readonly spendingAverage: MinorUnits;
  readonly spendingWorst: MinorUnits; // my share; worst spending = highest month (D-08, D-12 amended)
  readonly smoothedBillsMonthly: MinorUnits; // D-23: my share of the monthly equivalents, already inside every month's spending
  readonly steadiness: Steadiness;
  readonly incomeCvPercent: number | null; // whole-percent CV of income, half-up, exact (bigint isqrt, no float); null below MIN_MONTHS_FOR_STEADINESS, and null when every month's income is 0 (LO-01: steadiness is then 'volatile')
  readonly basis: Basis;
  readonly incomeBasis: MinorUnits;
  readonly spendingBasis: MinorUnits;
  readonly oneOffsExcluded: OneOffsExcluded; // D-47: summed over monthsUsed
}
export type MoneyResult =
  { readonly ok: true; readonly money: MoneyBasis } | { readonly ok: false; readonly reason: 'no_full_month' };

// ── Bills due (D-24) ──
export interface BillDue {
  readonly seriesId: string;
  readonly categoryId: string | null;
  readonly dates: readonly string[];
  readonly amount: MinorUnits;
} // household amount = latestAmount × dates.length

// ── Verdict (dassess) ──
export type VerdictState = 'fits' | 'adjust' | 'no' | 'missing';
export type WarningCode = 'month' | 'cash' | 'cash_dip' | 'dsr' | 'housing' | 'owe' | 'inv'; // cash_dip: D-44
export interface Warning {
  readonly code: WarningCode;
  readonly shortfall: MinorUnits;
}
// projection_rate_out_of_range: 04-REVIEW ME-01, an entered projection rate (projectionRates or projectionReturn) above
// MAX_PROJECTION_RATE (100% a year) is invalid input, rejected with this code rather than thrown
export type MissingReason =
  | PlanReason
  | 'no_full_month'
  | 'split_weights_zero'
  | 'split_amounts_zero'
  | 'projection_rate_out_of_range';
export type BasisMarker = 'logged_months' | 'first_read_rough_figures';
export type BasisFactCode = 'debt_rate_exceeds_return' | 'cash_tight_before_payday'; // D-31, D-59
// D-36: size of the purchase relative to the user's own money, judged as if paid in cash whatever the method.
// from_spare_this_month: my part of the price <= context.leftThisMonth (THIS month's left over, never the D-45 worst month);
// from_savings: otherwise, if cashAvailable − my part is still >= the reserve (cashAvailable follows the D-24/D-44 amended
// rule, like the `cash` ledger); needs_spreading: otherwise. No dollar thresholds (D-05).
export type PurchaseSize = 'from_spare_this_month' | 'from_savings' | 'needs_spreading';
export interface DebtRateFact {
  // D-31: neutral, non-blocking; never changes fits/adjust/no
  readonly code: 'debt_rate_exceeds_return';
  readonly debtId: string; // the unsecured debt with the highest APR above the projection return
  readonly debtApr: Percent;
  readonly projectionReturn: Percent;
}
// CashTightFact (D-59) is declared with the cash-path types below; both are neutral and never change fits/adjust/no
export type BasisFact = DebtRateFact | CashTightFact;
export interface ResolvedLimits {
  readonly reserve: MinorUnits;
  readonly dsrLine: Percent;
  readonly housingLine: Percent; // D-103
  readonly unsecuredLine: MinorUnits;
  readonly investingFloor: MinorUnits;
  readonly savingFloor: MinorUnits;
  readonly spareFloor: MinorUnits;
  readonly projectionReturn: Percent;
  readonly unsecuredIncomeMultiple: number; // the multiple behind unsecuredLine (limits value or DEFAULT_UNSECURED_INCOME_MULTIPLE)
  readonly projectionRates: readonly ProjectionRate[]; // D-51: resolveProjectionRates(snapshot.projectionRates) — 0% first, then the user's rates deduplicated in entry order; shared by alternatives, do_without and investment views
  readonly reserveHalfMonths: number | null; // D-42: RESERVE_HALF_MONTHS[steadiness] when the reserve is defaulted; null when the user typed one
}
// owe: unsecuredAfter <= unsecuredLine ("against your lines" fifth row)
export interface LimitChecks {
  readonly cash: boolean;
  readonly month: boolean;
  readonly dsr: boolean;
  readonly housing: boolean; // D-103: true when the line does not apply to the check
  readonly owe: boolean;
  readonly inv: boolean;
  readonly save: boolean;
}

// ── Month line by line and the five ledgers (D-38) ──
export interface MonthColumn {
  readonly income: MinorUnits;
  readonly living: MinorUnits;
  readonly debtPayments: MinorUnits;
  readonly savingInvesting: MinorUnits;
  readonly setAside: MinorUnits; // D-101: the monthly set-aside for pots
  readonly thisPurchase: MinorUnits;
  readonly outgoings: MinorUnits; // living + debtPayments + savingInvesting + setAside + thisPurchase
  readonly left: MinorUnits; // income − outgoings, exactly
}
export interface MonthTable {
  readonly now: MonthColumn;
  readonly after: MonthColumn;
} // pre-pause: now.left = leftBefore, after.left = left (D-38)
export type LedgerCode = 'income' | 'expenses' | 'debt' | 'cash' | 'investments';
export type LedgerDirection = 'better' | 'worse' | 'same';
export interface Ledger {
  readonly code: LedgerCode;
  readonly now: MinorUnits;
  readonly after: MinorUnits;
  readonly direction: LedgerDirection;
}
export interface AssessContext {
  // everything about the user that does not depend on the check
  readonly snapshot: DecideSnapshot;
  readonly money: MoneyBasis;
  readonly purchaseShare: ResolvedShare; // D-15: the per-check resolved split; applied to the purchase only (D-34)
  readonly spendingShare: SpendingShare; // D-34: my share of existing household spending and bills
  readonly limits: ResolvedLimits;
  readonly mySpendingBasis: MinorUnits; // money.spendingBasis (already my share); after positionContext (04-18) it also carries stacked running costs (D-41) and the worst future month's spending (D-45)
  readonly monthCosts: MinorUnits; // D-02: money.spendingAverage (smoothed, D-23) + debt minimums
  readonly debtPayments: MinorUnits;
  readonly unsecuredDebt: MinorUnits;
  readonly debtBalance: MinorUnits; // D-38: total balance owed, secured included (prototype debtBal)
  readonly annualIncome: MinorUnits; // incomeAverage × MONTHS_PER_YEAR (the owe description's "annual income")
  readonly pausable: MinorUnits; // D-35: monthlySaving + monthlyInvesting (D-32)
  readonly setAside: MinorUnits; // D-101: sum of the pots' monthly set-asides; never paused
  readonly potLines: readonly PotLine[]; // D-101: per-pot result, one source of truth for the Pots screen
  readonly protectedCash: MinorUnits; // D-101: min(sum of saved over live pots, max(0, cashOnHand)); a check never spends it
  readonly leftBefore: MinorUnits; // prototype M.left; after positionContext (04-18) the worst future month's (D-45)
  readonly leftThisMonth: MinorUnits; // D-36: this month's left over for the combined position — prepareContext's leftBefore, lowered by stacked checks (D-41), never moved by D-45 future changes; purchaseSize reads it
  readonly billsDue: MinorUnits; // D-24: my share of confirmed quarterly/yearly bills due within 90 days
  readonly billsDueDetail: readonly BillDue[];
  readonly outflowsDueNow: MinorUnits; // D-61: Σ snapshot.scheduledOutflows dated on or before asOf (day 0 of the cash path)
  readonly outflowsDueAhead: MinorUnits; // D-61: Σ scheduled outflows dated after asOf and on or before asOf + BILLS_DUE_HORIZON_DAYS (on their dates in the path); later ones are ignored
  // D-24/D-44 amended + D-61 (read literally): cashOnHand − outflowsDueNow when cashPath is non-null (dated bills and
  // future-dated scheduled outflows reach the verdict only through cash_dip); cashOnHand − billsDue − outflowsDueNow when it
  // is null (a future-dated outflow is not in the `cash` check). Read ONLY by the `cash` check/warning and D-36
  // from_savings (NOT the D-38 cash ledger row, which reads ledgerCash)
  readonly cashAvailable: MinorUnits;
  // D-24 always applied, plus D-61: cashOnHand − billsDue − outflowsDueNow − outflowsDueAhead, with or without a cash path.
  // Every spare-money figure reads it: alternatives spareCash, options save_first, buildWaitPlan, incomeAtRisk's
  // without-purchase cash, the D-52 net-worth start cash
  readonly cashAfterBills: MinorUnits;
  readonly ledgerCash: MinorUnits; // D-38 + D-61: cashOnHand − billsDue − outflowsDueNow, with or without a cash path; the D-38 Cash row's Now; equals cashAvailable when cashPath is null
  readonly highestUnsecuredApr: {
    readonly debtId: string;
    readonly apr: Percent;
  } | null; // D-31 input
  readonly monthIncome: MinorUnits; // D-45 hook: the month test's income — money.incomeBasis from prepareContext, the worst future month's income after positionContext; the dsr test keeps money.incomeBasis
  readonly cashPath: CashPathBase | null; // D-44: the 90-day path WITHOUT the purchase; null when no confirmed income series (cash_path_unavailable)
  readonly position: PositionInfo | null; // D-41 / D-45: null from prepareContext; set once by positionContext (04-18)
}
// D-46: confidence from the money basis when it resolved (only a split failed); rough ['under_3_full_months'] only when there is no full month
export type ContextResult =
  | { readonly ok: true; readonly context: AssessContext }
  | {
      readonly ok: false;
      readonly reasons: readonly MissingReason[];
      readonly confidence: Confidence;
    };
export interface Assessment {
  readonly state: 'fits' | 'adjust' | 'no';
  readonly basisMarker: 'logged_months';
  readonly warnings: readonly Warning[]; // at most 6 (cash_dip added by D-44), shortfall desc, ties in WARNING_ORDER
  readonly facts: readonly BasisFact[]; // D-31 debt_rate_exceeds_return (invest checks only) first, then D-59 cash_tight_before_payday (any check with a cash path whose low without the purchase is below the reserve)
  readonly size: PurchaseSize; // D-36: cash-paid hypothetical, independent of the payment method
  readonly plan: Plan;
  // D-62: newMonthly = mineMonthly + mineRunning exactly (my share of plan.monthly plus my share of the signed net running
  // costs; mineRunning is 0 on invest checks)
  readonly mineDayOne: MinorUnits;
  readonly mineMonthly: MinorUnits;
  readonly mineRunning: MinorUnits;
  readonly newMonthly: MinorUnits;
  readonly left: MinorUnits;
  readonly cashAfter: MinorUnits; // cashAfter = cashAvailable − mineDayOne: the `cash` check figure (D-24/D-44 amended)
  readonly cashAfterBillsAndPurchase: MinorUnits; // context.cashAfterBills − mineDayOne: purchase, D-24 bills and every scheduled outflow within 90 days taken off, always. Setbacks, the D-39 runway and incomeAtRisk read it
  readonly ledgerCashAfterPurchase: MinorUnits; // D-38 + D-61: context.ledgerCash − mineDayOne, the D-38 Cash row's After; equals cashAfter whenever there is no cash path
  readonly debtServiceAfter: MinorUnits;
  readonly unsecuredAfter: MinorUnits;
  readonly debtServiceRatioBefore: Percent | null; // half-up share of incomeBasis; null when incomeBasis is 0 ("{pct} of money in")
  readonly debtServiceRatioAfter: Percent | null;
  readonly housingBefore: MinorUnits; // D-103: my monthly housing cost before the check (snapshot.housingMonthly)
  readonly housingAfter: MinorUnits; // D-103: max(0, housingBefore + newMonthly) for a property check that adds housing; otherwise housingBefore
  readonly housingRatioBefore: Percent | null; // half-up share of incomeBasis; null when incomeBasis is 0
  readonly housingRatioAfter: Percent | null;
  readonly debtBalanceAfter: MinorUnits; // debtBalance + my share of plan.financed (buy only)
  readonly monthTable: MonthTable; // D-38
  readonly ledgers: readonly [Ledger, Ledger, Ledger, Ledger, Ledger]; // D-38: income, expenses, debt, cash, investments
  readonly investingAtRisk: MinorUnits; // D-35: paused from investing first
  readonly investingAfter: MinorUnits;
  readonly savingAtRisk: MinorUnits; // D-35: then from saving
  readonly savingAfter: MinorUnits;
  readonly pauseNeeded: MinorUnits; // investingAtRisk + savingAtRisk
  readonly remainingShortfall: MinorUnits; // what the month still lacks after pausing (buy) or −left (invest, D-33)
  readonly burn: MinorUnits; // monthly outgoings after this decision
  readonly checks: LimitChecks;
  readonly context: AssessContext;
  readonly cashPath: CashPathReport; // D-44: both 90-day paths and their lowest days, or { status: 'unavailable', code: 'cash_path_unavailable' }
  readonly cashDip: CashDipSeverity | null; // D-44: 'hard' (lowest below 0 → state 'no'), 'soft', or null; the cash_dip warning carries the shortfall
  readonly basisCodes: readonly BasisCode[]; // 'cash_path_unavailable' (D-44) then 'one_offs_excluded' (D-47), each at most once
  readonly confidence: Confidence; // D-46
}
// size null only when prepareContext failed (no full month, zero split)
export type Verdict =
  | {
      readonly state: 'missing';
      readonly reasons: readonly MissingReason[];
      readonly size: PurchaseSize | null;
      readonly confidence: Confidence;
    }
  | Assessment;

// ── Bisection / options (DEC-09, DEC-13) ──
export type AffordablePrice =
  | { readonly kind: 'full_price_fits'; readonly price: MinorUnits }
  | { readonly kind: 'nothing_affordable' }
  | { readonly kind: 'found'; readonly price: MinorUnits };
export type DecideOption =
  | {
      readonly code: 'affordable_price';
      readonly price: MinorUnits;
      readonly reduction: MinorUnits;
    }
  | {
      readonly code: 'longer_term';
      readonly termMonths: number;
      readonly monthlyPayment: MinorUnits;
      readonly leftAfter: MinorUnits;
      readonly monthCloses: boolean;
      readonly leftChange: MinorUnits;
      readonly extraInterest: MinorUnits;
    }
  | {
      readonly code: 'cut_line';
      readonly lineId: string;
      readonly lineAverage: MinorUnits;
      readonly cut: MinorUnits;
      readonly gap: MinorUnits;
      readonly closesGap: boolean;
    }
  | {
      readonly code: 'earn_more';
      readonly gap: MinorUnits;
      readonly incomeBasis: MinorUnits;
      readonly basis: Basis;
      readonly percentOfIncome: Percent | null;
    }
  | {
      readonly code: 'save_first';
      readonly need: MinorUnits;
      readonly monthlySpare: MinorUnits;
      readonly months: number | null;
    }
  | {
      // projected: at limits.projectionReturn (prototype parity); byRate: D-51, one entry per limits.projectionRates
      readonly code: 'do_without';
      readonly keptMonthly: MinorUnits;
      readonly horizonMonths: number;
      readonly projected: MinorUnits | null; // null exactly when rangeCode is 'exceeds_range' (ME-01)
      readonly rangeCode: ProjectionRangeCode | null;
      readonly projectionReturn: Percent;
      readonly byRate: readonly RateFigure[];
    };
export type OptionCode = DecideOption['code'];

// ── Alternatives (DEC-14) ──
export type AlternativeCode = 'as_planned' | 'cheaper' | 'wait_and_save' | 'skip';
export type SuppressionCode = 'month_short' | 'too_thin' | 'nothing_freed' | 'past_horizon' | 'nothing_spare';
export interface Suppression {
  readonly code: SuppressionCode;
  readonly amount: MinorUnits | null;
}
export interface AlternativeRow {
  readonly code: AlternativeCode;
  readonly dayOne: MinorUnits | null;
  readonly monthly: MinorUnits | null;
  readonly contributed: MinorUnits | null;
  readonly projected: MinorUnits | null; // null when suppressed, not applicable or out of range (rangeCode); at limits.projectionReturn (prototype parity)
  readonly growth: MinorUnits | null;
  readonly rangeCode: ProjectionRangeCode | null; // ME-01: 'exceeds_range' when the projected figure is past Number.MAX_SAFE_INTEGER; null otherwise
  readonly byRate: readonly RateFigure[] | null; // D-51: one RateFigure per limits.projectionRates entry (0% first, then the user's rates); null exactly when contributed is null
  readonly suppression: Suppression | null;
}
export interface CheaperDetail {
  // step 4 "Spend less" card and the trade line
  readonly ratioPercent: number; // cheaper over price, half-up whole percent, display only (D-83)
  readonly notSpent: MinorUnits; // plan.price − cheaperPrice
  readonly dayDiff: MinorUnits; // my day-one saving against as planned (>= 0)
  readonly monthlyDiff: MinorUnits; // my monthly saving against as planned (>= 0)
  readonly keptOnDay: MinorUnits; // seedB: the part that is genuinely spare
  readonly keptMonthly: MinorUnits; // moB: the part that is genuinely spare
  readonly leftAfter: MinorUnits; // cheapLeft: the month after buying the cheaper one
  readonly monthlyPayment: MinorUnits; // my share of the cheaper plan's monthly payment ("lowers the payment from {a} to {b}")
}
export interface Alternatives {
  readonly horizonMonths: number;
  readonly projectionReturn: Percent;
  readonly cheaperPrice: MinorUnits;
  readonly rates: readonly ProjectionRate[]; // D-51: = context.limits.projectionRates, the list every row's byRate follows
  readonly cheaper: CheaperDetail;
  readonly spareCash: MinorUnits;
  readonly spareMonthly: MinorUnits;
  readonly monthsToBuy: number | null;
  readonly waitMonths: number;
  readonly rows: readonly [AlternativeRow, AlternativeRow, AlternativeRow, AlternativeRow]; // as_planned, cheaper, wait_and_save, skip
}

// ── Setbacks (DEC-15) ──
export type SetbackCode = 'unexpected_expense' | 'income_drop' | 'job_loss' | 'late_invoice';
export type SetbackInput =
  | {
      readonly code: 'unexpected_expense';
      readonly enabled: boolean;
      readonly amount: MinorUnits | null;
    } // null → one month's costs (D-02 figure)
  | {
      readonly code: 'income_drop';
      readonly enabled: boolean;
      readonly percentDrop: number;
      readonly months: number;
    }
  | {
      readonly code: 'job_loss';
      readonly enabled: boolean;
      readonly months: number;
    }
  | {
      readonly code: 'late_invoice';
      readonly enabled: boolean;
      readonly daysLate: number;
    };
export type CashOutcome = 'absorbed' | 'through_cushion' | 'wiped_out';
export interface SetbackResult {
  readonly code: SetbackCode;
  readonly enabled: boolean;
  readonly hit: MinorUnits;
  readonly cashAfter: MinorUnits;
  readonly outcome: CashOutcome;
}
// results[].cashAfter and stressedCash start from assessment.cashAfterBillsAndPurchase;
// runwayMonths: D-39, floor(max(0, cashAfterBillsAndPurchase) / burn), null when burn <= 0
export interface SetbackReport {
  readonly results: readonly SetbackResult[];
  readonly anyEnabled: boolean;
  readonly combinedHit: MinorUnits;
  readonly stressedCash: MinorUnits;
  readonly stressedOutcome: CashOutcome;
  readonly runwayMonths: number | null;
}

// ── Wait and save (D-40, 05 D-10) ──
export interface WaitPlan {
  readonly target: MinorUnits; // buy: max(0, myPart(price) − spareCash), spareCash = max(0, cashAfterBills − reserve) — buying outright later; invest: the amount
  readonly monthlyAmount: MinorUnits; // the user's amount, or the default max(0, leftBefore)
  readonly spareMonthly: MinorUnits; // max(0, leftBefore)
  readonly withinSpare: boolean; // monthlyAmount <= spareMonthly
  readonly months: number | null; // max(1, ceil(target / monthlyAmount)); null when monthlyAmount is 0
  readonly readyBy: string | null; // 'YYYY-MM-DD': asOf + months calendar months (schedule clamping); null when months is null or exceeds SIMULATION_MONTH_CAP
}

// ── First read (DEC-16, D-11 as amended 2026-10-15) ──
export interface RoughFigures {
  readonly currency: CurrencyCode;
  readonly cash: MinorUnits;
  readonly monthlyIncome: MinorUnits;
  readonly monthlySpending: MinorUnits;
}
export interface FirstReadWarning {
  readonly code: Extract<WarningCode, 'month' | 'cash'>;
  readonly shortfall: MinorUnits;
}
export type FirstRead =
  | {
      // D-36 from the rough figures; D-46 always rough ['first_read']
      readonly state: 'missing';
      readonly basisMarker: 'first_read_rough_figures';
      readonly reasons: readonly PlanReason[];
      readonly size: PurchaseSize;
      readonly confidence: Confidence;
    }
  | {
      readonly state: 'fits' | 'adjust' | 'no';
      readonly basisMarker: 'first_read_rough_figures';
      readonly size: PurchaseSize;
      readonly plan: Plan;
      readonly dayOne: MinorUnits;
      readonly monthly: MinorUnits;
      readonly cashAfter: MinorUnits;
      readonly leftAfter: MinorUnits;
      readonly roughCushion: MinorUnits;
      readonly cashCovers: boolean;
      readonly monthCloses: boolean;
      readonly aboveCushion: boolean;
      readonly warnings: readonly FirstReadWarning[]; // only 'month' and 'cash' (cash-level only, D-11)
      readonly confidence: Confidence; // D-46
    };

// ── Running costs and one-offs (D-55, D-47) ──
export type RunningCostCategory =
  | 'insurance' | 'fuel' | 'maintenance' | 'registration' | 'loss_of_value'
  | 'property_tax' | 'home_insurance' | 'utilities' | 'service_charge' | 'books_materials' | 'travel' | 'accommodation'; // D-92 adds the last seven; loss_of_value is non-cash (D-55)
// D-47: paid, non-transfer lines marked oneOff in the averaged months; spending = my share of their money-out amounts,
// income = their money-in (non-refund) amounts; a one-off refund counts only in `count`
export interface OneOffsExcluded {
  readonly count: number;
  readonly spending: MinorUnits;
  readonly income: MinorUnits;
}
export type BasisCode = 'cash_path_unavailable' | 'one_offs_excluded';

// ── Credit terms (D-48, D-49, D-50) ──
export interface PromoTerms {
  readonly apr: Percent;
  readonly months: number;
  readonly deferredInterest: boolean;
} // user-entered, never defaulted (D-07); months integer 1..MAX_TERM_MONTHS; deferredInterest needs apr 0
/**
 * D-89: `fromMonth` / `toMonth` are payment-period indexes, inclusive, k >= 1 after day one; household amount. They are
 * calendar months only when `Plan.freq` is 'monthly' or absent. A weekly, fortnightly or quarterly instalment plan counts
 * periods (week 1, week 2, ...), so a month-indexed consumer must read `monthlyStepsOf(plan)`, never `plan.paymentSteps`.
 */
export interface PaymentStep {
  readonly fromMonth: number;
  readonly toMonth: number;
  readonly amount: MinorUnits;
}
/** D-89: how often an instalment plan's payment falls. */
export type InstalmentFreq = 'weekly' | 'fortnightly' | 'monthly' | 'quarterly';
export interface PromoOutcome {
  readonly promoMonths: number;
  readonly promoApr: Percent;
  readonly deferredInterest: boolean;
  readonly paymentDuringPromo: MinorUnits; // the first scheduled payment
  readonly paymentAfterPromo: MinorUnits | null; // the first payment after the promo; null when the balance clears before it ends
  readonly clearsBeforePromoEnd: boolean;
  readonly interestAfterPromo: MinorUnits | null; // all interest charged after the promo, including any deferred charge; null when a card minimum never clears or is still open at the 600-month cap (HI-02)
  readonly deferredInterestCharged: MinorUnits; // 0 unless deferredInterest and the balance is open at promo end
  readonly deferredInterestCode: 'deferred_interest_charged' | null;
  readonly highestMonthlyPayment: MinorUnits; // = Plan.monthly; the month test uses it (D-48)
  readonly paymentToClearInPromo: MinorUnits; // ceil(financed / promoMonths): the smallest level payment that clears it inside the promo, so paying it for promoMonths months charges no deferred interest (04-REVIEW HI-01, D-64)
}
// D-50: min(fee × min(n, instalments remaining), cap)
export interface LateFeeCost {
  readonly feePerLatePayment: MinorUnits;
  readonly capTotal: MinorUnits | null;
  readonly oneLate: MinorUnits;
  readonly twoLate: MinorUnits;
}
export interface StressOutcome {
  // D-49: beside the verdict, never instead of it
  readonly offset: Percent; // percent('2') or percent('4'): percentage points added to the standard rate
  readonly apr: Percent;
  readonly monthly: MinorUnits;
  readonly mineMonthly: MinorUnits;
  readonly left: MinorUnits;
  readonly state: 'fits' | 'adjust' | 'no';
  readonly monthCloses: boolean;
  readonly dsrWithinLine: boolean;
}

// ── Cash path (D-44, D-24/D-44 amended) ──
export interface DatedAmount {
  readonly date: string;
  readonly amount: MinorUnits;
} // 'YYYY-MM-DD' inside the path window; signed (+ leaves cash for an outflow list, + arrives for an inflow list)
// D-61 (series.ts scheduledOutflowsDue): dueNow = Σ dated on or before asOf; dueAhead = Σ dated after asOf and on or
// before asOf + horizon; dated = one entry per outflow inside that window, input order, with the date moved to asOf when on or before it
export interface ScheduledOutflowsDue {
  readonly dueNow: MinorUnits;
  readonly dueAhead: MinorUnits;
  readonly dated: readonly DatedAmount[];
}
export interface CashPathBase {
  readonly asOf: string;
  readonly balances: readonly MinorUnits[];
} // end-of-day balances, index d = asOf + d days, d = 0..CASH_PATH_DAYS
export interface CashPathPoint {
  readonly day: number;
  readonly date: string;
  readonly amount: MinorUnits;
} // lowest point; ties → earliest day
export type CashPathReport =
  | { readonly status: 'unavailable'; readonly code: 'cash_path_unavailable' }
  | {
      readonly status: 'available';
      readonly withoutPurchase: readonly MinorUnits[];
      readonly withPurchase: readonly MinorUnits[];
      readonly lowestWithout: CashPathPoint;
      readonly lowestWith: CashPathPoint;
      readonly tightBeforePayday: CashTightFact | null; // D-59
    };
// D-59: the lowest point of the path WITHOUT the purchase ('YYYY-MM-DD', may be negative) when it is below the reserve; a basis fact, never a warning
export interface CashTightFact {
  readonly code: 'cash_tight_before_payday';
  readonly date: string;
  readonly amount: MinorUnits;
}
export type CashDipSeverity = 'hard' | 'soft';
// D-59: fires only when the purchase causes or deepens the dip; shortfall = dipShortfall(input) (04-17) = the extra depth the
// purchase adds below the reserve (or below 0), less the part of the `cash` card the purchase itself caused,
// max(0, min(reserve, cashOnHand) − cashAfter) (one card per cause); hard iff lowestWith < 0
export interface CashDip {
  readonly severity: CashDipSeverity;
  readonly shortfall: MinorUnits;
}
// D-59 compares lowestWith with lowestWithout; cashAfter is the `cash` check figure (cashOnHand − my day-one cost with a path);
// cashOnHand is the cash before this purchase on the positioned context, i.e. context.cashAvailable when a path exists (cash on
// hand less any stacked checks' day-one costs, 04-18; never the raw snapshot.cashOnHand), so only the purchase-caused part of
// the cash card is subtracted. Also read by cashPathMargin (04-17) for the D-43 cash_path line
export interface CashDipInput {
  readonly lowestWith: MinorUnits;
  readonly lowestWithout: MinorUnits;
  readonly reserve: MinorUnits;
  readonly cashAfter: MinorUnits;
  readonly cashOnHand: MinorUnits;
}

// ── Future changes and purchase-linked income (D-45, D-53) ──
export type FutureChangeKind = 'income' | 'spending';
export interface FutureChange {
  readonly id: string;
  readonly kind: FutureChangeKind;
  readonly monthlyAmount: MinorUnits; // signed: + raises income or spending, − lowers it; my own amount, never re-shared
  readonly startMonth: string; // 'YYYY-MM'
  readonly endMonth: string | null; // inclusive; null = no end
  readonly currency: CurrencyCode;
}
export interface WorstMonthInput {
  readonly asOf: string;
  readonly currency: CurrencyCode;
  readonly monthIncome: MinorUnits;
  readonly monthSpending: MinorUnits;
  readonly fixedOutgoings: MinorUnits;
  readonly changes: readonly FutureChange[];
}
export interface WorstMonth {
  // the worst of the FUTURE_CHANGE_MONTHS months after asOf's month; ties → earliest
  readonly month: string; // 'YYYY-MM'
  readonly offset: number; // 1..12
  readonly income: MinorUnits; // income and spending floored at 0
  readonly spending: MinorUnits;
  readonly leftBefore: MinorUnits;
  readonly incomeDelta: MinorUnits; // vs the unchanged month, after the floor
  readonly spendingDelta: MinorUnits;
}
export type IncomeLikelihood = 'likely' | 'uncertain';
export interface PurchaseIncomeChange {
  readonly monthlyAmount: MinorUnits; // signed, non-zero; − is a D-45 income change in the verdict, + is only ever reported beside it
  readonly startDate: string;
  readonly likelihood: IncomeLikelihood;
}
// first month where cumulative extra income >= cumulative cost; figures at that month, or at the horizon when null
export interface PaybackResult {
  readonly months: number | null;
  readonly totalCost: MinorUnits;
  readonly extraIncome: MinorUnits;
  readonly horizonMonths: number;
}
export interface ExpectedIncomeOutcome {
  readonly monthlyAmount: MinorUnits;
  readonly likelihood: IncomeLikelihood;
  readonly startMonth: string;
  readonly assessment: Assessment;
  readonly payback: PaybackResult;
}

// ── Combined checks (D-41, D-41 amended) ──
// D-62: check is a PurchaseCheck = BuyCheck | InvestCheck, so an InvestCheck is a valid other open check (a monthly one joins
// investing and the pausable amount, D-32; a lump one leaves cash on day one). purchaseRule = its own resolved split (D-15),
// required in household scope, null in personal scope
export interface StackedCheckInput {
  readonly check: PurchaseCheck;
  readonly purchaseRule: SplitRule | null;
}
export type StackedCheckStatus = 'applied' | 'missing';
export interface StackedCheck {
  readonly index: number;
  readonly status: StackedCheckStatus;
  readonly reasons: readonly MissingReason[]; // [] when applied
  readonly mineDayOne: MinorUnits; // 0 when missing
  readonly mineMonthly: MinorUnits;
}
export interface PositionInfo {
  readonly stacked: readonly StackedCheck[];
  readonly changes: readonly FutureChange[];
  readonly worstMonth: WorstMonth;
  readonly expectedIncomeIncluded: boolean;
}
export interface Position {
  readonly combined: AssessContext;
  readonly standalone: AssessContext;
  readonly stacked: readonly StackedCheck[];
}

// ── Confidence and margins (D-46, D-43) ──
export type ConfidenceLevel = 'strong' | 'fair' | 'rough';
export type ConfidenceReason =
  'first_read' | 'under_3_full_months' | 'volatile_income' | 'under_6_full_months' | 'variable_income' | 'provisional_rates';
export interface ConfidenceInput {
  readonly fullMonths: number;
  readonly steadiness: Steadiness | null;
  readonly firstRead: boolean;
  readonly provisionalRates?: boolean; // D-69: absent = false
}
export interface Confidence {
  readonly level: ConfidenceLevel;
  readonly reasons: readonly ConfidenceReason[];
} // strong → reasons []
export type MarginLine = 'month' | 'cash' | 'dsr' | 'housing' | 'owe' | 'inv' | 'cash_path';
export interface LineMargin {
  readonly line: MarginLine;
  readonly margin: MinorUnits; // signed (>= 0 passes)
  readonly threshold: MinorUnits;
  readonly base: MinorUnits; // = threshold, or a month's costs when the threshold is 0
  readonly flag: 'on_edge' | null;
}

// ── Decision report (D-41, D-43, D-45, D-49, D-53) ──
export interface WorstMonthReport {
  readonly month: string;
  readonly offset: number;
  readonly leftAfter: MinorUnits;
  readonly leftAfterNow: MinorUnits;
  readonly shortfall: MinorUnits;
  readonly differsFromNow: boolean;
}
export interface Decision {
  readonly verdict: Verdict; // the combined position (D-41); equals assess(snapshot, check, otherChecks)
  readonly standalone: Verdict | null; // D-41: the check on its own; null when otherChecks is empty
  readonly combinedDiffers: boolean; // standalone !== null && standalone.state !== verdict.state
  readonly stacked: readonly StackedCheck[];
  readonly worstMonth: WorstMonthReport | null; // D-45; null when the verdict is missing
  readonly margins: readonly LineMargin[]; // D-43; [] when the verdict is missing
  readonly stress: readonly StressOutcome[]; // D-49; [] unless a variable loan or card plan
  readonly withExpectedIncome: ExpectedIncomeOutcome | null; // D-53; only for a positive incomeChange on a resolved buy check
}

// ── Investment views (D-51, D-52) ──
export type ProjectionRateLabel = 'projection_at_entered_rate' | 'held_not_grown';
export interface ProjectionRate {
  readonly rate: Percent;
  readonly userEntered: boolean;
  readonly label: ProjectionRateLabel;
} // 0% first (held_not_grown), then the user's rates
export interface InvestmentViewsInput {
  readonly horizonMonths: number | null; // null → plan term, or DEFAULT_PROJECTION_HORIZON_MONTHS for a plan with no term. Rates are NOT an input here: every view uses context.limits.projectionRates (D-51)
  readonly holdingFee: Percent | null; // D-63: user-entered holding fee per year, 0..100%; null = no fee (treated as 0, never a supplied fee). Every D-52 view grows at net = rate − fee, which may be negative
}
// D-63: netRateScaled = rate − holdingFee at PERCENT_SCALE, signed (below 0 when the fee exceeds the rate)
export interface NetProjectionRate {
  readonly rate: Percent;
  readonly netRateScaled: bigint;
}
export type HorizonSource = 'plan_term' | 'cash_default' | 'user';
// 04-REVIEW ME-01: a projection past Number.MAX_SAFE_INTEGER (a high entered rate over a long horizon) is reported, never
// thrown: the figure is null and carries 'exceeds_range'. Phase 5 words it; the engine never rounds or caps a figure.
export type ProjectionRangeCode = 'exceeds_range';
export interface RateFigure {
  readonly rate: Percent;
  readonly contributed: MinorUnits;
  readonly projected: MinorUnits | null; // null exactly when rangeCode is 'exceeds_range' (ME-01)
  readonly growth: MinorUnits | null; // null exactly when projected is null
  readonly rangeCode: ProjectionRangeCode | null;
}
export interface NetWorthPath {
  readonly rate: Percent;
  readonly withoutPurchase: readonly (MinorUnits | null)[]; // a point is null when it is out of range (ME-01)
  readonly withPurchase: readonly (MinorUnits | null)[];
  readonly rangeCode: ProjectionRangeCode | null; // 'exceeds_range' when any point of either path is null
} // index m = 0..horizonMonths
export interface InvestmentViews {
  readonly horizonMonths: number;
  readonly horizonSource: HorizonSource;
  readonly rates: readonly ProjectionRate[];
  readonly holdingFee: Percent; // D-63: input.holdingFee, ZERO_PERCENT when null
  readonly netRates: readonly NetProjectionRate[]; // D-63: one per `rates` entry, same order; every byRate figure below keeps `rate` = the entered rate and is projected at its net rate
  readonly priceInvested: {
    readonly lump: MinorUnits;
    readonly byRate: readonly RateFigure[];
  }; // (a)
  readonly paymentsInvested: {
    readonly firstMonthPayment: MinorUnits;
    readonly paymentMonths: number;
    readonly monthlyRunning: MinorUnits;
    readonly byRate: readonly RateFigure[];
  }; // (b)
  readonly pauseImpact: {
    readonly pausedMonthly: MinorUnits;
    readonly byRate: readonly RateFigure[];
  } | null; // (c) null when nothing is paused
  readonly netWorth: readonly NetWorthPath[]; // (d)
}

// ── Income at risk (D-54) ──
export interface SetbackBasis {
  readonly incomeBasis: MinorUnits;
  readonly burn: MinorUnits;
  readonly monthCosts: MinorUnits;
}
export interface SetbackAtRisk {
  readonly code: SetbackCode;
  readonly enabled: boolean;
  readonly cashAfterWith: MinorUnits;
  readonly cashAfterWithout: MinorUnits;
  readonly paymentsMet: boolean; // cashAfterWith >= 0: the new payments can still be made from cash through the setback
  readonly breaksBecauseOfPurchase: boolean; // cashAfterWithout >= 0 && cashAfterWith < 0
  readonly runwayWith: number | null;
  readonly runwayWithout: number | null;
  readonly runwayLost: number | null;
}
export interface IncomeAtRiskReport {
  readonly runwayWith: number | null;
  readonly runwayWithout: number | null;
  readonly runwayLost: number | null;
  readonly setbacks: readonly SetbackAtRisk[];
}

// ── Estimate bias (D-56) ──
export type EstimateFigure = 'day_one' | 'monthly_payment' | 'running_costs';
export interface DecisionFigures {
  readonly dayOne: MinorUnits;
  readonly monthlyPayment: MinorUnits;
  readonly runningCosts: MinorUnits;
}
export interface DecisionActuals {
  readonly dayOne: MinorUnits | null;
  readonly monthlyPayment: MinorUnits | null;
  readonly runningCosts: MinorUnits | null;
}
// D-62: estimates and actuals are in `currency`, which must be the check's home currency; the Phase 5 builder converts
// first (05 D-37/D-39) and estimateBias rejects any other code
export interface PastDecision {
  readonly id: string;
  readonly currency: CurrencyCode;
  readonly estimate: DecisionFigures;
  readonly actual: DecisionActuals;
}
export interface EstimateBias {
  readonly figure: EstimateFigure;
  readonly decisionsUsed: number;
  readonly biasBasisPoints: number | null; // signed; + means actuals came in higher; null below ESTIMATE_BIAS_MIN_DECISIONS
}
