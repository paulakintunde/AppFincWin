/**
 * v3 Decide contract (05.1). Interface-first: later slices implement against these shapes.
 * Money is MinorUnits (a branded safe-integer number); arithmetic is bigint inside functions, back through
 * minorFromBigInt. Engine emits codes only, never English.
 *
 * Type-only file: no runtime code.
 */
import type { CurrencyCode, MinorUnits } from '../../money/types';
import type { Percent } from '../../payoff/types';
import type { ShareScope, ResolvedShare } from '../share';
import type { ItemType } from '../cardRule';

export type LocalDate = string; // 'YYYY-MM-DD'
export type YearMonth = string; // 'YYYY-MM'
export interface Cadence { readonly unit: 'week' | 'month'; readonly every: number } // every 1..12 (D-01, D-19)
export type V3PresetItemType = ItemType | 'electronics' | 'subscription' | 'emergency_repair';
export type ItemTypeRef = { readonly kind: 'preset'; readonly value: V3PresetItemType } | { readonly kind: 'custom'; readonly id: string };
export type PresetPurpose = 'invest_in_me' | 'for_work' | 'necessity' | 'nice_to_have' | 'treat' | 'luxury';
export type Purpose = { readonly kind: 'preset'; readonly value: PresetPurpose } | { readonly kind: 'custom'; readonly id: string };
export type QuestionId = string;
export interface OwnQuestion { readonly id: string; readonly label: string; readonly cadence: 'monthly' | 'yearly' | 'one_off'; readonly cash: boolean } // D-19; the label never reaches a calculation
export interface CustomItemType { readonly id: string; readonly base: V3PresetItemType; readonly questionIds: readonly QuestionId[]; readonly ownQuestions: readonly OwnQuestion[] } // ownQuestions <= 3 (D-19); amounts are typed in CheckV2.extras keyed by OwnQuestion.id
export type PresetIncomeKind = 'salary' | 'commission' | 'side_business' | 'dividends' | 'interest' | 'rent' | 'family' | 'other';
export type IncomeKind = { readonly kind: 'preset'; readonly value: PresetIncomeKind } | { readonly kind: 'custom'; readonly id: string };
export type CountsAs = 'available' | 'kept' | null; // null = not marked: does not count (v3 §4.2)
export interface CustomOptions { readonly itemTypes: readonly CustomItemType[]; readonly purposes: readonly { readonly id: string }[]; readonly cadences: readonly Cadence[]; readonly incomeKinds: readonly { readonly id: string; readonly countsAs: CountsAs }[] } // D-19, <= 10 each; names never reach the engine
export type SeriesStatus = 'live' | 'ended' | 'dismissed'; // D-21: ended keeps the past; dismissed = "It was never regular" (D-25)
export type TypicalChoice = 'monthly' | 'excluded' | null; // D-03, null = not yet chosen
export type SeriesRole = 'pay' | 'other_income' | 'bill' | 'debt_payment' | 'saving' | 'investing';
export interface V3Series { readonly id: string; readonly role: SeriesRole; readonly cadence: Cadence; readonly anchorDate: LocalDate; readonly endDate: LocalDate | null; readonly amount: MinorUnits; readonly status: SeriesStatus; readonly confirmed: boolean; readonly payGroup: string | null; readonly countsAs: CountsAs; readonly incomeKind: IncomeKind | null; readonly typicalChoice: TypicalChoice; readonly categoryId: string | null; readonly isHousing: boolean; readonly savingMode: 'fixed' | 'flexible' | null }
export interface RecurringCandidate { readonly key: string; readonly name: string; readonly direction: 'in' | 'out'; readonly cadence: Cadence; readonly anchorDate: LocalDate; readonly amount: MinorUnits; readonly rowIds: readonly string[]; readonly payGroupKey: string | null }
export type LineRole = 'income' | 'spending' | 'refund' | 'debt_payment' | 'saved_invested' | 'other_in' | 'other_out' | 'own_transfer' | 'envelope_deposit' | 'envelope_withdrawal' | 'emergency_move'; // envelope_* = money into / out of an envelope or savings goal (D-22 stand-in until Grow)
export interface V3Line { readonly id: string; readonly date: LocalDate; readonly amount: MinorUnits; readonly role: LineRole; readonly status: 'paid' | 'pending'; readonly seriesId: string | null; readonly categoryId: string | null; readonly coversMonths: number | null; readonly expected: boolean; readonly incomeKind: IncomeKind | null; readonly countsAs: CountsAs }
export type MonthMark = 'normal' | 'out' | 'half' | null; // null = not reviewed by the user
export interface V3Month { readonly month: YearMonth; readonly full: boolean; readonly mark: MonthMark; readonly lines: readonly V3Line[] }
export type IncomeType = 'salary' | 'commission' | 'freelance' | 'none' | 'mix';
export type VariableMethod = 'match' | 'spread' | 'steady' | 'balance';
export interface IncomeProfile { readonly types: readonly IncomeType[]; readonly variable: VariableMethod | null; readonly steady: MinorUnits | null; readonly billsHorizonMonths: 1 | 2 | 3 | null }
export interface RoughFigures { readonly income: MinorUnits; readonly expenses: MinorUnits; readonly saving: MinorUnits; readonly debt: MinorUnits; readonly invest: MinorUnits; readonly asOf: LocalDate }
export interface UnspentAnchor { readonly amount: MinorUnits; readonly at: LocalDate }
export interface EmergencyFund { readonly amount: MinorUnits }
export interface Envelope { readonly id: string; readonly kind: 'pot' | 'wait'; readonly target: MinorUnits | null; readonly monthlyAmount: MinorUnits | null; readonly readyBy: LocalDate | null; readonly saved: MinorUnits; readonly purposeId: string | null } // structurally a PotInput plus purposeId
export interface V3Debt { readonly id: string; readonly kind: 'loan' | 'card' | 'other'; readonly balance: MinorUnits; readonly minimum: MinorUnits; readonly apr: Percent | null; readonly secured: boolean; readonly isHousing: boolean }
export type LineSpec =
  | { readonly kind: 'housing_share'; readonly pct: Percent }
  | { readonly kind: 'debt_share'; readonly pct: Percent }
  | { readonly kind: 'unsecured_multiple'; readonly times: number }
  | { readonly kind: 'category_monthly_cap'; readonly categoryId: string; readonly cap: MinorUnits }
  | { readonly kind: 'single_purchase_cap'; readonly cap: MinorUnits }
  | { readonly kind: 'category_income_share'; readonly categoryId: string; readonly pct: Percent }
  | { readonly kind: 'unspent_floor'; readonly floor: MinorUnits };
