/**
 * Behaviour constants, not money (RESEARCH open question 1, resolved 2026-09-26).
 * No currency amount may be added here (D-05).
 *
 * D-58: every value here is as the user decided. Research raised two points, both settled by the user on 2026-10-15
 * without changing a value here: the 12x line and the 36% line are confirmed as FincWin behaviour lines (D-04 confirmed),
 * and steady weekly or fortnightly pay is no longer classed Variable because confirmed pay series are smoothed in the
 * income averages (D-60, deriveMoney in 04-13); the CV cut-offs are unchanged.
 *
 * Every export sits under a comment block whose first line starts with the word Cite (enforced by constants.test.ts).
 */
import { percent, type Percent } from '../payoff/types';
import type { SetbackInput, WarningCode } from './types';

// Cite: D-09 averaging window (the last 6 full months). FincWin behaviour constant, in line with the 6-month window in 04-CONTEXT D-09.
export const AVERAGING_WINDOW_MONTHS = 6; // D-09

// Cite: D-12 steadiness needs at least 3 full months of income before a CV is meaningful (fewer is 'insufficient').
export const MIN_MONTHS_FOR_STEADINESS = 3; // D-12

// Cite: FincWin behaviour constant (no published source; see 04-RESEARCH addendum §A). Prototype behaviour constant (dmoney cv < .06). No published CV cut-off found. JPMorgan Chase Institute (2019) reports a median monthly-income CV of about 0.38 (2013–2018).
// https://www.jpmorganchase.com/institute/all-topics/household-financial-health/report-weathering-volatility-2-a-monthly-stress-test-to-guide-saving
export const STEADY_CV_BELOW: Percent = percent('6'); // D-12

// Cite: FincWin behaviour constant (no published source; see 04-RESEARCH addendum §A). Prototype behaviour constant (dmoney cv < .22). No published CV cut-off found. JPMorgan Chase Institute (2019) reports a median monthly-income CV of about 0.38 (2013–2018).
// https://www.jpmorganchase.com/institute/all-topics/household-financial-health/report-weathering-volatility-2-a-monthly-stress-test-to-guide-saving
export const VARIABLE_CV_BELOW: Percent = percent('22'); // D-12

// Cite: D-17 a simulation stops at 600 months (50 years); reaching it is its own outcome, never "never clears". Defined in payoff (the lower layer, reused by Phase 6) and re-exported here so every Decide behaviour constant is visible in this one file.
export { SIMULATION_MONTH_CAP } from '../payoff/constants';

// Cite: 3-6 months of expenses: FCAC (via Consumer Protection BC, 2025-07-03), MoneyHelper (via NS&I), Vanguard (2025-08-15). First read and a steady income use 3 months (D-11, D-42).
// https://www.consumerprotectionbc.ca/2025/07/9545/ ; https://www.nsandi.com/guide/emergency-fund
export const DEFAULT_RESERVE_MONTHS = 3; // D-01, D-11

// Cite: Fannie Mae Selling Guide B3-6-02 (2025-04-02): max total DTI 36% of stable monthly income for manually underwritten loans; CFPB DTI tool: keep all-debt DTI at 36% or less. Lenders use gross income; FincWin uses logged income, so this line is stricter.
// FincWin behaviour line (user-confirmed 2026-10-15, D-04 confirmed after research); 36% applies to take-home income (logged money in), which is stricter than lenders' gross-income test, deliberately.
// https://selling-guide.fanniemae.com/sel/b3-6-02/debt-income-ratios
// https://files.consumerfinance.gov/f/documents/cfpb_your-money-your-goals_debt_income_calc_tool_2018-11_ADA.pdf
export const DEFAULT_DSR_LINE: Percent = percent('36'); // D-04

