/**
 * v3 Decide contract (05.1). FIXED after 05.1-16 (UP §7.1). Changes after this point need a note in the plan SUMMARY
 * and a 05.2/05.3 heads-up. Interface-first: later slices implement against these shapes.
 * Reopened for 05.1 gap closure (05.1-CONTEXT D-33..D-45, 05.1-33): additive optional fields only.
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
export interface V3Series { readonly id: string; readonly role: SeriesRole; readonly cadence: Cadence; readonly anchorDate: LocalDate; readonly endDate: LocalDate | null; readonly amount: MinorUnits; readonly status: SeriesStatus; readonly confirmed: boolean; readonly payGroup: string | null; readonly countsAs: CountsAs; readonly incomeKind: IncomeKind | null; readonly typicalChoice: TypicalChoice; readonly categoryId: string | null; readonly isHousing: boolean; readonly savingMode: 'fixed' | 'flexible' | null; readonly name?: string | null /* 05.3-54 D-24: display name for readiness items only */ }
export interface RecurringCandidate { readonly key: string; readonly name: string; readonly direction: 'in' | 'out'; readonly cadence: Cadence; readonly anchorDate: LocalDate; readonly amount: MinorUnits; readonly rowIds: readonly string[]; readonly payGroupKey: string | null }
export type LineRole = 'income' | 'spending' | 'refund' | 'debt_payment' | 'saved_invested' | 'other_in' | 'other_out' | 'own_transfer' | 'envelope_deposit' | 'envelope_withdrawal' | 'emergency_move'; // envelope_* = money into / out of an envelope or savings goal (D-22 stand-in until Grow)
export interface V3Line { readonly source?: 'manual' | 'statement'; /* D-51: absent = manual; 'statement' = imported or synced statement line */ readonly id: string; readonly date: LocalDate; readonly amount: MinorUnits; readonly role: LineRole; readonly status: 'paid' | 'pending'; readonly seriesId: string | null; readonly categoryId: string | null; readonly coversMonths: number | null; readonly expected: boolean; readonly incomeKind: IncomeKind | null; readonly countsAs: CountsAs; readonly refundOf?: string | null /* 05.2 D-06..D-08: id of the purchase line this refund is linked to; absent/null = not linked */; readonly name?: string | null /* 05.3-54 D-24: display name for readiness items only */ }
export type MonthMark = 'normal' | 'out' | 'half' | null; // null = not reviewed by the user
export interface V3Month { readonly month: YearMonth; readonly full: boolean; readonly mark: MonthMark; readonly lines: readonly V3Line[] }
export type IncomeType = 'salary' | 'commission' | 'freelance' | 'none' | 'mix';
export type VariableMethod = 'match' | 'spread' | 'steady' | 'balance';
export type IncomePattern = 'steady' | 'variable' | 'seasonal'; // D-34: stated by the user
export interface IncomeProfile { readonly types: readonly IncomeType[]; readonly variable: VariableMethod | null; readonly steady: MinorUnits | null; readonly billsHorizonMonths: 1 | 2 | 3 | null; readonly pattern?: IncomePattern | null; readonly patternConfirmed?: boolean } // pattern absent/null = not said (D-34); patternConfirmed = the user answered the swing question and their stated pattern stands
export interface ExpectedMonthIncome { readonly month: YearMonth; readonly amount: MinorUnits; readonly at: LocalDate } // D-35: confirmed expected income for one month, used as given, never guessed
export interface HeldBridge { readonly id: string; readonly amount: MinorUnits } // D-38: unspent money spoken for by an earlier plan's lean-month bridge
export type AccountUse = { readonly kind: 'everyday' } | { readonly kind: 'mixed'; readonly extraSetAside: MinorUnits | null } | { readonly kind: 'dedicated'; readonly purpose: { readonly kind: 'emergency' } | { readonly kind: 'envelope'; readonly envelopeId: string } } | { readonly kind: 'untouched' }; // D-54, D-55
/**
 * use null = not stated (not counted, asked first). 05.4 FIN-03 (D-26..D-28, D-36..D-38): only a checking or current account has
 * an overdraft; its limit and rate come from the account, and a null limit counts as 0 (D-28). Cards use their credit limit from
 * Grow debts, never an overdraft. kind absent or null = not stated (no overdraft).
 */
export type AccountKind = 'checking' | 'current' | 'savings' | 'card' | 'other';
export interface V3Account { readonly id: string; readonly balance: MinorUnits; readonly use: AccountUse | null; readonly kind?: AccountKind | null; readonly overdraftLimit?: MinorUnits | null; readonly overdraftRate?: Percent | null; /* 05.4 ENG-17 (D-114): true = no exchange rate converts its balance, so it counts nowhere (prepare drops it) and notice account_no_rate names it; absent/false = converted */ readonly noRate?: boolean }
export type UnexplainedUse = 'spare' | 'envelope_or_goal' | 'set_aside_for_bill' | 'someone_elses';
export interface UnexplainedAnswer { readonly amount: MinorUnits; readonly use: UnexplainedUse; readonly at: LocalDate } // D-50; stored and reused by 05.2
export interface PayArrival { readonly seriesId: string; readonly date: LocalDate; readonly arrived: boolean } // D-58
export interface TypedEstimates { readonly income: MinorUnits; readonly expenses: MinorUnits; readonly saving: MinorUnits; readonly debt: MinorUnits; readonly invest: MinorUnits; readonly asOf: LocalDate; /* 05.4-57 ENG11-QE-ESSENTIAL: the part of the everyday estimate spent on essentials; absent/null = all of it (today's rule). The app's quick-estimates sheet does not ask it yet (08.1). */ readonly essential?: MinorUnits | null }
/** 05.4 FIN-11 (D-47): one yearly or every-3-month bill: its built-up share and the part held back from spare money. */
export interface BillHeldBack { readonly seriesId: string; readonly amount: MinorUnits; readonly builtUp: MinorUnits; readonly holdBack: MinorUnits; readonly dueDate: LocalDate }
export interface BillsHeldBack { readonly total: MinorUnits; readonly parts: readonly BillHeldBack[] }
export interface UnspentAnchor { readonly amount: MinorUnits; readonly at: LocalDate }
export interface EmergencyFund { readonly amount: MinorUnits; readonly accountId?: string | null }
/**
 * 05.4 FIN-01 / ENG-03 (D-05, D-06, D-35): the safety net. protect: protection is on (the default when no record exists). size: the
 * size the user set, any size, however small (D-05); null = the starter, 1 month of essential costs (ARC-07). saved: money already
 * in the net. Only money already saved is protected: the floor is min(saved, size); money saved above the size is spare (D-35).
 * A size of 0 is treated exactly like protection off (D-06).
 */
