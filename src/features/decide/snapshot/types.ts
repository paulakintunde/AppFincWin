/**
 * Phase 5 contracts (05-01). Plain JSON shapes for anything persisted (CheckInputs lives in decide_checks.inputs and in
 * paused mutation variables), so: integer minor units as `number`, rates as decimal strings, never `Percent`/bigint
 * (RESEARCH Pitfall 8). Engine objects (Verdict, Percent) live only in memory, rebuilt on render (D-15).
 */
import type { AlternativeRow, Alternatives, AssessContext, BuyCheck, CardRecord, CurrencyCode, Decision, DecideOption, DecideSnapshot, FirstRead, IncomeAtRiskReport, InvestmentViews, ItemType, MinorUnits, PlanResult, PurchaseCheck, ResolvedPrice, RoughFigures, RunningCostCategory, RunningCosts, SetbackCode, SetbackReport, StackedCheckInput, Verdict, WaitPlan } from '@/engine/decide'; // CurrencyCode / MinorUnits re-exported per 04 D-62

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
  limitsReset: number;           // D-51 (04-REVIEW LO-03): stored limits the builder set to null because prepareContext would refuse them (negative, fractional, unparsable); internal, no UI (05-06)
}
// D-40 / D-38: what the step 2 'Minimum payment' row shows and the card terms sheet edits. Plain JSON; floor in the card debt's own currency for editing, percent as a decimal string.
export interface CardTermsView { debtId: string | null; source: 'stored' | 'market' | 'none'; paidInFull: boolean; percentText: string | null; interestAdded: boolean | null; floor: number | null; floorCurrency: string; marketAvailable: boolean; version: number | null }
export interface CardChoice { accountId: string; name: string; record: CardRecord; terms: CardTermsView } // record.minimumTerms is null when paidInFull or source 'none'
// D-37 (part 2): conversion facts for the basis line and Assumptions, and the missing-rate note. Plain JSON (rateText is the 10-dp string from 05-33, never a number).
export interface ConversionNote { currency: string; rateText: string; rateDate: string } // home units per 1 unit of `currency` at the latest stored rate; rateDate = the earlier rate_date of the two legs
export interface UnconvertedNote { currencies: readonly string[]; rowCount: number }   // a needed amount had no stored rate: every computation reports 'unconverted', never a guessed figure
interface SnapshotBase { currency: CurrencyCode; meta: SnapshotMeta; cards: readonly CardChoice[]; dealerCap: MinorUnits | null; cash: MinorUnits; conversions: readonly ConversionNote[]; unconverted: UnconvertedNote | null }
export type SnapshotResult =
  | (SnapshotBase & { kind: 'logged'; snapshot: DecideSnapshot })
  | (SnapshotBase & { kind: 'rough'; figures: RoughFigures })
  | (SnapshotBase & { kind: 'none' });

export type PayMethod = 'cash' | 'loan' | 'instalment' | 'card';
export type InvestMethod = 'lump' | 'monthly';
export type MethodKey = PayMethod | InvestMethod;
export const PAY_METHODS = ['cash', 'loan', 'instalment', 'card'] as const satisfies readonly PayMethod[];
export const CREDIT_TERMS = [12, 24, 36, 48, 60] as const;
export type CreditTerm = (typeof CREDIT_TERMS)[number];

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
  instalment: { amount: number | null; count: number | null; lateFee: number | null }; // lateFee: D-30, user-typed, never changes the verdict
  card: { accountId: string | null; payoff: 'full' | 'months' | 'minimum'; months: number; promo: PromoInput | null; variable: boolean; fees: number | null }; // fees: D-44 / 04 D-63 cardFees, user-typed card fees for this purchase (minor units), null = none (absent in stored JSON = null)
  investTermMonths: number | null;
  setbacks: SetbackLine[];         // <= 12
  projectionRates: string[];       // D-31 / UI-SPEC assumption 17: the check's ONE rate list, up to 3 user rates as decimal strings in entry order; [] = 0% only. The Kept column uses the first (D-07 "+ Add a rate")
  investHorizonMonths: number | null; // D-31 horizon chip; null = the plan term, or 60 months for cash
  investHoldingFeeText: string | null; // D-44 / 04 D-63: optional holding fee %/year for the investing views (decimal string, 0..100), null = no fee; never pre-filled
  combine: boolean;                // D-24 "With my other open checks": default true, remembered per check (A13); autosaved, no undo step
  coolingOff: boolean;             // D-35 "Check again in 48 hours": default false; honoured only when the size is needs_spreading
  incomeChange: { direction: 'raises' | 'lowers'; amount: number | null; startDate: string | null; likelihood: 'likely' | 'uncertain' } | null; // D-32; null = "This changes my income" off
  cheaperRatioPercent: number | null; // 30..100; null = engine default
  wait: { monthlyAmount: number | null };
  outcome: 'go' | 'wait' | 'pass' | null;
  goAccountId: string | null;      // A6: the cash account Go ahead writes to (buy and invest)
  investAccountId: string | null;  // invest Go ahead (05-20): a lump becomes a pending transfer into this investment account; null → a pending outflow from goAccountId
  scope: 'personal' | 'household'; // D-18; always 'personal' until Phase 8
  split: { kind: 'even' | 'weight' | 'amount' | 'mine'; weights: number[]; amounts: number[] } | null;
  cardNotes: { incomeStops: CardNoteAnswer; noNewSpending: CardNoteAnswer; jobLossCover: CardNoteAnswer };
}

