/**
 * v3 rule constants (05.1). Unlike ../constants.ts, currency amounts ARE allowed here (US$ band edges, the $200 drift
 * threshold, the $1 quoted tolerance), each converted per currency through the fixed table in bandEdges.ts (D-07, D-26).
 * Every export has a `// Cite:` line (I27).
 */
import type { Code, LegacyState, MissingCode } from './types';

// Cite: v3 §4.4 "last <=6 full months" (REBUILD-PLAN-v3). FincWin behaviour constant, in line with the 6-month window in 04-CONTEXT D-09.
export const V3_HISTORY_MONTHS = 6; // v3 §4.4

// Cite: v3 §4.3 "second-lowest real month" (REBUILD-PLAN-v3). FincWin choice: one bad month is not the plan, two is a pattern.
export const LOW_MONTH_RANK = 2; // v3 §4.3

// Cite: v3 §4.1 recurring windows in days between payments (REBUILD-PLAN-v3), D-02. FincWin choice, no outside source.
export const RECURRING_WINDOWS: Readonly<Record<'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'yearly', readonly [number, number]>> = {
  weekly: [5, 9],
  fortnightly: [11, 17],
  monthly: [28, 33],
  quarterly: [85, 95],
  yearly: [360, 370],
}; // v3 §4.1, D-02

// Cite: v3 §4.1 step 4 minimum repeats before a series is offered (REBUILD-PLAN-v3), D-02. FincWin choice, no outside source.
export const RECURRING_MIN_REPEATS = { weekly: 3, fortnightly: 3, monthly: 3, quarterly: 2, yearly: 2 } as const; // v3 §4.1, D-02

// Cite: C2, v3 §4.1 (REBUILD-PLAN-v3): a two-date series matches within 3 days. FincWin choice.
export const TWO_DATE_TOLERANCE_DAYS = 3; // C2

// Cite: v3 §4.1 step 3 (REBUILD-PLAN-v3): amounts within 10% of the median, tested as |a-m|*10 <= |m| so no division. FincWin choice.
export const AMOUNT_TOLERANCE_DIVISOR = 10; // v3 §4.1

// Cite: UP §4.2 (00-UPGRADE-PLAN): a series drifts when the last 2 payments differ by more than 5% (divisor 20). FincWin choice.
export const SERIES_DRIFT_DIVISOR = 20; // UP §4.2

// Cite: UP §4.2 (00-UPGRADE-PLAN): the drift test looks at the last 2 payments. FincWin choice.
export const SERIES_DRIFT_LAST = 2; // UP §4.2

// Cite: I35, UP §4.9 (00-UPGRADE-PLAN): an unspent figure older than 30 days is stale. FincWin choice.
export const UNSPENT_STALE_DAYS = 30; // I35

// Cite: D-22 (05.1-CONTEXT): unspent has drifted when it moves more than 10% from the anchor. FincWin choice.
export const UNSPENT_DRIFT_PERCENT_DIVISOR = 10; // D-22

// Cite: D-26 (05.1-CONTEXT): the drift test also needs US$200 of movement, in USD minor units, converted per currency. FincWin choice.
export const UNSPENT_DRIFT_USD = 20_000; // D-26

// Cite: C1, D-26 (05.1-CONTEXT): a quoted payment matches the computed one within US$1, in USD minor units, converted per currency. FincWin choice.
export const QUOTED_TOLERANCE_USD = 100; // C1, D-26

// Cite: v3 §5.2, O11 (REBUILD-PLAN-v3): US$50 to US$5M in USD minor units. The band rule lives in judge/bands.ts: whole < edge[0] gives band 1; otherwise band = 2 + count of edges[1..13] strictly below whole, so US$100 is band 2, US$100.01 band 3 and above US$5M band 15. FincWin choice.
export const BAND_EDGES_USD: readonly number[] = [
  5_000, 10_000, 50_000, 100_000, 500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000, 20_000_000, 50_000_000,
  100_000_000, 200_000_000, 500_000_000,
]; // v3 §5.2, O11

// Cite: UP §5.3 (00-UPGRADE-PLAN): six codes, strictest first. The strictest part wins.
export const CODE_PRECEDENCE = ['needs_input', 'not_yet', 'monthly_short', 'emergency_use', 'fits_unspent', 'fits_month'] as const; // UP §5.3

// Cite: D-23 (05.1-CONTEXT), overriding the research table: the old four-state verdict each code maps to. FincWin choice.
export const LEGACY_STATE_OF_CODE = Object.freeze({
  fits_month: 'fits',
  fits_unspent: 'fits',
  monthly_short: 'adjust',
  emergency_use: 'adjust',
  not_yet: 'no',
  needs_input: 'missing',
}) satisfies Readonly<Record<Code, LegacyState>>; // D-23