export interface SafetyNet { readonly protect: boolean; readonly size: MinorUnits | null; readonly saved: MinorUnits; /* 05.4 D-61: absent = locked; unlocked only in Decide settings, with a confirm step (08.1) */ readonly locked?: boolean }
export interface Envelope { readonly id: string; readonly kind: 'pot' | 'wait'; readonly target: MinorUnits | null; readonly monthlyAmount: MinorUnits | null; readonly readyBy: LocalDate | null; readonly saved: MinorUnits; readonly purposeId: string | null; readonly accountId?: string | null; readonly bucket?: boolean /* 05.2 D-23: a saving bucket carved out of regular saving */; readonly name?: string | null /* 05.3-54 D-24: display name for readiness items only */; readonly locked?: boolean /* 06 D-05, D-22: absent = locked with no new fact (legacy); true = locked and named; false = unlocked, counted as spare */; readonly planMonthly?: MinorUnits | null /* 06 P4-CR-03: a Grow goal's stated monthly amount; above 0 on a 'pot' with a target it is the set-aside (capped at what remains) instead of the readyBy split; absent/null/0 = as before (potTypes.ts) */ } // structurally a PotInput plus purposeId
/**
 * 05.4 FIN-04 / FIN-10 / FIN-14 (05.4-20). dueDay: day of the month the minimum is due, 1..31 (cut to the month's last day); absent
 * or null = not set, so the earliest likely day (tomorrow) is used (DB-02). joint: in two names (FIN-14). paidThisMonth: already paid
 * toward this month's minimum (DB-10); absent = 0. seriesId: the bill or debt-payment series that pays it, so it is counted once (DB-03,
 * DB-07); absent or null = none linked (a live debt-payment series of the same amount is then read as its payment).
 */
