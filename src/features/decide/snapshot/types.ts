/**
 * Phase 5 contracts (05-01). Plain JSON shapes for anything persisted (CheckInputs lives in decide_checks.inputs and in
 * paused mutation variables), so: integer minor units as `number`, rates as decimal strings, never `Percent`/bigint
 * (RESEARCH Pitfall 8). Engine objects (Verdict, Percent) live only in memory, rebuilt on render (D-15).
 */
import type { ItemType } from '@/engine/decide/v3';
import type { CustomCurrencyRow, FxLatestRow } from '@/db/rows';

export interface SnapshotMeta {
  fullMonths: number;            // months the builder flagged full (04 D-13)
  expenseLinesThisMonth: number; // outflow rows in the current month (sources note)
  debtCount: number;             // DebtRecords in the snapshot
  accountCount: number;          // live cash|checking|savings accounts in cashOnHand
  unconvertedRows: number;       // rows left out because no stored rate converts them (A9)
  derivedDebts: number;          // credit/loan balances counted without a debts row
  pendingOneOffs: number;        // live pending one-off outflows (no series): on a cash account → a dated scheduledOutflows entry (04 D-61; the engine applies those dated on or before asOf to the cash ledger), on a card → its debt (05-06)
  cardsWithoutMinimum: number;   // credit accounts owing a balance with no stored terms, no market row and not paid in full: no minimum is counted (D-40; basis row 05-41, Assumptions 05-15)
  cardsMinimumWithoutRate: number; // cards whose minimum adds interest but have no rate: the minimum is counted without interest (D-40; Assumptions 05-15)
  cardsWithoutMinimumIds: string[]; // D-40: the accountIds counted in cardsWithoutMinimum, in account order (length === cardsWithoutMinimum); 05-30 opens CardMinimumSheet for the first from the basis row (05-41) and Assumptions (05-15)
  loansWithoutPayment: number;   // D-38 minimal reading for DCU-24: live loan accounts owing a balance with neither a loan|other debts row nor a live recurring series on the account; nothing is counted for them (Assumptions 'Loan payments', 05-15)
  unconvertedPots: number;       // D-101 (R18.2 Currency): live pots left out because no stored rate converts them; each is also counted in unconvertedRows (05-134 reads it for the Needs a look rate entry)
  limitsReset: number;           // D-51 (04-REVIEW LO-03): stored limits the builder set to null because prepareContext would refuse them (negative, fractional, unparsable); internal, no UI (05-06)
}
// D-40 / D-38: what the step 2 'Minimum payment' row shows and the card terms sheet edits. Plain JSON; floor in the card debt's own currency for editing, percent as a decimal string.
export interface CardTermsView { debtId: string | null; source: 'stored' | 'market' | 'none'; paidInFull: boolean; percentText: string | null; interestAdded: boolean | null; floor: number | null; floorCurrency: string; marketAvailable: boolean; version: number | null }
// D-37 (part 2): conversion facts for the basis line and Assumptions, and the missing-rate note. Plain JSON (rateText is the 10-dp string from 05-33, never a number).
export interface ConversionNote { currency: string; rateText: string; rateDate: string } // home units per 1 unit of `currency` at the latest stored rate; rateDate = the earlier rate_date of the two legs
export interface UnconvertedNote { currencies: readonly string[]; rowCount: number }   // a needed amount had no stored rate: every computation reports 'unconverted', never a guessed figure
// D-106: current-month lines (paid or pending, not skipped) that no stored rate converts. Separate from `unconverted`: the history is untouched; only the month basis reads it (falls back to Worst, D-107). Sorted currency codes; rowsByCurrency counts rows.
export interface MonthUnconvertedNote { currencies: readonly string[]; rowCount: number; rowsByCurrency: Readonly<Record<string, number>> }
// D-69: past lines saved while their own rate was pending, converted at the latest stored rate (display and maths only, never written). rateDate = the earliest rate date used.
export interface ProvisionalNote { rowCount: number; rateDate: string }
// D-67: the stored rates the snapshot was built with, so a check typed in another currency converts at the same latest stored rate (checkCurrency.ts). Absent (test fixtures) = no rate: such a check reads unconverted.
export interface SnapshotFx { rates: readonly FxLatestRow[]; customs: readonly CustomCurrencyRow[]; today: string }
// D-91 (05-95): a display-only basis note; never affects confidence (M4). date = the USD rate's date, shown when older than today.
export interface CardLimitRateNote { kind: 'card_limit_rate'; date: string }