// Cite: v3 §3.5, D-19, I38: only these purposes may draw on the emergency fund. FincWin choice.
export const EMERGENCY_PURPOSES = ['necessity', 'for_work'] as const; // v3 §3.5, I38

// Cite: UP §5.4 rule 3 (00-UPGRADE-PLAN): needs-input applies from band 5 upward. FincWin choice.
export const NEEDS_INPUT_MIN_BAND = 5; // UP §5.4

// Cite: UP §5.4 rule 3 (00-UPGRADE-PLAN): an entry older than 10 days counts as behind. FincWin choice.
export const NEEDS_INPUT_ENTRY_AGE_DAYS = 10; // UP §5.4

// Cite: UP §5.4 rule 3 (00-UPGRADE-PLAN): a month is under-logged when logging pace is below 50% of the usual. FincWin choice.
export const UNDER_LOGGED_PACE_PERCENT = 50; // UP §5.4

// Cite: I8 (00-UPGRADE-PLAN): confidence is firm only from day 20 of the month. FincWin choice.
export const CONFIDENCE_FIRM_MIN_DAY = 20; // I8

// Cite: I5, I25 (00-UPGRADE-PLAN): confidence needs at least 3 full months. FincWin choice.
export const CONFIDENCE_MIN_MONTHS = 3; // I5, I25

// Cite: recurring/payMatch.ts PAY_MATCH_AFTER_DAYS (7 days), D-18 missed paycheque, A7. Kept equal by constants.test.ts.
export const MISSED_PAY_GRACE_DAYS = 7; // D-18, A7

// Cite: v3 §4.5 "90-day low point" (REBUILD-PLAN-v3). FincWin choice.
export const CASH_PATH_DAYS_V3 = 90; // v3 §4.5

// Cite: D-11 (05.1-CONTEXT): at most 3 built-in limit lines. FincWin choice.
export const MAX_BUILTIN_LINES = 3; // D-11

// Cite: D-12 (05.1-CONTEXT): at most 5 own limit lines. FincWin choice.
export const MAX_OWN_LINES = 5; // D-12

// Cite: D-19 (05.1-CONTEXT): at most 10 custom options of each kind. FincWin choice.
export const MAX_CUSTOM_OPTIONS = 10; // D-19

// Cite: D-19 (05.1-CONTEXT): at most 3 own questions per custom item type. FincWin choice.
export const MAX_OWN_QUESTIONS = 3; // D-19

// Cite: D-01, D-19 (05.1-CONTEXT): a cadence repeats every 1 week or month at least. FincWin choice.
export const CADENCE_EVERY_MIN = 1; // D-19

// Cite: D-01, D-19 (05.1-CONTEXT): a cadence repeats every 12 weeks or months at most. FincWin choice.
export const CADENCE_EVERY_MAX = 12; // D-19

// Cite: payoff MAX_TERM_MONTHS cap (600 months, 50 years) in ../../payoff/types. A plan never has more periods than the payoff engine can simulate.
export const MAX_PLAN_PERIODS = 600; // payoff MAX_TERM_MONTHS

// Cite: D-33 (05.1-CONTEXT): variable or seasonal earners use up to 12 months so a whole year of seasons is seen. FincWin choice.
export const V3_VARIABLE_HISTORY_MONTHS = 12; // D-33

// Cite: D-34; the Phase 4 variable cut-off VARIABLE_CV_BELOW (22%, ../constants.ts, D-12): recorded monthly income with a coefficient of variation at or above 22% swings a lot. FincWin choice.
export const INCOME_SWING_CV_PERCENT = 22; // D-34, D-12

// Cite: D-34; Phase 4 D-12: a CV needs at least 3 full months of income. FincWin choice.
export const INCOME_SWING_MIN_MONTHS = 3; // D-34, D-12

// Cite: D-35 (a): fewer than 12 full months of records cannot show a year of seasons. FincWin choice.
export const RECONFIRM_MIN_MONTHS = 12; // D-35

// Cite: D-37: a season cycle is 12 months; lean runs and the months a purchase depends on look at most 12 months ahead. FincWin choice.
export const SEASON_CYCLE_MONTHS = 12; // D-37

// Cite: M-02 (05.1-REVIEW), C2/v3 §4.1: a paid line within 3 days of a due date settles that occurrence (bills, debt payments, saving). FincWin choice.
export const MATCH_DAYS = 3; // M-02, C2