export interface V3Debt { readonly id: string; readonly kind: 'loan' | 'card' | 'other'; readonly balance: MinorUnits; readonly minimum: MinorUnits; readonly apr: Percent | null; readonly secured: boolean; readonly isHousing: boolean; readonly dueDay?: number | null; readonly joint?: boolean; readonly paidThisMonth?: MinorUnits; readonly seriesId?: string | null }
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
export interface V3Inputs { readonly asOf: LocalDate; readonly currency: CurrencyCode; readonly region: string | null; readonly months: readonly V3Month[]; readonly series: readonly V3Series[]; readonly dismissedKeys: readonly string[]; readonly profile: IncomeProfile | null; readonly typedEstimates: TypedEstimates | null; readonly balance: MinorUnits; readonly unspent: UnspentAnchor | null; readonly emergency: EmergencyFund | null; readonly envelopes: readonly Envelope[]; readonly debts: readonly V3Debt[]; readonly everydayOverride: MinorUnits | null; readonly limits: Limits; readonly custom: CustomOptions; readonly thresholds: HomeThresholds; readonly unsavedWrites: number; readonly provisionalRates: boolean; readonly expectedIncome?: readonly ExpectedMonthIncome[]; readonly heldBridges?: readonly HeldBridge[]; readonly accounts?: readonly V3Account[]; readonly unexplainedAnswer?: UnexplainedAnswer | null; readonly payArrivals?: readonly PayArrival[]; /* 05.2 two-date refunds: the months as logged, before refund re-dating. Set only by the evaluate pre-pass (withRedatedRefunds) when a refund moved; callers leave it absent. rollForward counts cash after the anchor from these. */ readonly loggedMonths?: readonly V3Month[]; /* 05.3-54 D-24, D-28: the user's readiness answers and the occurrences marked skipped; absent = none */ readonly waivers?: readonly ReadinessWaiver[]; readonly skipped?: readonly SkippedOccurrence[]; /* 05.4 ENG-14: when the records last synced (the cached data's date); absent/null = unknown, the freshness rule never applies */ readonly recordsAsOf?: LocalDate | null; /* 05.4 FIN-01 (D-35): absent/null = no record: protection on, the starter size, saved = the emergency fund (or 0) */ readonly safetyNet?: SafetyNet | null; /* 05.4 ARC-07: categories the user marked essential; absent/empty = none marked (typical everyday spending counts as essential) */ readonly essentialCategoryIds?: readonly string[]; /* 05.4 D-08 (FIN-10): the debt and housing fact lines; absent = on. Facts only: never the code, the variant or a caution's own facts (I-DB05) */ readonly factLines?: boolean; /* 05.4 FIN-07: the money-left-each-month line the user set; absent/null = none, so the tight floor is a tenth of a usual month's bills plus everyday spending. No existing limit line says this (unspent_floor is about unspent money, not each month), so nothing maps into it yet (08.1 screens, 05.5 builder) */ readonly tightLine?: MinorUnits | null; /* 05.4 FIN-27 (D-19, D-20): the state or province (ISO 3166-2 code, e.g. 'CA' for California with region 'US'); region stays the country. absent/null = not set: the US and Canada then add no tax and say so (tax_not_included) */ readonly regionSubdivision?: string | null }
export type FirstPayment = { readonly kind: 'today' } | { readonly kind: 'one_period' } | { readonly kind: 'deferred'; readonly firstDate: LocalDate; readonly interestDuringPause: boolean | null }; // D-04, D-24
export interface PlanFees { readonly setup: MinorUnits; readonly perPeriod: MinorUnits; readonly end: MinorUnits }
export type PayV2 = { readonly mode: 'once' } | { readonly mode: 'plan'; readonly cadence: Cadence; readonly count: number | null; readonly termMonths: number | null; readonly apr: Percent | null; readonly fees: PlanFees; readonly deposit: MinorUnits; readonly tradeIn: MinorUnits; readonly quotedPayment: MinorUnits | null; readonly firstPayment: FirstPayment | null; readonly deferredInterestTerm: boolean; /* 05.4-22 D-39c: a mortgage or other home loan; skips the 10%-of-amount interest test; absent = false */ readonly housing?: boolean };
export interface CheckValue { readonly earnsMonthly: MinorUnits | null; readonly savesMonthly: MinorUnits | null; readonly useYears: number | null; readonly cheaperPrice: MinorUnits | null }
export interface CheckV2 { readonly v: 2; readonly legacyKind: 'buy' | 'invest'; readonly price: MinorUnits | null; readonly taxPercent: Percent | null; readonly oneOffFees: MinorUnits; readonly itemType: ItemTypeRef; readonly categoryId: string | null; readonly purpose: Purpose | null; readonly emergency: boolean; readonly envelopeId: string | null; readonly pay: PayV2; readonly extras: Readonly<Record<QuestionId, MinorUnits>>; readonly value: CheckValue; readonly share: ShareScope; readonly foreign: { readonly currency: CurrencyCode; readonly atTodaysRate: true } | null; readonly layerAnswers: Readonly<Record<string, unknown>>; readonly volatileCover?: boolean | null /* D-48: the user's answer to "Can you cover $X a month for N months, even in your low months?"; absent/null = not answered */; /* 05.4 FIN-27 (D-19): the "Price already includes tax" switch. true = no tax is added, whatever the region or a typed rate; absent/null/false = taxPercent if typed, else the region's default (tax/lookup.ts) */ readonly taxIncluded?: boolean | null; /* 05.4 BO-05 (05.4-26, VC-02): the item's running costs, each on its own dates (fullCost/runningCosts.ts); absent = none */ readonly runningCosts?: readonly RunningCostLine[]; /* 05.4 BO-05: home closing costs as a % of the price, paid up front (fullCost/closingCosts.ts); absent/null = none */ readonly closingPercent?: Percent | null; /* 05.4 BO-05 / D-42: the day it is to be bought (fullCost/purchaseDate.ts); absent/null, invalid or before asOf = today (asOf) */ readonly purchaseDate?: LocalDate | null; /* 05.4 BO-05 (05.4-27, VC-02): what the purchase replaces, costs that stop and a sale of the old one (fullCost/replaces.ts); absent/null = nothing */ readonly replaces?: Replaces | null }
/**
 * 05.4 BO-05 (05.4-26, Variant C, VC-02): one running cost of the item: amount (full, before my share) every 1, 3 or 12 months, from its
 * own start date until its end date (inclusive; null = no end). on = false is a line the user switched off (FIN-28): never counted.
 */
/**
 * 05.4 BO-05 (05.4-27): a cost the purchase stops. A bill stop names a recorded bill series and uses its own amount and dates (D-104;
 * the typed amount and cadence are what the screen pre-fills); an everyday stop lowers usual spending from the first month that starts
 * after stopDate (D-103). A due on or before stopDate is still counted.
 */