// The stored-check unions, as plain JSON strings (the old engine's SetbackCode, InstalmentFreq and RunningCostCategory, 05.5-26).
export type SetbackCode = 'unexpected_expense' | 'income_drop' | 'job_loss' | 'late_invoice';
export type InstalmentFreq = 'weekly' | 'fortnightly' | 'monthly' | 'quarterly';
export type RunningCostCategory =
  | 'insurance' | 'fuel' | 'maintenance' | 'registration' | 'loss_of_value'
  | 'property_tax' | 'home_insurance' | 'utilities' | 'service_charge' | 'books_materials' | 'travel' | 'accommodation'; // loss_of_value is non-cash (D-55)

export type PayMethod = 'cash' | 'loan' | 'instalment' | 'card';
export type InvestMethod = 'lump' | 'monthly';
export type MethodKey = PayMethod | InvestMethod;
export const PAY_METHODS = ['cash', 'loan', 'instalment', 'card'] as const satisfies readonly PayMethod[];

export interface InputLine { id: string; name: string; amount: number; note: string; counted: boolean; seriesId: string | null; category: RunningCostCategory | null } // amount >= 0 minor units; seriesId = an existing recurring series this line ends (replaces only); category = the D-33 prompt the line came from (null = a line the user added; running costs only)
export interface PromoInput { aprText: string; months: number | null; deferredInterest: boolean } // D-30: the promotional rate and its months; the rate after it is the method's own rate (loan.aprText, or the card's own record). Never pre-filled. deferredInterest: D-42 toggle, default false (absent in stored JSON = false), honoured only when aprText parses to 0 (04-05 PromoTerms)
export interface AdjustmentLine { id: string; name: string; amount: number; note: string; counted: boolean; effect: 'adds' | 'takes_off'; onDay: boolean; taxPercentText: string | null } // taxPercentText set → amount recomputed from the advertised price (sales tax, D-23)
export interface SetbackLine { id: string; code: SetbackCode; enabled: boolean; amount: number | null; percentDrop: number; months: number; daysLate: number }
export type CardNoteAnswer = 'yes' | 'no' | 'unsure' | null;
// D-44 (04 D-63): the step 2 'Loss of value' entry, user-typed and never defaulted. Plain JSON: monthly in minor units (the CostLine unit), percentText a decimal string, a % per year of the price before tax, fees and trade-ins (inputs.advertised, 04-06; 0..100). 05-07 maps it through the engine's lossOfValueMonthly into a non-cash loss_of_value CostLine.
export type LossOfValueEntry = { kind: 'amount'; monthly: number } | { kind: 'percent_per_year'; percentText: string };