// Cite: FincWin behaviour constant (no published source; see 04-RESEARCH addendum §A). Prototype behaviour constant (dlim). No authoritative stock threshold found. Closest heuristic: the "20/10 rule" (Experian, 2023) puts consumer debt under 20% of annual take-home pay. See 04-RESEARCH §A.2.
// FincWin behaviour line (user-confirmed 2026-10-15, D-04 confirmed after research); not a published standard; editable; the 20/10 rule was considered and not adopted.
// https://www.experian.com/blogs/ask-experian/what-is-the-20-10-rule/
export const DEFAULT_UNSECURED_INCOME_MULTIPLE = 12; // D-04

// Cite: FincWin behaviour constant (no published source; see 04-RESEARCH addendum §A). Product behaviour constant: covers one quarterly billing cycle ahead of the check date and matches the D-44 cash path. No regulatory "upcoming bills" window found.
export const BILLS_DUE_HORIZON_DAYS = 90; // D-24: non-monthly bills due within 90 days of the check date are deducted from cash

// Cite: D-23 monthly-equivalent conversion (calendar: 52 weeks a year).
export const WEEKS_PER_YEAR = 52; // D-23

// Cite: D-23 monthly-equivalent conversion (calendar: 26 fortnights a year).
export const FORTNIGHTS_PER_YEAR = 26; // D-23

// Cite: D-23 monthly-equivalent conversion (calendar: 12 months a year).
export const MONTHS_PER_YEAR = 12; // D-23

// Cite: D-23 monthly-equivalent conversion (calendar: 3 months in a quarter).
export const MONTHS_PER_QUARTER = 3; // D-23

// Cite: prototype push order of warnings (month, cash, dsr, owe, inv); cash_dip (D-44) sits after cash because both are cash causes. Used to break ties between equal shortfalls.
export const WARNING_ORDER: readonly WarningCode[] = ['month', 'cash', 'cash_dip', 'dsr', 'owe', 'inv'];

// Cite: prototype DSB setbacks (FincWin United.dc.html lines 3995-3999): once, drop 20% x 2 months, none x 8 months, late 30 days. The prototype's 1,200 unexpected-expense amount is a currency amount and is replaced by null, meaning one month's costs (D-05).
export const DEFAULT_SETBACKS: readonly SetbackInput[] = [
  { code: 'unexpected_expense', enabled: false, amount: null },
  { code: 'income_drop', enabled: false, percentDrop: 20, months: 2 },
  { code: 'job_loss', enabled: false, months: 8 },
  { code: 'late_invoice', enabled: false, daysLate: 30 },
];

// Cite: DEC-13 prototype behaviour: the longer-term option steps the term up by 24 months.
export const LONGER_TERM_STEP_MONTHS = 24;

// Cite: DEC-13 prototype behaviour: the cut-a-line option cuts 20% of an expense line.
export const CUT_LINE_FRACTION_PERCENT = 20;

// Cite: DEC-13 prototype behaviour: the cut-a-line option offers the 2 largest cuttable lines.
export const CUT_LINE_COUNT = 2;

// Cite: DEC-13 prototype behaviour: a do-without projection with no plan term uses 60 months.
export const DO_WITHOUT_FALLBACK_HORIZON_MONTHS = 60;

// Cite: DEC-14 prototype behaviour: the alternatives horizon is at least 12 months.
export const ALTERNATIVES_HORIZON_MIN = 12;

// Cite: DEC-14 prototype behaviour: the alternatives horizon is at most 120 months.
export const ALTERNATIVES_HORIZON_MAX = 120;

// Cite: DEC-14 prototype behaviour: the alternatives horizon is 36 months when the plan has no term.
export const ALTERNATIVES_HORIZON_FALLBACK = 36;

// Cite: DEC-14 prototype behaviour: the cheaper alternative starts at 65% of the price.
export const DEFAULT_CHEAPER_RATIO_PERCENT = 65;

// Cite: DEC-15 prototype behaviour: a late invoice of N days counts as N / 30 of a month's income.
export const LATE_INVOICE_DAYS_PER_MONTH = 30;