export interface StoppedCost { readonly id: string; readonly amount: MinorUnits; readonly everyMonths: 1 | 3 | 12; readonly stopDate: LocalDate; readonly source: { readonly kind: 'bill'; readonly seriesId: string } | { readonly kind: 'everyday'; readonly categoryId: string | null } }
/** 05.4 BO-05 (05.4-27): selling the old one. paysDebtId: a recorded debt the sale pays first (up to what is owed); the rest reaches the account on `arrives`. A sale dated before asOf is not counted (D-105). */
export interface Sale { readonly amount: MinorUnits; readonly arrives: LocalDate; readonly paysDebtId: string | null }
export interface Replaces { readonly stops: readonly StoppedCost[]; readonly sale: Sale | null }
export interface RunningCostLine { readonly id: string; readonly amount: MinorUnits; readonly everyMonths: 1 | 3 | 12; readonly start: LocalDate; readonly end: LocalDate | null; readonly on: boolean }
// SHARE CONVENTION: a Schedule is always on the FULL lender amount (so D-05 matches the lender to the cent). myPart is applied exactly once, to Purchase.dayOne, Purchase.monthly (M) and the cash-path flows.
export interface Schedule { readonly cadence: Cadence; readonly count: number; readonly payment: MinorUnits; readonly finalPayment: MinorUnits; readonly lastPaying: number; readonly firstDate: LocalDate; readonly financed: MinorUnits; readonly pauseInterest: MinorUnits; readonly totalPaid: MinorUnits; readonly totalInterest: MinorUnits; readonly fees: PlanFees; readonly monthlyEquivalent: MinorUnits; readonly source: 'computed' | 'quoted' | 'from_quote'; /* 05.4 D-138: the total interest before any rounding, as a share of the amount borrowed, in whole basis points rounded down (so share >= any whole-bp line exactly when this is); set on a computed schedule, absent once a quote sets the payment */ readonly exactInterestBp?: number }
// 05.4 FIN-25 / ENG-10: reasons with their numbers replace a confidence level (settled dispute 3: no hidden score). close_to_line is
// declared here with its weight and audience; the tight rule (FIN-07, 05.4-21) emits it.
export type ConfidenceReason = 'few_months' | 'early_in_month' | 'under_logged' | 'unspent_stale' | 'unspent_drifted' | 'quick_estimates' | 'provisional_rates' | 'no_setup' | 'user_said_cover' | 'pay_missed' | 'close_to_line';
/** ENG-18: 'answer' = the reason can change the answer, so it is always shown; 'detail' = it only lowers how much the answer rests on. */
export type ReasonAudience = 'answer' | 'detail';
export interface ReasonItem { readonly code: ConfidenceReason; readonly numbers: Readonly<Record<string, number>>; readonly weight: number; readonly audience: ReasonAudience }
/**
 * UX-04 / CMP-F12: what the answer is based on, for the one plain sentence under it. Never more confident than the answer (I46):
 * 'records' (the clean sentence) only when no 'answer' reason is present; 'records_with_reason' names the top one otherwise.
 */
export type Basis =
  | { readonly kind: 'quick_estimates' }
  | { readonly kind: 'partial'; readonly used: number; readonly lookedFor: number; readonly upTo: LocalDate }
  | { readonly kind: 'records'; readonly months: number; readonly upTo: LocalDate }
  | { readonly kind: 'records_with_reason'; readonly months: number; readonly upTo: LocalDate; readonly reason: ConfidenceReason };