export interface CheckInputs {
  v: 1;
  currency: string | null;         // D-37: home currency the amounts were typed in; null on drafts made before part 2 (treated as the current home)
  kind: 'buy' | 'invest';
  name: string;                    // <= 80
  source: string;                  // "Who quoted it" / "Where it is held", <= 80
  itemType: ItemType;
  itemTypeTouched: boolean;        // false → pre-filled from the name (suggestItemType, step 1 only)
  advertised: number | null;       // minor units in the snapshot currency
  needBy: string | null;           // 'YYYY-MM-DD', never before today (DCU-08)
  why: string;                     // <= 500
  adjustments: AdjustmentLine[];   // <= 30
  runningCosts: InputLine[];       // <= 30 (never a 'loss_of_value' line: that entry lives in lossOfValue, D-44)
  lossOfValue: LossOfValueEntry | null; // D-44 / 04 D-63: null = none (absent in stored JSON = null); shown as 'not a monthly cash cost', never in the month
  replaces: InputLine[];           // <= 30
  method: MethodKey | null;
  loan: { deposit: number; termMonths: number | null; aprText: string; secured: boolean; securedTouched: boolean; aprFromQuick: boolean; promo: PromoInput | null; variable: boolean }; // promo/variable: D-30, absent = none // secured follows itemType === 'vehicle' until the user touches the toggle (securedTouched, 05-07/05-14; 04 DEC-11)
  // lateFee: D-30, user-typed, never changes the verdict. D-80 (R15.3): hasRate false = the payment is the stored amount with no rate; true = the amount is the dealer's quote and aprText the typed rate (kept when switching back to No). firstPayment: today by default; 'next_period' is the first payment one period on (D-89; a stored 'next_month' is read as it). freq: D-89, absent = monthly. Optional in the type so older fixtures compile; parseCheckInputs always fills them.
  instalment: { amount: number | null; count: number | null; lateFee: number | null; hasRate?: boolean; aprText?: string; firstPayment?: 'today' | 'next_period'; freq?: InstalmentFreq };
  card: { accountId: string | null; payoff: 'full' | 'months' | 'minimum'; months: number; promo: PromoInput | null; variable: boolean; fees: number | null }; // fees: D-44 / 04 D-63 cardFees, user-typed card fees for this purchase (minor units), null = none (absent in stored JSON = null)
  investTermMonths: number | null;
  setbacks: SetbackLine[];         // <= 12
  projectionRates: string[];       // D-31 / UI-SPEC assumption 17: the check's ONE rate list, up to 3 user rates as decimal strings in entry order; [] = 0% only. The Kept column uses the first (D-07 "+ Add a rate")
  investHorizonMonths: number | null; // D-31 horizon chip; null = the plan term, or 60 months for cash
  investHoldingFeeText: string | null; // D-44 / 04 D-63: optional holding fee %/year for the investing views (decimal string, 0..100), null = no fee; never pre-filled
  combine: boolean;                // D-24 "With my other open checks": default true, remembered per check (A13); autosaved, no undo step
  coolingOff: boolean;             // D-35 "Check again in 48 hours": default false; honoured only when the size is needs_spreading
  incomeChange: { direction: 'raises' | 'lowers'; amount: number | null; startDate: string | null; likelihood: 'likely' | 'uncertain' } | null; // D-32; null = "This changes my income" off
  cheaperPrice: number | null;     // D-83: the exact cheaper advertised price, minor units in [ceil(30% of advertised), advertised]; null = engine default
  customItemType: { name: string; treatLike: ItemType | null } | null; // D-81 / R15.4: the name (1-40) never reaches the engine; the rules type is treatLike ?? 'general'
  investReturnText: string | null; // D-82 / R15.5: expected return % a year, decimal string 0..100, display only; null = none
  lumpHorizonMonths: number | null; // D-82: the lump-sum projection horizon; null = LUMP_HORIZON_DEFAULT (60)
  wait: { monthlyAmount: number | null };
  outcome: 'go' | 'wait' | 'pass' | null;
  goAccountId: string | null;      // A6: the cash account Go ahead writes to (buy and invest)
  investAccountId: string | null;  // invest Go ahead (05-20): a lump becomes a pending transfer into this investment account; null → a pending outflow from goAccountId
  scope: 'personal' | 'household'; // D-18; always 'personal' until Phase 8
  split: { kind: 'even' | 'weight' | 'amount' | 'mine'; weights: number[]; amounts: number[] } | null;
  cardNotes: { incomeStops: CardNoteAnswer; noNewSpending: CardNoteAnswer; jobLossCover: CardNoteAnswer };
}

export interface QuickInputs { name: string; price: number | null; mode: 'cash' | 'credit'; aprText: string; termMonths: number; taxText: string; fees: number | null }

