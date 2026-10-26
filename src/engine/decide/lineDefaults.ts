// Leaf (05.1, D-16): v3 imports this file; it must never import the old engine.
// The D-11 line defaults, moved verbatim from constants.ts. Behaviour constants, not money (D-05).
import { percent, type Percent } from '../payoff/types';

// Cite: Fannie Mae Selling Guide B3-6-02 (2025-04-02): max total DTI 36% of stable monthly income for manually underwritten loans; CFPB DTI tool: keep all-debt DTI at 36% or less. Lenders use gross income; FincWin uses logged income, so this line is stricter.
// FincWin behaviour line (user-confirmed 2026-10-15, D-04 confirmed after research); 36% applies to take-home income (logged money in), which is stricter than lenders' gross-income test, deliberately.
// https://selling-guide.fanniemae.com/sel/b3-6-02/debt-income-ratios
// https://files.consumerfinance.gov/f/documents/cfpb_your-money-your-goals_debt_income_calc_tool_2018-11_ADA.pdf
export const DEFAULT_DSR_LINE: Percent = percent('36'); // D-04

// Cite: the 28/36 rule's front-end ratio: housing costs (mortgage principal, interest, taxes and insurance) at most 28% of gross monthly income. Bankrate, "What Percentage Of Income Should Go To A Mortgage?" (fetched 2026-10-24): "a homebuyer's monthly mortgage payment shouldn't exceed 28% of their gross monthly income ... based on a borrower's front-end debt-to-income (DTI) ratio"; the 36% rule is the back-end ratio (DEFAULT_DSR_LINE above).
// FincWin behaviour line (user-confirmed 2026-10-24, D-103); 28% applies to take-home income (logged money in), which is stricter than the lenders' gross-income test, deliberately. Editable.
// https://www.bankrate.com/mortgages/what-is-the-28-36-rule/
export const DEFAULT_HOUSING_LINE: Percent = percent('28'); // D-103

// Cite: FincWin behaviour constant (no published source; see 04-RESEARCH addendum §A). Prototype behaviour constant (dlim). No authoritative stock threshold found. Closest heuristic: the "20/10 rule" (Experian, 2023) puts consumer debt under 20% of annual take-home pay. See 04-RESEARCH §A.2.
// FincWin behaviour line (user-confirmed 2026-10-15, D-04 confirmed after research); not a published standard; editable; the 20/10 rule was considered and not adopted.
// https://www.experian.com/blogs/ask-experian/what-is-the-20-10-rule/
export const DEFAULT_UNSECURED_INCOME_MULTIPLE = 12; // D-04