/** The one thing the user can do that would let the answer rest on more. */
export type NextStepCode = 'add_records' | 'log_spending' | 'confirm_unspent' | 'record_pay' | 'finish_setup';
export interface NextStep { readonly reason: ConfidenceReason; readonly step: NextStepCode }
export interface Confidence { readonly reasons: readonly ReasonItem[]; readonly basis: Basis; readonly nextStep: NextStep | null }
// fits_uses_overdraft: 05.4 FIN-03 (D-26, D-36). fits_uses_net: 05.4 FIN-02 / ENG-04 (D-35, D-41), "Dips into your safety net".
// emergency_use stays a valid stored code for answers saved before 05.4; the v3 engine never returns it (D-41, D-49).
// fits_by_borrowing: 05.4 FIN-05 (D-07, D-39a), "Only by borrowing" (cash Not yet) or, variant borrowing_costs_more, "Fits, but borrowing costs more".
// fits_on_your_answer: 05.4 FIN-08 / CMP-F01 (05.4-23), "Only on your answer": the records alone do not show it fits; it rests on the user's yes.
export type Code = 'needs_input' | 'not_yet' | 'monthly_short' | 'fits_on_your_answer' | 'fits_by_borrowing' | 'fits_uses_overdraft' | 'emergency_use' | 'fits_uses_net' | 'fits_unspent' | 'fits_month';
// not_cleared: fits_uses_overdraft when the next pay leaves the account below 0 (D-36). protection_off: fits_uses_net with
// protection off or a $0 net (D-06). no_net / small_net: a fit while the net is empty or below its size (D-35).
export type Variant = 'payday' | 'not_covered' | 'low_month' | 'tight' | 'borrowing_costs_more' | 'not_cleared' | 'protection_off' | 'no_net' | 'small_net' | 'costly_debt' | 'extra_savings' | 'month_already_short' | 'month_short_small' | 'month_short_moderate' | 'month_short_moderate_extra'; // tight: 05.4 FIN-07 / D-40, "Fits, but tight each month" on a plan and "Fits, but tight" on a one-off (copy/verdictTable.ts picks the row). month_short_*: 05.4 D-65, the usual month is already short and a cash fit eats less than (small) / at least (moderate) one month of the money propping it up. extra_savings: 05.4 D-62, "Fits from extra savings" on fits_unspent. month_already_short: 05.4 D-63, the usual month is already short, on any answer but an ask. costly_debt: 05.4 D-39b, money saved in earlier months goes on a fit while a debt at 20% APR or more remains
export type LegacyState = 'fits' | 'adjust' | 'no' | 'missing';
export type MissingCode = 'no_income_figures' | 'unspent_not_confirmed' | 'records_look_behind' | 'no_price' | 'price_too_large' | 'plan_count_missing' | 'first_payment_not_chosen' | 'pause_interest_not_answered' | 'plan_rate_missing' | 'everyday_unknown' | 'legacy_invest_check' | 'share_invalid' | 'income_pattern_unconfirmed' | 'expected_income_needed' | 'first_payment_passed' | 'volatile_cover_question' | 'unexplained_money_question' | 'account_use_question' | 'pay_arrival_question';
export type ReasonCode = 'band_currency_fallback' | 'band_rate_missing' | 'typical_choice_defaulted' | 'custom_option_missing' | 'income_kind_unmarked' | 'missed_pay_excluded' | 'month_excluded_marked' | 'month_excluded_under_logged' | 'quick_estimates_used' | 'everyday_override_used' | 'quote_used_no_rate' | 'exceeds_range' | 'legacy_upgraded' | 'legacy_method_mapped' | 'long_history_window' | 'same_season_spending' | 'expected_income_used' | 'lean_months_used' | 'thin_history_stricter' | 'volatile_cover_declined' | 'records_synced' | 'debt_due_day_assumed' | 'pay_gap' | 'first_payment_later' | 'tax_not_included'; // tax_not_included: 05.4 FIN-27 (D-20), no rate typed, the switch off and the region unknown (or the US / Canada with no state or province), so no tax is added; the notice of the same name says so. first_payment_later: 05.4 FIN-09 (05.4-24, D-24), a plan's first payment falls after this month, so the month figure does not include it. pay_gap: 05.4 FIN-15 (05.4-23), a steady earner's last 3 pay arrivals sit more than 5% below the set-up pay (the pay_gap notice names it). records_synced: 05.4 ENG-14, a new month with no records yet judged on recently synced records. debt_due_day_assumed: 05.4 FIN-04 (DB-02), a minimum with no due day is counted as due tomorrow
export type NoticeCode = 'typical_short' | 'month_heading_short' | 'unspent_stale' | 'unspent_drifted' | 'emergency_not_set' | 'unsaved_changes' | 'yearly_bill_choice_needed' | 'month_looks_under_logged' | 'income_kind_unmarked' | 'from_your_figures' | 'income_from_expected' | 'pay_capped_expected' | 'same_season_compared' | 'history_window_12' | 'income_volatile' | 'envelope_location_assumed' | 'unexplained_money' | 'account_use_unknown' | 'pay_not_seen' | 'pay_counted_missed' | 'fund_account_unknown' | 'pay_expected_from_history' | 'pay_gap' | 'tax_not_included' | 'account_no_rate'; // account_no_rate: 05.4 ENG-17 (D-114) { account } an account with no exchange rate, left out of every sum. unsaved_changes: 05.4 APP-02 (D-113) no values, first. tax_not_included: 05.4 FIN-27 (D-20) "Tax not included. Set your region to add it.". pay_gap: 05.4 FIN-15 { setup, middle, gap }. from_your_figures: D-32. pay_expected_from_history: 05.4 D-52
export type FactCode = 'month_left_after' | 'unspent_before_after' | 'emergency_untouched' | 'net_used' | 'envelope_used' | 'line_crossed' | 'quoted_differs' | 'implied_rate' | 'deferred_interest_term' | 'at_todays_rate' | 'low_month' | 'lean_bridge' | 'unspent_held_back' | 'lean_months_judged' | 'low_month_judged' | 'rests_on_your_answer' | 'no_full_month' | 'overdraft_use' | 'overdraft_without_purchase' | 'overdraft_purchase_adds' | 'overdraft_not_cleared' | 'overdraft_cost_90d' | 'wait_clears' | 'overdraft_repeat' | 'other_account_overdrawn' | 'no_overdraft_limit' | 'ready_without_interest' | 'clearing_first' | 'net_left' | 'net_refill' | 'net_zero_is_off' | 'net_protection_off' | 'net_none_start' | 'net_progress' | 'net_above_size' | 'wait_keeps_net' | 'need_net_line' | 'bills_held_back' | 'yearly_bill_ahead' | 'net_locked' | 'extra_savings_used' | 'net_two_months' | 'move_money_by' | 'usual_month_short' | 'depletion_payment' | 'plan_makes_short' | 'price_over_net' | 'net_lasts' | 'net_lasts_without' | 'interest_is_a_cost' | 'balanced_month_room' | 'month_balance_gap' | 'month_short_fits' | 'money_lasts_shorter' | 'short_plan_from_cash' | 'debt_interest_cost' | 'debt_more' | 'housing_cost' | 'joint_loan_risk' | 'debt_due_day_assumed' | 'card_instead' | 'ask_debts_not_recorded' | 'tight_floor' | 'save_vs_borrow' | 'net_covers_surprises' | 'income_or_costs_first' | 'covered_from_savings' | 'further_shortfall_runway' | 'earlier_money_from' | 'overdraft_carried_in' | 'tax_estimate' | 'debt_left_after_sale' | 'sale_counted' | 'free_help' | 'locked_goals_kept' | 'net_and_goals_kept' | 'unlocked_goals_counted'; // locked_goals_kept, net_and_goals_kept, unlocked_goals_counted: 06 D-05/D-06/D-22, saved money in locked goals kept out { amount } / with the net { net, goals }; unlocked goals counted as spare { amount }. // free_help: 05.4 CMP-F04 (D-122..D-125, 05.4-38), a money-help pointer for the person's country on every answer whose usual month is short { country, name } (help/freeHelp.ts); placed last, never changes the answer (I76). // debt_left_after_sale, sale_counted: 05.4 BO-05 (05.4-27, D-106): what a debt still owes after the sale pays part of it { amount }; the sale an answer counts { amount, date }. // tax_estimate: 05.4 FIN-27 (D-19, CMP-F24), the region's usual rate was used { percent (decimal text), amount (the tax, full price), basis (TaxBasis) }; an estimate that can be changed. overdraft_carried_in: 05.4 D-86 (FIN-09b), the overdraft carried in from last month { month (last month), amount }, paid back from this month first. earlier_money_from: 05.4 D-44 (05.4-24), money left from earlier months that the purchase uses { amount, where: 'account' (spare money still in the everyday account) | 'savings' (extra savings above the safety net's size) }; spent money is never counted. covered_from_savings, further_shortfall_runway: 05.4 D-46 (05.4-23), how many payments savings carry a Short each month gap for, and with a further shortfall. save_vs_borrow, net_covers_surprises, income_or_costs_first: 05.4 FIN-05 / D-48 (05.4-22); income_or_costs_first is shared with D-46 (05.4-23). borrowing_costs_more (Variant): fits_by_borrowing when cash fits and the plan is expensive (D-39a). tight_floor: 05.4 FIN-07 / D-40, the floor a tight answer is under { floor, basis: 'user_line' | 'tenth' }. debt_interest_cost .. ask_debts_not_recorded: 05.4 FIN-04 / FIN-10 / FIN-14 (05.4-20; D-08, D-39b, D-43). short_plan_from_cash: 05.4 D-68: a short plan paid from money on hand. month_short_fits, money_lasts_shorter: 05.4 D-65 tier lines. usual_month_short .. month_balance_gap: 05.4 D-54 / D-60 / D-63; interest_is_a_cost is widened to every plan answer by 05.4-22 (D-48), do not add a twin. net_locked: 05.4 D-61. extra_savings_used, net_two_months: 05.4 D-56 / D-62. move_money_by: 05.4 D-58. net_used .. need_net_line: 05.4 FIN-01/FIN-02 (D-35, D-41). no_full_month: 05.4 FIN-25, the records hold no complete month yet. overdraft_use .. clearing_first: 05.4 FIN-03 (D-26..D-28, D-36..D-38). bills_held_back, yearly_bill_ahead: 05.4 FIN-11 (D-47)
// Value keys per code (M-03, 05.1-40). The runtime source is FACT_VALUE_KEYS and NOTICE_VALUE_KEYS in copy/verdictTable.ts;
// copyContract.test.ts keeps them in step with the en.ts copy. In short:
//   facts:   month_left_after {month, left}; unspent_before_after {before, after}; emergency_untouched {amount};
//            net_used {used}; envelope_used {used, envelopeId}; line_crossed {lineId, kind, unit, value, limit};
//            quoted_differs {quoted, computed}; implied_rate {rate}; at_todays_rate {currency}; low_month {month, left, monthly}.
//   notices: typical_short {short}; month_heading_short {month, short, categoryId?, largest?}; yearly_bill_choice_needed {seriesId}.
export type CodeValues = Readonly<Record<string, number | string | null>>; // JSON-safe: no bigint
export interface Notice { readonly code: NoticeCode; readonly values: CodeValues }
export interface Fact { readonly code: FactCode; readonly values: CodeValues }
/**
 * 05.4 D-64 (4), (5), D-118, D-119 (05.4-37): what this answer cannot see, detected from the answer and its inputs. Never changes
 * the code, the variant or any figure. large_for_month { moneyIn, costs?, used, price }: the price (a plan: its whole cost with
 * interest) is at least one usual month's money in. records_out_of_date { date }, few_months { months, lookedFor }, long_plan
 * { months }; the rest carry no values. expected_bills (D-45 planner, 05.5) and shared_money (household, Phase 8) are never emitted
 * in 05.4: no input carries them yet.
 */