export interface QuickInputs { name: string; price: number | null; mode: 'cash' | 'credit'; aprText: string; termMonths: CreditTerm; taxText: string; fees: number | null }

// 'none' = no full month and no rough figures: status 'none', copy "There is nothing to judge this against yet." (no chip, no size).
// 'cash_only' = the onboarding skip path (rough figures skipped): cash only, never a cushion or a month claim (05-07, 05-09, 05-23).
export type QuickComputation =
  | { kind: 'incomplete' }
  | { kind: 'none' }
  | { kind: 'unconverted'; currencies: readonly string[] } // D-37: no figure, chip 'Missing terms', "Run the full check" disabled
  | { kind: 'cash_only'; check: BuyCheck; resolvedPrice: ResolvedPrice; dayOne: MinorUnits; cashAfter: MinorUnits; monthly: MinorUnits | null; termMonths: number | null; months: number | null } // Credit: termMonths = the entered term, months = plan.months (the months actually paid, D-45 / 04 D-64); both null in Cash
  | { kind: 'logged'; decision: Decision; verdict: Verdict; check: BuyCheck; resolvedPrice: ResolvedPrice } // verdict === decision.verdict
  | { kind: 'first_read'; firstRead: FirstRead; check: BuyCheck; resolvedPrice: ResolvedPrice };

export interface CheckComputation {
  status: 'incomplete' | 'logged' | 'first_read' | 'none' | 'unconverted'; // 'unconverted': D-37, every engine field null, check/resolvedPrice/methodPlans still filled
  missingInput: 'price' | 'method' | null;
  check: PurchaseCheck | null;
  resolvedPrice: ResolvedPrice | null;
  running: RunningCosts | null;
  methodPlans: Partial<Record<MethodKey, PlanResult>>;
  decision: Decision | null;       // decide(snapshot, check, otherChecks): the main entry (04-PHASE5-ALIGNMENT)
  verdict: Verdict | null;         // === decision.verdict (the combined position)
  firstRead: FirstRead | null;
  context: AssessContext | null;   // verdict.context when the verdict is not missing (never a separate prepareContext call)
  options: readonly DecideOption[];
  alternatives: Alternatives | null;
  setbacks: SetbackReport | null;
  waitPlan: WaitPlan | null;
  unconverted: UnconvertedNote | null;           // D-37
  investmentViews: InvestmentViews | null;       // D-31: buy checks on a resolved verdict, investmentViews(verdict.context, check, verdict, { horizonMonths, holdingFee }) (holdingFee: D-44 / 04 D-63)
  incomeAtRisk: IncomeAtRiskReport | null;       // D-32: incomeAtRisk(verdict.context, verdict, setbacks)
  runningCostPrompts: readonly RunningCostCategory[]; // D-33: runningCostPrompts(inputs.itemType) for buy checks, from the inputs alone (step 2 shows them before a price exists)
  promoBalanceAtEnd: Partial<Record<'loan' | 'card', MinorUnits>>; // D-52: the balance left when a typed promotion ends ("Left when it ends: {x}", UI-SPEC D-30), per method plan with a promo that resolved; the engine's PromoOutcome has no such field, so 05-07 reads `balanceAtPromoEnd` / `balancesByMonth` from the payoff barrel's schedule functions; {} otherwise
}

// D-24 (part 2): the other open checks a check is judged with. Built by 05-12's selectOtherChecks; counts feed the "open check not counted" Assumptions row (A16).
export interface StackSelection { otherChecks: readonly StackedCheckInput[]; openCount: number; leftOutIncomplete: number; leftOutCurrency: number } // openCount = other open checks before filtering
export const EMPTY_STACK: StackSelection = { otherChecks: [], openCount: 0, leftOutIncomplete: 0, leftOutCurrency: 0 };

// Home list chip (05-21): the cheaper assess() entry, recomputed per render, never stored (D-15).
export type ChipComputation =
  | { status: 'incomplete'; missingInput: 'price' | 'method'; price: MinorUnits | null }
  | { status: 'none'; price: MinorUnits; method: MethodKey }
  | { status: 'unconverted'; price: MinorUnits; method: MethodKey } // D-37: chip 'Missing terms'
  | { status: 'first_read'; state: FirstRead['state']; price: MinorUnits; method: MethodKey; left: MinorUnits | null } // left null when the first read is missing (no plan resolved)
  | { status: 'logged'; state: Verdict['state']; price: MinorUnits; method: MethodKey; left: MinorUnits | null }; // left null when the verdict is missing
export type { AlternativeRow };