// Cite: D-48 (05.1-CONTEXT); the same coefficient-of-variation measure as D-34 (INCOME_SWING_CV_PERCENT) at a higher limit: JPMorgan Chase Institute (2019, "Weathering Volatility 2.0") reports a median household monthly-income CV of about 0.38 (2013–2018, Chase checking-account families); the limit is set at that reported median. Treating records above it as too volatile to judge a monthly payment alone is a FincWin choice, not a finding of the report.
export const INCOME_VOLATILE_CV_PERCENT = 38; // D-48

// Cite: H-02 (05.1-REVIEW), MISSED_PAY_GRACE_DAYS (D-18, A7): pay up to 7 days early (banks pay before weekends and holidays) or 7 days late settles its due date. FincWin choice.
export const PAY_MATCH_DAYS = 7; // H-02, D-18

// Cite: D-59 (05.1-CONTEXT): one question at a time, most important first; the check's own fields follow in the order the check form asks them. FincWin choice.
export const MISSING_PRIORITY = [
  'account_use_question',
  'pay_arrival_question',
  'unspent_not_confirmed',
  'income_pattern_unconfirmed',
  'expected_income_needed',
  'unexplained_money_question',
  'volatile_cover_question',
  'no_income_figures',
  'everyday_unknown',
  'records_look_behind',
  'no_price',
  'share_invalid',
  'legacy_invest_check',
  'plan_count_missing',
  'first_payment_not_chosen',
  'first_payment_passed',
  'pause_interest_not_answered',
  'plan_rate_missing',
] as const satisfies readonly MissingCode[]; // D-59

// Cite: UP §4.12 noise floor, $25 in a 2-decimal currency (minor units). FincWin choice (05.2 OQ2, owner approved 2026-10-28).
export const REFINE_NOISE_MIN_MINOR = 2_500; // 05.2

// Cite: UP §4.12: a suggestion must also beat 5% of the figure. FincWin choice (05.2 OQ2, owner approved 2026-10-28).
export const REFINE_NOISE_PCT = 5; // 05.2

// Cite: UP §4.12: the spread (median absolute deviation) reads the last 6 full months. FincWin choice (05.2 OQ2, owner approved 2026-10-28).
export const REFINE_WINDOW_MONTHS = 6; // 05.2

// Cite: 05.2 D-12, UP §4.12: check in after 3 full months of records since setup.
export const REFINE_SETUP_MONTHS = 3; // 05.2

// Cite: 05.2 D-12, UP §4.12: check in after 1 full month when setup used rough figures.
export const REFINE_ROUGH_MONTHS = 1; // 05.2

// Cite: 05.2 D-12, UP §4.12: a typed figure 15% off the records.
export const REFINE_TYPED_OFF_PCT = 15; // 05.2

// Cite: 05.2 D-12, UP §4.12: a typed figure off the records 2 months running.
export const REFINE_TYPED_OFF_MONTHS = 2; // 05.2

// Cite: 05.2 D-12, UP §4.12: a new regular payment or income that repeats 3 times.
export const REFINE_REPEAT_COUNT = 3; // 05.2

// Cite: 05.2 D-12: at most once a month; "a month" is 30 days. FincWin choice (05.2 OQ2, owner approved 2026-10-28).
export const REFINE_MIN_GAP_DAYS = 30; // 05.2

// Cite: 05.2 D-12: "Later" hides the check-in for 14 days.
export const REFINE_SNOOZE_DAYS = 14; // 05.2

// Cite: 05.2 D-20: a typed everyday figure expires after 90 days.
export const REFINE_OVERRIDE_MAX_DAYS = 90; // 05.2

// Cite: 05.2 D-20: a typed everyday figure expires when the records median moves 20% from it.
export const REFINE_OVERRIDE_MEDIAN_PCT = 20; // 05.2

// Cite: 05.2 D-20: a steady income figure above recorded income 2 months running.
export const REFINE_STEADY_ABOVE_MONTHS = 2; // 05.2

// Cite: 05.2 D-20: a card said to be paid in full that was not paid in full 2 statements running.
export const REFINE_CARD_UNPAID_STATEMENTS = 2; // 05.2

// Cite: 05.2 D-20: a full month under 50% of the typical month is suggested once as under-logged. FincWin choice (05.2 OQ2, owner approved 2026-10-28).
export const REFINE_UNDERLOGGED_PCT = 50; // 05.2

// Cite: 05.2 D-20: a regular pay with no paid line for its last 2 expected dates has stopped. FincWin choice (05.2 OQ2, owner approved 2026-10-28).
export const REFINE_PAY_STOPPED_MISSES = 2; // 05.2