export type CaveatCode = 'large_for_month' | 'your_word' | 'quick_estimates' | 'records_out_of_date' | 'no_debts_recorded' | 'few_months' | 'irregular_income' | 'close_to_line' | 'expected_bills' | 'shared_money' | 'rate_estimated' | 'tax_not_included' | 'long_plan';
export interface Caveat { readonly code: CaveatCode; readonly values: CodeValues }
export interface UnseenPay { readonly seriesId: string; readonly date: LocalDate; readonly amount: MinorUnits; readonly arrived: boolean | null }
export interface IncomeThisMonth { readonly received: MinorUnits; readonly dueConfirmed: MinorUnits; readonly total: MinorUnits; readonly reasons: readonly ReasonCode[]; readonly unseenPay?: readonly UnseenPay[] }
export interface IncomeMonth { readonly month: YearMonth; readonly income: MinorUnits; readonly everyday: MinorUnits; readonly left: MinorUnits; readonly lean: boolean } // one window month: recorded income, everyday, income - bills - everyday - set-aside
export interface IncomePicture {
  readonly stated: IncomePattern | null; // D-34
  readonly treated: IncomePattern; // what the engine uses; 'variable' when swings were found and not stated
  readonly swings: boolean; // D-34 swing test result
  readonly volatile: boolean; // D-48: treated variable/seasonal and the window income CV >= INCOME_VOLATILE_CV_PERCENT
  readonly confirmNeeded: boolean; // D-34: swings found and the pattern not confirmed
  readonly windowMonths: number; // D-33: 6 steady, 12 variable/seasonal
  readonly fullMonths: number; // full history months before the current month (D-35a)
  readonly months: readonly IncomeMonth[]; // the window, oldest first; [] when treated steady
  readonly lowPay?: readonly IncomeMonth[]; // 05.4 FIN-08 (05.4-23): steady only, the window months a pay arrived more than PAY_GAP_BP below its set-up amount (QE-04: September); absent when none
  readonly leanLeft: MinorUnits | null; // D-36 seasonal: the lowest leftover among lean window months; null otherwise
  readonly expectedThisMonth: MinorUnits | null; // D-35 rule for the current month; null when not applicable or unknown
}
export interface LowMonth { readonly left: MinorUnits; readonly month: YearMonth; readonly reason: 'second_lowest' | 'lowest' | 'only_month' }
export interface MonthModel { readonly month: YearMonth; readonly day: number; readonly daysInMonth: number; readonly moneyIn: MinorUnits; readonly moneyOut: MinorUnits; readonly billsPaid: MinorUnits; readonly billsDue: MinorUnits; readonly everydayLogged: MinorUnits; readonly erest: MinorUnits; readonly setAside: MinorUnits; readonly monthLeft: MinorUnits; readonly e: MinorUnits | null; readonly typicalIncome: MinorUnits; readonly recurringBills: MinorUnits; readonly typicalLeft: MinorUnits | null; readonly low: LowMonth | null; readonly monthsUsed: readonly YearMonth[]; readonly categoryMonthly: readonly { readonly categoryId: string; readonly amount: MinorUnits }[]; readonly housingMonthly: MinorUnits; readonly largestLine: { readonly categoryId: string | null; readonly amount: MinorUnits } | null; readonly confidence: Confidence; readonly notices: readonly Notice[]; readonly reasons: readonly ReasonCode[]; readonly incomePicture?: IncomePicture; readonly unseenPay?: readonly UnseenPay[]; /* 05.3-63 D-27, D-31: this month's dues dropped because someone else paid; absent = none */ readonly paidByOther?: readonly PaidByOtherDue[]; /* 05.3-63 D-31: live bill series someone else always pays, sorted by seriesId; absent = none */ readonly alwaysOther?: readonly AlwaysOtherSeries[]; /* 05.4 D-86 (FIN-09b): the overdraft the everyday accounts carried into this month, already taken off monthLeft; absent = none */ readonly carriedOverdraft?: MinorUnits }
/** 05.3-63 D-27, D-31: a bill due this month that no longer counts because someone else paid it. Skips are records and are not listed. */
export interface PaidByOtherDue { readonly seriesId: string; readonly name: string | null; readonly date: LocalDate; readonly amount: MinorUnits; readonly by: 'paid_by_other' | 'always_other' }
export interface AlwaysOtherSeries { readonly seriesId: string; readonly name: string | null }
export interface UnspentBreakdown { readonly in: MinorUnits; readonly everyday: MinorUnits; readonly bills: MinorUnits; readonly loans: MinorUnits; readonly investedSaved: MinorUnits; readonly other: MinorUnits; readonly heldBack?: MinorUnits /* D-38: seventh line; absent = 0 */ } // D-22 + D-31: six lines. Signed: investedSaved = deposits - withdrawals (envelopes, savings goals, saving/investing); other = other_in - other_out
export interface UnspentState { readonly value: MinorUnits; readonly anchor: UnspentAnchor; readonly rolled: boolean; readonly stale: boolean; readonly drifted: boolean; readonly breakdown: UnspentBreakdown; readonly available?: MinorUnits /* D-38: value minus held-back bridges; absent = value */ }
export interface Funds { readonly balance: MinorUnits; readonly suggested: MinorUnits; readonly unspent: UnspentState | null; readonly emergency: MinorUnits | null; readonly envelopesSaved: MinorUnits; readonly envelopesMonthly: MinorUnits; readonly ownEnvelope: MinorUnits; readonly ringFenced?: MinorUnits; readonly envelopesAssumedInside?: number; readonly spending: MinorUnits; readonly unstatedAccounts?: readonly string[]; readonly unexplained?: MinorUnits; readonly fundUnlinked?: boolean; /* 05.4 FIN-11 (D-47): yearly and every-3-month bills; total is taken off unspent.available; absent = none */ readonly billsHeld?: BillsHeldBack; /* 06 D-05: saved money in goals marked locked true; absent = 0. 06 D-22: unlockedSaved is the unlocked goal money actually counted as spare (in the spending balance, or outside it in a dedicated or untouched account, funds/unlockedGoals.ts), never money in an account with no stated use; absent = 0 */ readonly lockedNamedSaved?: MinorUnits; readonly unlockedSaved?: MinorUnits }
/** 05.2-28: the worked sum behind the suggested unspent figure. gross - mixedSetAside - envelopes - emergency - bills - everyday = suggested; suggested - heldBack = total. */
export interface UnspentSum { readonly gross: MinorUnits; readonly mixedSetAside: MinorUnits; readonly envelopes: MinorUnits; readonly emergency: MinorUnits; readonly bills: MinorUnits; readonly everyday: MinorUnits; readonly suggested: MinorUnits; readonly heldBack: MinorUnits; readonly total: MinorUnits; readonly unstatedAccounts: number; readonly unplacedEnvelopes: number; readonly hasMixed: boolean }
export type Band = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;
export type Layer = 'L0' | 'L1p' | 'L1e' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | 'L7';
export interface Purchase { readonly whole: MinorUnits; readonly dayOne: MinorUnits; readonly monthly: MinorUnits; readonly runningMonthly: MinorUnits; readonly schedule: Schedule | null; readonly share: ResolvedShare; /* whole, dayOne, monthly, runningMonthly are MY share; schedule is the full lender amount */ readonly itemType: V3PresetItemType; readonly purpose: Purpose | null; readonly emergency: boolean; /* 05.4 D-41: the purpose reads as a need (necessity, for work); wording and order only, never the answer */ readonly canUseEmergency: boolean; readonly band: Band; readonly layers: readonly Layer[]; readonly financed: boolean; readonly secured: boolean; readonly categoryId: string | null; readonly envelopeId: string | null; readonly volatileCover?: boolean | null; /* 05.4 BO-05 (05.4-26): the check's running-cost lines as typed (full amounts, off lines kept); their monthly share is inside runningMonthly and monthly; absent = none */ readonly runningCosts?: readonly RunningCostLine[] }
export type FundingSource = 'month' | 'unspent_earlier' | 'envelope' | 'extra_savings' | 'emergency'; // D-56: unspent_earlier = spare money (everyday account, earlier months); extra_savings = money above the safety net's size; emergency = the protected safety net (unlocked only, D-61)
export interface FundingSegment { readonly source: FundingSource; readonly amount: MinorUnits }
export type ReadyBy = { readonly kind: 'date'; readonly date: LocalDate } | { readonly kind: 'month'; readonly month: YearMonth };
export type ReadinessCode = 'past_month_missing' | 'activity_not_current' | 'envelopes_unconfirmed'; // D-52
/** 05.3-54 D-24: one named readiness gap. Amounts are integer minor units. */
export type ReadinessItemKind = 'bill' | 'pay' | 'spending' | 'late_start' | 'envelopes';
export interface ReadinessItem {
  readonly kind: ReadinessItemKind;
  readonly code: ReadinessCode;
  readonly month: YearMonth; // envelopes: the asOf month
  readonly seriesId: string | null; // bill, pay
  readonly envelopeId: string | null; // envelopes
  readonly lineId: string | null; // a pending line of the SAME series for this occurrence, else null (B1)
  readonly name: string | null; // pending line name, else series or envelope name, else null
  readonly amount: MinorUnits | null; // pending line amount, else series amount; null for spending, late_start, envelopes
  readonly date: LocalDate | null; // bill/pay: due date; spending: newest paid everyday (null if none); late_start: earliest line date in that month (null if none); envelopes: null
}
/** 05.3-54 D-24, D-28: the user's answer to a readiness gap. Stored owner-private in decide_answers. */
export type ReadinessWaiver =
  | { readonly kind: 'paid_by_other'; readonly seriesId: string; readonly date: LocalDate }
  | { readonly kind: 'didnt_happen'; readonly seriesId: string; readonly date: LocalDate } // only when no same-series pending line exists to skip
  | { readonly kind: 'no_pay'; readonly seriesId: string; readonly date: LocalDate } // same rule
  | { readonly kind: 'always_other'; readonly seriesId: string }
  | { readonly kind: 'income_elsewhere' }
  | { readonly kind: 'nothing_to_add'; readonly month: YearMonth; readonly at: LocalDate }
  | { readonly kind: 'month_complete'; readonly month: YearMonth; readonly at: LocalDate }
  | { readonly kind: 'start_from'; readonly month: YearMonth };