export interface LimitLine { readonly id: string; readonly on: boolean; readonly source: 'builtin' | 'own' | 'legacy'; readonly spec: LineSpec }
export interface Limits { readonly lines: readonly LimitLine[] } // D-10..D-13: <= 3 builtin + <= 5 own
export interface HomeThresholds { readonly bandEdges: readonly MinorUnits[]; readonly unspentDrift: MinorUnits; readonly quotedTolerance: MinorUnits; readonly source: 'table' | 'fallback' | 'missing' } // D-06, D-07, D-26; bandEdges [] when source 'missing'
export interface V3Inputs { readonly asOf: LocalDate; readonly currency: CurrencyCode; readonly region: string | null; readonly months: readonly V3Month[]; readonly series: readonly V3Series[]; readonly dismissedKeys: readonly string[]; readonly profile: IncomeProfile | null; readonly rough: RoughFigures | null; readonly balance: MinorUnits; readonly unspent: UnspentAnchor | null; readonly emergency: EmergencyFund | null; readonly envelopes: readonly Envelope[]; readonly debts: readonly V3Debt[]; readonly everydayOverride: MinorUnits | null; readonly limits: Limits; readonly custom: CustomOptions; readonly thresholds: HomeThresholds; readonly unsavedWrites: number; readonly provisionalRates: boolean }
export type FirstPayment = { readonly kind: 'today' } | { readonly kind: 'one_period' } | { readonly kind: 'deferred'; readonly firstDate: LocalDate; readonly interestDuringPause: boolean | null }; // D-04, D-24
export interface PlanFees { readonly setup: MinorUnits; readonly perPeriod: MinorUnits; readonly end: MinorUnits }
export type PayV2 = { readonly mode: 'once' } | { readonly mode: 'plan'; readonly cadence: Cadence; readonly count: number | null; readonly termMonths: number | null; readonly apr: Percent | null; readonly fees: PlanFees; readonly deposit: MinorUnits; readonly tradeIn: MinorUnits; readonly quotedPayment: MinorUnits | null; readonly firstPayment: FirstPayment | null; readonly deferredInterestTerm: boolean };
export interface CheckValue { readonly earnsMonthly: MinorUnits | null; readonly savesMonthly: MinorUnits | null; readonly useYears: number | null; readonly cheaperPrice: MinorUnits | null }
export interface CheckV2 { readonly v: 2; readonly legacyKind: 'buy' | 'invest'; readonly price: MinorUnits | null; readonly taxPercent: Percent | null; readonly oneOffFees: MinorUnits; readonly itemType: ItemTypeRef; readonly categoryId: string | null; readonly purpose: Purpose | null; readonly emergency: boolean; readonly envelopeId: string | null; readonly pay: PayV2; readonly extras: Readonly<Record<QuestionId, MinorUnits>>; readonly value: CheckValue; readonly share: ShareScope; readonly foreign: { readonly currency: CurrencyCode; readonly atTodaysRate: true } | null; readonly layerAnswers: Readonly<Record<string, unknown>> }
// SHARE CONVENTION: a Schedule is always on the FULL lender amount (so D-05 matches the lender to the cent). myPart is applied exactly once, to Purchase.dayOne, Purchase.monthly (M) and the cash-path flows.
export interface Schedule { readonly cadence: Cadence; readonly count: number; readonly payment: MinorUnits; readonly finalPayment: MinorUnits; readonly lastPaying: number; readonly firstDate: LocalDate; readonly financed: MinorUnits; readonly pauseInterest: MinorUnits; readonly totalPaid: MinorUnits; readonly totalInterest: MinorUnits; readonly fees: PlanFees; readonly monthlyEquivalent: MinorUnits; readonly source: 'computed' | 'quoted' | 'from_quote' }
export type ConfidenceLevel = 'rough' | 'fair' | 'firm';
export type ConfidenceReason = 'few_months' | 'early_in_month' | 'under_logged' | 'unsaved_changes' | 'unspent_stale' | 'unspent_drifted' | 'rough_figures' | 'provisional_rates' | 'no_setup';
export interface Confidence { readonly level: ConfidenceLevel; readonly reasons: readonly ConfidenceReason[] }
export type Code = 'needs_input' | 'not_yet' | 'monthly_short' | 'emergency_use' | 'fits_unspent' | 'fits_month';
export type Variant = 'payday' | 'not_covered' | 'low_month';
export type LegacyState = 'fits' | 'adjust' | 'no' | 'missing';
export type MissingCode = 'no_income_figures' | 'unspent_not_confirmed' | 'records_look_behind' | 'no_price' | 'plan_count_missing' | 'first_payment_not_chosen' | 'pause_interest_not_answered' | 'plan_rate_missing' | 'everyday_unknown' | 'legacy_invest_check' | 'share_invalid';
export type ReasonCode = 'band_currency_fallback' | 'band_rate_missing' | 'typical_choice_defaulted' | 'custom_option_missing' | 'income_kind_unmarked' | 'missed_pay_excluded' | 'month_excluded_marked' | 'month_excluded_under_logged' | 'rough_figures_used' | 'everyday_override_used' | 'quote_used_no_rate' | 'exceeds_range' | 'legacy_upgraded' | 'legacy_method_mapped';
export type NoticeCode = 'typical_short' | 'month_heading_short' | 'unspent_stale' | 'unspent_drifted' | 'emergency_not_set' | 'unsaved_changes' | 'yearly_bill_choice_needed' | 'month_looks_under_logged' | 'income_kind_unmarked' | 'from_your_figures'; // from_your_figures: D-32
export type FactCode = 'month_left_after' | 'unspent_before_after' | 'emergency_untouched' | 'emergency_used' | 'envelope_used' | 'line_crossed' | 'plan_total' | 'quoted_differs' | 'implied_rate' | 'deferred_interest_term' | 'at_todays_rate' | 'low_month';
export type CodeValues = Readonly<Record<string, number | string | null>>; // JSON-safe: no bigint
export interface Notice { readonly code: NoticeCode; readonly values: CodeValues }
export interface Fact { readonly code: FactCode; readonly values: CodeValues }
export interface IncomeThisMonth { readonly received: MinorUnits; readonly dueConfirmed: MinorUnits; readonly total: MinorUnits; readonly reasons: readonly ReasonCode[] }
export interface LowMonth { readonly left: MinorUnits; readonly month: YearMonth; readonly reason: 'second_lowest' | 'lowest' | 'only_month' }
export interface MonthModel { readonly month: YearMonth; readonly day: number; readonly daysInMonth: number; readonly moneyIn: MinorUnits; readonly moneyOut: MinorUnits; readonly billsPaid: MinorUnits; readonly billsDue: MinorUnits; readonly everydayLogged: MinorUnits; readonly erest: MinorUnits; readonly setAside: MinorUnits; readonly monthLeft: MinorUnits; readonly e: MinorUnits | null; readonly typicalIncome: MinorUnits; readonly recurringBills: MinorUnits; readonly typicalLeft: MinorUnits | null; readonly low: LowMonth | null; readonly monthsUsed: readonly YearMonth[]; readonly categoryMonthly: readonly { readonly categoryId: string; readonly amount: MinorUnits }[]; readonly housingMonthly: MinorUnits; readonly largestLine: { readonly categoryId: string | null; readonly amount: MinorUnits } | null; readonly confidence: Confidence; readonly notices: readonly Notice[]; readonly reasons: readonly ReasonCode[] }
export interface UnspentBreakdown { readonly in: MinorUnits; readonly everyday: MinorUnits; readonly bills: MinorUnits; readonly loans: MinorUnits; readonly investedSaved: MinorUnits; readonly other: MinorUnits } // D-22 + D-31: six lines. Signed: investedSaved = deposits - withdrawals (envelopes, savings goals, saving/investing); other = other_in - other_out
export interface UnspentState { readonly value: MinorUnits; readonly anchor: UnspentAnchor; readonly rolled: boolean; readonly stale: boolean; readonly drifted: boolean; readonly breakdown: UnspentBreakdown }
export interface Funds { readonly balance: MinorUnits; readonly suggested: MinorUnits; readonly unspent: UnspentState | null; readonly emergency: MinorUnits | null; readonly envelopesSaved: MinorUnits; readonly envelopesMonthly: MinorUnits; readonly ownEnvelope: MinorUnits }
export type Band = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;
export type Layer = 'L0' | 'L1p' | 'L1e' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | 'L7';
export interface Purchase { readonly whole: MinorUnits; readonly dayOne: MinorUnits; readonly monthly: MinorUnits; readonly runningMonthly: MinorUnits; readonly schedule: Schedule | null; readonly share: ResolvedShare; /* whole, dayOne, monthly, runningMonthly are MY share; schedule is the full lender amount */ readonly itemType: V3PresetItemType; readonly purpose: Purpose | null; readonly emergency: boolean; readonly canUseEmergency: boolean; readonly band: Band; readonly layers: readonly Layer[]; readonly financed: boolean; readonly secured: boolean; readonly categoryId: string | null; readonly envelopeId: string | null }
export type FundingSource = 'month' | 'unspent_earlier' | 'envelope' | 'emergency';
export interface FundingSegment { readonly source: FundingSource; readonly amount: MinorUnits }
export type ReadyBy = { readonly kind: 'date'; readonly date: LocalDate } | { readonly kind: 'month'; readonly month: YearMonth };
export interface Result { readonly code: Code; readonly variant: Variant | null; readonly legacyState: LegacyState; readonly split: readonly FundingSegment[]; readonly facts: readonly Fact[]; readonly notices: readonly Notice[]; readonly missing: readonly MissingCode[]; readonly reasons: readonly ReasonCode[]; readonly readyBy: ReadyBy | null; readonly band: Band | null; readonly layers: readonly Layer[]; readonly confidence: Confidence; readonly parts: { readonly oneOff: Code; readonly monthly: Code | null } }