export type ReadinessWaiverKind = ReadinessWaiver['kind'];
export interface WaivedItem { readonly item: ReadinessItem; readonly by: ReadinessWaiverKind; readonly waiver: ReadinessWaiver }
export interface SkippedOccurrence { readonly seriesId: string; readonly date: LocalDate }
/** D-52; 05.3-54 D-24: items and waived are always set by readinessOf; optional so UI fixtures stay valid. */
export interface Readiness { readonly ready: boolean; readonly missing: readonly ReadinessCode[]; readonly items?: readonly ReadinessItem[]; readonly waived?: readonly WaivedItem[] }
/**
 * 05.4 FIN-09 / ENG-05 (05.4-24, D-22..D-24): the one after-purchase block. month is this month after its plans (expected pay, bills,
 * usual spending and set-asides counted, afterBuy.ts monthAfterPlans) less what the purchase takes from this month; negative allowed.
 * before is the same figure with no purchase, the figure Decide Home shows (homeFigure). usualMonth is a usual month once payments
 * start (plans, and one-offs with a running cost); null otherwise. lead names the figure the answer leads with: a plan leads with
 * the usual month (owner, 2026-11-01), a one-off and a short plan judged by cash (D-68) with this month. monthName is this month.
 */
export interface AfterBuy { readonly lead: 'month' | 'usualMonth'; readonly month: MinorUnits; readonly usualMonth: MinorUnits | null; readonly before: MinorUnits; readonly monthName: YearMonth }
export interface Result { readonly code: Code; readonly variant: Variant | null; readonly legacyState: LegacyState; readonly split: readonly FundingSegment[]; readonly facts: readonly Fact[]; readonly notices: readonly Notice[]; readonly missing: readonly MissingCode[]; readonly reasons: readonly ReasonCode[]; readonly readyBy: ReadyBy | null; readonly band: Band | null; readonly layers: readonly Layer[]; readonly confidence: Confidence; readonly parts: { readonly oneOff: Code; readonly monthly: Code | null }; readonly afterBuy: AfterBuy /* 05.4 FIN-09 (05.4-24) */; readonly readiness?: Readiness /* D-52: a not-ready result is never a verdict */; readonly recordsAsOf?: LocalDate | null /* 05.4 ENG-14, UX-29: V3Inputs.recordsAsOf passed through so the screen can say "Records up to Oct 29"; absent when the inputs carry none */; readonly purchaseDate: LocalDate /* 05.4 D-42 (05.4-26): when it is to be bought, on every answer (asks included): check.purchaseDate when it is a valid date on or after asOf, else asOf (today) */; readonly caveats?: readonly Caveat[] /* 05.4 D-64 (4), D-119 (05.4-37): every caveat detected, large_for_month first, then CAVEAT_ORDER; [] on an ask or a not-ready answer. The screen shows the first one (and large_for_month's figures). Absent only on results built outside prepare's finish */ }
