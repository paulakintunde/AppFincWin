/**
 * The one judge (05.1-24; v3 §4.5, §4.6, UP §5.3, I23, I31, I38, D-10, D-23, D-30, D-32).
 * The only place a code is decided. Notices and lines never change it: lines become facts, notices are fixed text keys.
 *
 * Ladder (one-off part, cash check first):
 *   cash payday / not covered                       -> not_yet (payday only when the ladder below would pass by then;
 *                                                      otherwise the later of payday and the ladder month; a cash
 *                                                      not_covered is also the later of the ladder month and the pay date)
 *   P <= monthLeft (when above 0)                   -> fits_month
 *   P <= unspent (this month's room counted once)   -> fits_unspent
 *   unspent unknown and P above this month's room   -> needs_input
 *   P <= unspent + money saved above the net's size -> fits_unspent (05.4 D-35: money above the size is spare)
 *   the cash path dips into the overdraft and P <= that + the dip -> fits_uses_overdraft (05.4 FIN-03)
 *   P <= that + what the net can lend               -> fits_uses_net, "Dips into your safety net" (05.4 FIN-02, ENG-04)
 *   otherwise                                       -> not_yet, ready in ceilDiv(P - unspent, typicalLeft) months
 * Safety net (05.4 FIN-01, FIN-02, ENG-03, ENG-04; D-05, D-06, D-35, D-41, D-49): only money already saved is protected, so the
 * floor is min(saved, size) and nothing is held back for the unsaved part. Spare money and the 90-day path stay above that floor;
 * a purchase that only fits by using the net's money is fits_uses_net, whatever its purpose (the 05.1 I38 gate is retired). A fit
 * while the net is empty or small is amber (no_net / small_net). Protection off, or a $0 net, counts the net's money like any
 * other money, and a purchase that uses it says so (protection_off). The engine never returns emergency_use any more.
 * 05.4 ENG-02: unspent and month left are signed; a negative unspent figure needs that much more before it is ready.
 * Overdraft (05.4 FIN-03, D-26..D-28, D-36..D-38): a 90-day low point below 0 but not past the overdraft floor turns any fit
 * into fits_uses_overdraft (variant not_cleared when the next pay does not clear it); past the floor is not_yet (D-27).
 * Debts (05.4 FIN-04, FIN-10, D-39b): minimums are on the cash path (debts.ts). A fits_unspent that uses money saved in earlier
 * months while a debt at 20% APR or more remains is costly_debt; the debt and housing fact lines never change the answer.
 * Monthly part: typicalLeft - M < 0 -> monthly_short; lowLeft - M < 0 -> fits with the low-month clause (I23).
 * Short month (05.4 FIN-06 / ENG-06, settled disagreement 5): before any other monthly rule, a usual month at or below 0, or a
 * plan whose first payment falls this month while this month is heading below 0 (the spare money after this month's plans, signed;
 * this month's own figure when spare money is unknown), is monthly_short for any earner (I57).
 * Tight (05.4 FIN-07, D-40, tight.ts): a fit whose monthly part takes more than 80% of the usual room or leaves under the floor
 * (the user's line, else a tenth of a usual month's bills plus everyday spending), or a one-off (or a D-68 plan judged by cash)
 * that leaves under the floor, carries the variant tight and the tight_floor fact. It ranks at the top of the fit variants (below
 * the D-63 / D-65 month-short headlines) and is never put on Dips into your safety net or Uses your overdraft (D-50 (2)). The
 * one-off money left is the spare money after this month's plans plus the extra savings still above the net's size, less the
 * purchase (SN-11: £3,000 - £2,950 = £50); this month's own figure stands in for spare money when that is unknown (I58).
 * D-68 (judge/shortPlan.ts): a plan whose payments all fall inside the 90 days, with no running cost, whose monthly part does not
 * fit and whose whole cost the one-off ladder covers as a cash fit on the dated path, is judged as that one-off; the monthly part
 * no longer leads, and the answer carries the short_plan_from_cash caution line.
 * The stricter part leads (CODE_PRECEDENCE). The funding split always sums to P (month, own envelope, earlier unspent, and
 * 'emergency' for money taken from the safety net's account). The user's confirmed (rolled) unspent figure is always the one judged against,
 * even when it has drifted (D-30); drift only adds a notice and the unspent_drifted reason.
 *
 * Unspent after = unspent - (money taken from this month and from earlier unspent). Money from the purchase's own
 * envelope and the safety net is not unspent money, so it does not reduce it. Scenario 02 (price 120000 against
 * unspent 240000) therefore gives 120000. D-18 "return refund" is a re-run after the purchase was logged and refunded:
 * its figure is the rolled unspent, not a judge subtraction, so the two do not conflict.
 */
import type { MinorUnits } from '../../../money/types';
import { minorUnits } from '../../../money/types';
import { currencyExponent } from '../../../money/currencyExponents';
import { myPart } from '../../share';
import { SIMULATION_MONTH_CAP } from '../../../payoff/constants';
import { ceilDivide, minorFromBigInt } from '../../../payoff/types';
import { CASH_PATH_DAYS_V3, CODE_PRECEDENCE, FURTHER_SHORTFALL_MAJOR, LEGACY_STATE_OF_CODE, MISSING_PRIORITY, RECONFIRM_MIN_MONTHS } from '../constants';
import { addDays, addYearMonths, daysBetween, yearMonthOf } from '../dates';
import type { CashCheck, CashPathV3 } from '../cash/path';
import { billsHeldTotal, cappedSpare, confirmedUnspent, moveMoneyBy, sourceSplit } from '../moneySource';
import { costlyDebt, costlyFacts, debtFacts } from '../debts';
import { depletionFacts, monthAlreadyShort, monthShortTier, planTotal } from '../depletion';
import { askFact, borrowingFacts, cashFits, cashSoon, isExpensive, saveVsBorrow, saveVsBorrowFact, type PlanRate } from '../borrowing';
import { paymentsInRange } from '../plan/schedule';
import { afterBuyBlock, firstPaymentLater } from '../afterBuy';
import { emergencyOf } from '../funds/emergency';
import { NO_NET, fitVariant, netDip, type ResolvedNet } from '../safetyNet';
import { isTight, isTightOneOff, monthlySpendingOf, tightFact, tightFloor } from '../tight';
import { noLimitFacts, otherOverdrawnFacts, overdraftUseFacts, type OverdraftCtx } from '../overdraft';
import { withReason } from '../confidence/reasons';
import { dependsOnMonths, expectedFor, isLeanMonth, leanRun, seasonEveryday } from '../month/incomePattern';
import { seasonalReadyMonth } from '../month/seasonWalk';
import type {
  Band,
  Code,
  ExpectedMonthIncome,
  IncomeMonth,
  IncomePicture,
  Layer,
  Confidence,
  Fact,
  Funds,
  FundingSegment,
  MissingCode,
  MonthModel,
  Notice,
  Purchase,
  ReadyBy,
  ReasonCode,
  Result,
  V3Inputs,
  Variant,
} from '../types';
import { evaluateLines } from './lines';
import { needsInput } from './needsInput';
import { firstPaymentsToday } from './purchase';
import { shortPlanByCash } from './shortPlan';

export interface JudgeInput {
  readonly inputs: V3Inputs;
  readonly month: MonthModel;
  readonly funds: Funds;
  readonly purchase: Purchase | null;
  readonly purchaseMissing: readonly MissingCode[];
  /** Band and layers for a priced check whose purchase is not built yet. */
  readonly purchasePreview?: { readonly band: Band; readonly layers: readonly Layer[] } | null;
  readonly purchaseFacts: readonly Fact[];
  readonly purchaseReasons: readonly ReasonCode[];
  readonly cash: CashCheck;
  /** 05.4 FIN-03: the overdraft floor and the paths with and without the purchase; absent in hand-built judge tests (no overdraft). */
  readonly overdraft?: OverdraftCtx | null;
  /** 05.4 FIN-01 (D-35): the safety net in force; absent in hand-built judge tests (no net: the previous rules). */
  readonly net?: ResolvedNet;
  /**
   * 05.4 D-56 / D-58: the everyday accounts alone: what they hold at month end with no purchase (spare money is capped at it), and
   * their 90-day path with the purchase (the move-by fact). Absent in hand-built judge tests: no cap and no move fact.
   */
  readonly account?: { readonly spareInAccount: MinorUnits; readonly withPurchase: CashPathV3 } | null;
  /** 05.4 FIN-05: the plan's cash route, rate and home-loan flag (prepare.ts borrowingOf). Absent for a one-off and in hand-built tests. */
  readonly borrowing?: BorrowingCtx | null;
}

/**
 * 05.4 FIN-05 (05.4-22): cash is the same purchase judged as paid once on the same reading; apr is the plan's rate (typed, else what a
 * quote implies, else null); housing is a mortgage or other home loan (D-39c).
 */
export interface BorrowingCtx {
  readonly cash: Result;
  readonly apr: PlanRate;
  readonly housing: boolean;
}

export interface OneOffPart {
  readonly code: Code;
  readonly variant: Variant | null;
  readonly split: readonly FundingSegment[];
  readonly readyBy: ReadyBy | null;
  /** Money the split takes from the safety net's account: above its size first, then its protected part (D-35). */
  readonly netTaken: MinorUnits;
  /** The protected part the split takes (what "Dips into your safety net" names). */
  readonly netUsed: MinorUnits;
  /** How much the purchase adds to the 90-day dip the net carries (cash check 'net'); 0 otherwise. */
  readonly cashNet: MinorUnits;
}

const mu = (n: number): MinorUnits => minorUnits(n);

function rank(c: Code): number {
  return CODE_PRECEDENCE.indexOf(c);
}

function stricter(a: Code, b: Code): Code {
  return rank(a) <= rank(b) ? a : b;
}

function notYet(variant: Variant, readyBy: ReadyBy | null): OneOffPart {
  return { code: 'not_yet', variant, split: [], readyBy, netTaken: mu(0), netUsed: mu(0), cashNet: mu(0) };
}

function fit(code: Code, split: readonly FundingSegment[], netTaken = 0, netUsed = 0): OneOffPart {
  return { code, variant: null, split, readyBy: null, netTaken: mu(netTaken), netUsed: mu(netUsed), cashNet: mu(0) };
}

const ASK: OneOffPart = Object.freeze({ code: 'needs_input', variant: null, split: [], readyBy: null, netTaken: mu(0), netUsed: mu(0), cashNet: mu(0) });

/**
 * Months until the month could cover what unspent does not. null when it never could. M-04: beyond the simulation horizon
 * is 'never', like buyLater. A seasonal earner's date is walked from last year's pattern, month by month (D-60); anyone
 * else's is the gap over the typical month.
 */
function readyMonth(month: MonthModel, price: number, unspent: number | null): Extract<ReadyBy, { kind: 'month' }> | null {
  // 05.4 ENG-02: signed. Money below 0 is that much more to make up (OD-10: -1,500 is 1,500 worse, never rounded up to 0).
  const short = price - (unspent ?? 0);
  const gap = short > 0 ? short : 0; // nothing left to make up still waits for the next month
  const pic = month.incomePicture;
  if (pic !== undefined && pic.treated === 'seasonal') {
    const walked = seasonalReadyMonth(pic, month.month, BigInt(gap));
    return walked === null ? null : { kind: 'month', month: walked.month };
  }
  const tl = month.typicalLeft;
  if (tl === null || tl <= 0) return null;
  const n = Math.max(1, Number(ceilDivide(BigInt(gap), BigInt(tl))));
  if (n > SIMULATION_MONTH_CAP) return null;
  return { kind: 'month', month: addYearMonths(month.month, n) };
}

/**
 * The one-off ladder on its own: month, own envelope, earlier unspent, money above the net's size, overdraft, the net, else not
 * covered. `overdraft` is how far the cash path goes below 0 inside the limit (0 when it never does): only money the account
 * really borrows can carry what unspent money cannot, so money spoken for never counts as overdraft (I47). The net lends after
 * the overdraft: protection keeps it for last (D-35).
 */
function ladder(
  p: Purchase,
  month: MonthModel,
  available: { readonly unspent: MinorUnits | null; readonly envelope: MinorUnits },
  overdraft: number,
  net: ResolvedNet
): OneOffPart {
  const P = p.dayOne;
  // A funding segment is never negative: a month already below 0 funds nothing, and its shortfall is inside unspent already
  // (this month's room is counted once), so it is not taken off twice.
  const B = month.monthLeft > 0 ? Math.min(P, month.monthLeft) : 0;
  const A = Math.min(P - B, available.envelope);
  const rest = P - B - A;

  const split: FundingSegment[] = [];
  if (B > 0) split.push({ source: 'month', amount: mu(B) });
  if (A > 0) split.push({ source: 'envelope', amount: mu(A) });

  if (rest === 0) return fit(A > 0 ? 'fits_unspent' : 'fits_month', split);

  const unspent = available.unspent;
  if (unspent === null) return ASK;
  // 05.4 ENG-02: signed; earlier money below 0 has to be made up first.
  const earlierRoom = unspent - B;
  if (rest <= earlierRoom) {
    split.push({ source: 'unspent_earlier', amount: mu(rest) });
    return fit('fits_unspent', split);
  }
  const fromEarlier = earlierRoom > 0 ? earlierRoom : 0;
  const above = net.aboveSize;
  const withEarlier = (): FundingSegment[] => (fromEarlier > 0 ? [...split, { source: 'unspent_earlier', amount: mu(fromEarlier) }] : split);

  // 05.4 D-35: money saved above the net's size can be used; D-56: it is extra savings, never the safety net.
  if (rest <= earlierRoom + above) {
    const taken = rest - fromEarlier;
    return fit('fits_unspent', [...withEarlier(), { source: 'extra_savings', amount: mu(taken) }], taken);
  }

  // 05.4 FIN-03 (D-26, D-36): what earlier money cannot cover, the overdraft does, up to how far the account really goes below 0.
  if (overdraft > 0 && rest <= earlierRoom + above + overdraft) return fit('fits_uses_overdraft', split);

  // 05.4 FIN-02 / ENG-04 (D-35, D-41, D-49): the protected part of the net (all of it when protection is off), any purpose.
  if (rest <= earlierRoom + above + net.usable) {
    const taken = rest - fromEarlier;
    // D-56: the money above the size first, as extra savings; the protected part is the rest (never below 0).
    const fromExtra = Math.min(above, taken);
    const segs: FundingSegment[] = [...withEarlier()];
    if (fromExtra > 0) segs.push({ source: 'extra_savings', amount: mu(fromExtra) });
    if (taken - fromExtra > 0) segs.push({ source: 'emergency', amount: mu(taken - fromExtra) });
    return fit('fits_uses_net', segs, taken, taken - fromExtra);
  }

  return notYet('not_covered', readyMonth(month, P, unspent + above));
}

/**
 * Cash check first, then the ladder. A dip until payday is not_yet, but "ready on payday" is only true when the ladder
 * would pass by then. When the ladder holds the price back too, the answer is the later of the two: the ladder's
 * month (not covered), or payday when payday falls after the start of that month. Without this a dearer price that
 * dips before payday was told "payday" while a cheaper one held back by the ladder alone got a later month (I13).
 */
export function oneOffPart(
  j: JudgeInput,
  available: { readonly unspent: MinorUnits | null; readonly envelope: MinorUnits }
): OneOffPart {
  const p = j.purchase;
  if (p === null) return ASK;
  const net = j.net ?? NO_NET;
  // 05.4 D-35: money above the net's size is spare, so it counts toward the ready date too; the net itself never does.
  const spare = available.unspent === null ? null : available.unspent + net.aboveSize;
  if (j.cash.kind === 'not_covered') {
    // The later of the ladder month and the next payday (I13 residual): never dated before the pay that would help.
    const ready = readyMonth(j.month, p.dayOne, spare);
    const pay = j.cash.payDate ?? null;
    return notYet('not_covered', ready !== null && pay !== null && pay >= `${ready.month}-01` ? { kind: 'date', date: pay } : ready);
  }
  if (j.cash.kind === 'overdraft') {
    const part = ladder(p, j.month, available, -j.cash.lowest.balance, net);
    if (part.code === 'not_yet' || part.code === 'needs_input') return part;
    // D-22, D-36: the account pays now and goes below 0, so the purchase (less its own envelope and any net money) comes out
    // of this month; nothing is taken from earlier money, which is below 0 on the way.
    const fromEnvelope = part.split.find((s) => s.source === 'envelope')?.amount ?? 0;
    const fromMonth = p.dayOne - fromEnvelope - part.netTaken;
    const split: FundingSegment[] = [];
    if (fromMonth > 0) split.push({ source: 'month', amount: mu(fromMonth) });
    if (fromEnvelope > 0) split.push({ source: 'envelope', amount: mu(fromEnvelope) });
    // D-56: the money above the net's size is extra savings; only the rest is the safety net.
    const fromExtra = Math.min(part.netTaken, net.aboveSize);
    if (fromExtra > 0) split.push({ source: 'extra_savings', amount: mu(fromExtra) });
    if (part.netTaken - fromExtra > 0) split.push({ source: 'emergency', amount: mu(part.netTaken - fromExtra) });
    return { ...part, code: 'fits_uses_overdraft', split };
  }
  const part = ladder(p, j.month, available, 0, net);
  if (j.cash.kind === 'ok') return part;
  if (j.cash.kind === 'net') {
    // 05.4 FIN-02 (D-35): the 90-day path stays above 0 only with the net's money, so any fit dips into it.
    if (part.code === 'not_yet' || part.code === 'needs_input') return part;
    // What the purchase adds to the dip is what it takes from the net; a dip that is there without it is not the purchase's.
    return { ...part, code: 'fits_uses_net', cashNet: j.cash.added };
  }
  const until = j.cash.until;
  const onPayday = notYet('payday', { kind: 'date', date: until });
  if (part.code !== 'not_yet') return onPayday; // the ladder passes (or cannot tell): payday is the only wait
  const ready = readyMonth(j.month, p.dayOne, spare);
  return ready !== null && until >= `${ready.month}-01` ? onPayday : part;
}

/** What the monthly part of a purchase needs beyond the month model (D-36, D-37). */
export interface MonthlyCtx {
  readonly asOf: string;
  readonly purchase: Purchase;
  readonly available: MinorUnits | null;
  readonly takenByOneOff: MinorUnits;
  readonly expected: readonly ExpectedMonthIncome[];
  /**
   * 05.4 FIN-08 / ENG-07 (05.4-23): the savings a low month draws on, after the one-off part: money left from earlier months (never
   * this month's own room, QE-05: "she needs $1,100 and has $500, and a usual month adds $600, so ... December"), money saved above
   * the safety net's size and money kept in savings accounts (QE-04: "$4,000 is in her savings account"). null when spare money is
   * not known.
   */
  readonly savings: MinorUnits | null;
  /** 05.4 FIN-08 (QE-14): what the safety net can lend a low month (ResolvedNet.usable: 0 while it is locked, D-61). */
  readonly netUsable: MinorUnits;
}

export type MonthlyCode = 'monthly_short' | 'fits_on_your_answer' | 'fits_uses_net' | 'fits_month' | 'fits_unspent' | 'not_yet' | 'needs_input';

export interface MonthlyPart {
  readonly code: MonthlyCode;
  readonly lowClause: boolean;
  /** lean_bridge: set when savings (or the safety net) carry the low months (D-37, D-46, FIN-08). */
  readonly bridge: Fact | null;
  /** lean_months_judged (seasonal) or low_month_judged (gig): which months were judged (D-46). */
  readonly why: Fact | null;
  readonly readyBy: ReadyBy | null;
  readonly reasons: readonly ReasonCode[];
  /** D-48: the income_volatile notice, shown whenever the cover question is in play. */
  readonly notices: readonly Notice[];
  /** D-48: rests_on_your_answer, set when the user said they can cover it. */
  readonly rests: Fact | null;
  /** D-48: the user said they can cover it; the answer carries the user_said_cover reason with these numbers. */
  readonly saidCover: { readonly monthly: number; readonly months: number } | null;
  /** D-48, D-59: what a needs_input monthly part asks for. */
  readonly missing: readonly MissingCode[];
  /** 05.4 FIN-08 (QE-14): what the low months take from the safety net's protected money (fits_uses_net); 0 otherwise. */
  readonly netUsed: MinorUnits;
}

const monthly = (code: MonthlyCode, over: Partial<MonthlyPart> = {}): MonthlyPart => ({
  code,
  lowClause: false,
  bridge: null,
  why: null,
  readyBy: null,
  reasons: [],
  notices: [],
  rests: null,
  saidCover: null,
  missing: [],
  netUsed: mu(0),
  ...over,
});

/** The steady rule, and the rule for any earner with no pattern information (I23). */
function steadyMonthly(month: MonthModel, M: MinorUnits): MonthlyPart {
  // No typical figure is unreachable here (needsInput asks for it first); stay on the cautious side if it ever happens.
  if (month.typicalLeft === null || month.typicalLeft - M < 0) return monthly('monthly_short');
  return monthly('fits_month', { lowClause: month.low !== null && month.low.left - M < 0 });
}

/** D-37: the months the payment touches, from the first payment's month when there is a schedule. */
function planMonthsOf(ctx: MonthlyCtx): readonly string[] {
  const all = dependsOnMonths(ctx.asOf, ctx.purchase.schedule, ctx.purchase.runningMonthly);
  if (ctx.purchase.schedule === null) return all;
  const first = yearMonthOf(ctx.purchase.schedule.firstDate);
  const kept = all.filter((ym) => ym >= first);
  return kept.length > 0 ? kept : all;
}

/**
 * 05.4 FIN-08 (05.4-23): the months a plan's payments fall in over its whole term, and the last of them (QE-04: "about 2 over the 12
 * payments", to November 2027); a running cost with no plan touches the months ahead (planMonthsOf).
 */
function termOf(ctx: MonthlyCtx, planMonths: readonly string[]): { readonly count: number; readonly last: string } {
  const s = ctx.purchase.schedule;
  if (s === null) return { count: planMonths.length, last: planMonths[planMonths.length - 1] as string };
  const months = [...new Set(paymentsInRange(s, s.firstDate, '9999-12-31').map((p) => yearMonthOf(p.date)))];
  return { count: months.length, last: months[months.length - 1] as string };
}

/**
 * D-36, D-37, 05.4 FIN-08 / ENG-07 (05.4-23). A seasonal earner's monthly part is judged against what is left in every lean month it
 * touches; a gig or other variable earner's against the lowest month of the window. When that falls short, savings are tried first
 * (QE-04), then the safety net's money, never silently (QE-14: Dips into your safety net); only when neither carries the low months
 * is the user asked whether they can cover them (volatile_cover_question). A yes is "Only on your answer" (fits_on_your_answer,
 * QE-03); a no is Not yet, ready when savings could carry a low month (QE-05).
 * Gig: every window month that cannot carry the payment is a low month; they are counted over the whole term at the rate the window
 * shows (ceil(low months x term / window months), QE-04: 1 in 6 over 12 payments is 2). Savings must cover one low month now, and
 * every low month over the term less what the usual months in between leave after the payment (the bridge need). Seasonal: the
 * run of lean months the plan must outlast, all from savings.
 */
function leanMonthly(month: MonthModel, M: MinorUnits, pic: IncomePicture, ctx: MonthlyCtx): MonthlyPart {
  const planMonths = planMonthsOf(ctx);
  const seasonal = pic.treated === 'seasonal';
  const Mb = BigInt(M);
  const leftBy = new Map<string, bigint>();
  if (seasonal) {
    for (const ym of planMonths) {
      const expected = expectedFor(pic, ctx.expected, ym);
      const everyday = seasonEveryday(pic, ym) ?? month.e;
      if (expected === null || everyday === null) return monthly('needs_input');
      leftBy.set(ym, BigInt(expected.amount) - BigInt(month.recurringBills) - BigInt(everyday) - BigInt(month.setAside));
    }
  } else if (pic.treated !== 'steady' && (month.low === null || pic.months.length === 0)) {
    return steadyMonthly(month, M);
  }
  // FIN-08: a steady earner reaches here only with a month whose pay arrived low (monthlyPart); those months are the low ones, out of
  // the months of the usual-month window.
  const gigMonths = pic.treated === 'steady' ? (pic.lowPay as readonly IncomeMonth[]) : pic.months;
  const windowCount = pic.treated === 'steady' ? Math.max(gigMonths.length, month.monthsUsed.length) : gigMonths.length;
  const leftOf = (ym: string): bigint => leftBy.get(ym) as bigint;
  const { count: term, last: termLast } = termOf(ctx, planMonths);

  let leanLeft: bigint;
  let toCarry: number;
  let until: string;
  let why: Fact;
  let leanFrom: string;
  let leanTo: string;
  if (seasonal) {
    const records = pic.fullMonths >= RECONFIRM_MIN_MONTHS;
    const picked = planMonths.filter((ym) => (records ? isLeanMonth(pic, ym) : leftOf(ym) < Mb));
    const lean = picked.length > 0 ? picked : planMonths;
    leanLeft = lean.map(leftOf).reduce((a, b) => (b < a ? b : a));
    let carried: readonly string[];
    if (records) {
      const run = leanRun(pic, planMonths);
      const start = planMonths.findIndex((ym) => isLeanMonth(pic, ym));
      carried = run > 0 ? planMonths.slice(start, start + run) : planMonths.filter((ym) => leftOf(ym) < Mb);
    } else {
      carried = lean;
    }
    toCarry = carried.length;
    until = carried[toCarry - 1] as string;
    leanFrom = lean[0] as string;
    leanTo = lean[lean.length - 1] as string;
    why = {
      code: 'lean_months_judged',
      values: { from: lean[0] as string, to: lean[lean.length - 1] as string, leanLeft: minorFromBigInt(leanLeft, 'monthlyPart') },
    };
  } else {
    // FIN-08 (QE-04): the lowest window month, and how many window months cannot carry the payment.
    const lowest = gigMonths.reduce((a, b) => (b.left < a.left ? b : a));
    leanLeft = BigInt(lowest.left);
    const lows = gigMonths.filter((m) => BigInt(m.left) < Mb).length;
    toCarry = Math.min(term, Math.max(1, Number(ceilDivide(BigInt(lows * term), BigInt(windowCount)))));
    until = termLast;
    leanFrom = lowest.month;
    leanTo = lowest.month;
    why = { code: 'low_month_judged', values: { month: lowest.month, left: lowest.left } };
  }

  // Step 1 (D-36): what is left in the lean months covers the payment.
  if (leanLeft - Mb >= 0n) return monthly('fits_month', { why, reasons: seasonal ? ['lean_months_used'] : [] });

  // Step 2 (D-37, FIN-08): the shortfall in every low month to carry is a bridge paid from savings, then the safety net.
  const shortfall = Mb - leanLeft;
  const bridge = shortfall * BigInt(toCarry);
  // Gig: the usual months between the low months leave typicalLeft - M each, so savings need one low month now and the rest less that.
  const usualLeft = BigInt(month.typicalLeft ?? 0) - Mb;
  const refill = seasonal || usualLeft <= 0n ? 0n : usualLeft * BigInt(term - toCarry);
  const need = seasonal ? bridge : bridge - refill > shortfall ? bridge - refill : shortfall;
  if (ctx.savings === null) return monthly('needs_input');
  const savings = BigInt(ctx.savings);
  const usable = BigInt(ctx.netUsable);
  const leanBridge = (source: 'savings' | 'net'): Fact => ({
    code: 'lean_bridge',
    values: {
      source,
      month: leanFrom,
      shortfall: minorFromBigInt(shortfall, 'monthlyPart'),
      times: toCarry,
      payments: term,
      until,
      bridge: minorFromBigInt(bridge, 'monthlyPart'),
      savings: minorFromBigInt(source === 'savings' ? savings : usable, 'monthlyPart'),
    },
  });
  // QE-04: savings carry it, so the records alone show it fits, with the low-month caution.
  if (savings >= need) return monthly('fits_month', { why, lowClause: true, bridge: leanBridge('savings') });
  // QE-14: the low months need money protected in the safety net: Dips into your safety net, never silently.
  if (savings + usable >= need) {
    const fromNet = bridge - savings < usable ? bridge - savings : usable;
    return monthly('fits_uses_net', { why, bridge: leanBridge('net'), netUsed: minorFromBigInt(fromNet, 'monthlyPart') });
  }

  // Step 3 (D-48, FIN-08): neither carries the low months, so the user is asked; what they say decides the monthly part. A yes is
  // "Only on your answer" with the user_said_cover reason; a no waits until savings could carry a low month. The notice says which
  // months were judged, whatever the answer.
  const sched = ctx.purchase.schedule;
  const notice: Notice = {
    code: 'income_volatile',
    values: {
      payment: sched === null ? M : myPart(sched.payment, ctx.purchase.share),
      periods: sched === null ? term : sched.count,
      monthly: M,
      months: term,
      leanFrom,
      leanTo,
      leanLeft: minorFromBigInt(leanLeft, 'monthlyPart'),
    },
  };
  const answer = ctx.purchase.volatileCover ?? null;
  if (answer === null) return monthly('needs_input', { why, notices: [notice], missing: ['volatile_cover_question'] });
  if (answer) {
    const rests: Fact = { code: 'rests_on_your_answer', values: { monthly: M, months: term } };
    return monthly('fits_on_your_answer', { why, notices: [notice], rests, saidCover: { monthly: M, months: term } });
  }
  return monthly('not_yet', {
    why,
    notices: [notice],
    reasons: ['volatile_cover_declined'],
    readyBy: readyMonth(month, minorFromBigInt(need, 'monthlyPart'), ctx.savings),
  });
}

/**
 * 05.4 FIN-06 / ENG-06 (settled disagreement 5): the first payment falls in this month, and this month is heading below 0. "Heading"
 * reads the spare money after this month's plans (signed, ENG-02; earlier money below 0 counts, BR-06: $400 - $600 = -$200), or
 * this month's own figure when spare money is unknown.
 */
function startsInShortMonth(month: MonthModel, ctx: MonthlyCtx): boolean {
  const s = ctx.purchase.schedule;
  if (s === null || yearMonthOf(s.firstDate) !== month.month) return false;
  return (ctx.available ?? month.monthLeft) < 0;
}

/**
 * The monthly part (I23, D-36, D-37). Without `ctx`, or for a steady earner, the typical month decides: typicalLeft - M < 0
 * is monthly_short; lowLeft - M < 0 fits with the low-month clause.
 */
export function monthlyPart(month: MonthModel, M: MinorUnits, ctx?: MonthlyCtx): MonthlyPart | null {
  if (M === 0) return null;
  // 05.4 FIN-06 / ENG-06: no new monthly payment fits a usual month at or below 0, or a month heading below 0 that it starts in.
  if (month.typicalLeft !== null && month.typicalLeft <= 0) return monthly('monthly_short');
  if (ctx !== undefined && startsInShortMonth(month, ctx)) return monthly('monthly_short');
  const pic = month.incomePicture;
  if (ctx === undefined || pic === undefined) return steadyMonthly(month, M);
  // 05.4 FIN-08 (QE-04): a steady earner whose pay arrived low in a month that could not carry the payment is judged on those low
  // months like a variable earner (savings first, then the net, then the question), once the usual month itself carries it.
  if (pic.treated === 'steady') {
    const lowPay = (pic.lowPay ?? []).some((m) => m.left < M);
    if (!lowPay || month.typicalLeft === null || month.typicalLeft - M < 0) return steadyMonthly(month, M);
  }
  return leanMonthly(month, M, pic, ctx);
}

function unique<T>(xs: readonly T[]): T[] {
  return [...new Set(xs)];
}

/** D-59: the one place a missing list is ordered. */
function inPriority(codes: readonly MissingCode[]): MissingCode[] {
  return [...codes].sort((a, b) => MISSING_PRIORITY.indexOf(a) - MISSING_PRIORITY.indexOf(b));
}

function judgeNotices(j: JudgeInput, missing: readonly MissingCode[]): Notice[] {
  const out: Notice[] = [...j.month.notices];
  // 05.4 FIN-01: a safety-net record says whether a net is set, so "not set" is only said without one.
  const em = emergencyOf(j.inputs.emergency).notice;
  if (em && (j.inputs.safetyNet ?? null) === null) out.push(em);
  const u = j.funds.unspent;
  if (u !== null && u.stale) out.push({ code: 'unspent_stale', values: { days: daysBetween(u.anchor.at, j.inputs.asOf) } });
  if (u !== null && u.drifted) out.push({ code: 'unspent_drifted', values: { suggested: j.funds.suggested } });
  if (j.month.reasons.includes('quick_estimates_used')) out.push({ code: 'from_your_figures', values: {} });
  const f = j.funds;
  // D-49, D-54: an envelope linked to no account is taken to sit inside the spending money.
  if ((f.envelopesAssumedInside ?? 0) > 0) out.push({ code: 'envelope_location_assumed', values: { count: f.envelopesAssumedInside as number } });
  // D-50: money above what the records explain.
  if (missing.includes('unexplained_money_question')) out.push({ code: 'unexplained_money', values: { amount: f.unexplained as number } });
  // D-54, D-62: the account question first; the fund question only once every account has a stated use.
  const unstated = f.unstatedAccounts ?? [];
  if (unstated.length > 0) {
    out.push({ code: 'account_use_unknown', values: { accountId: unstated[0] as string, count: unstated.length } });
  } else if (unstated.length === 0 && f.fundUnlinked === true) {
    out.push({ code: 'fund_account_unknown', values: { amount: f.emergency ?? 0 } });
  }
  // D-58: a past pay with no matching line. The first unanswered one is asked; each one answered "not yet" is counted missed.
  const unseen = j.month.unseenPay ?? [];
  const unanswered = unseen.find((p) => p.arrived === null);
  if (unanswered !== undefined) {
    out.push({ code: 'pay_not_seen', values: { amount: unanswered.amount, date: unanswered.date } });
  }
  for (const p of unseen) if (p.arrived === false) out.push({ code: 'pay_counted_missed', values: { amount: p.amount, date: p.date } });
  return out;
}

function judgeConfidence(j: JudgeInput): Confidence {
  let c = j.month.confidence;
  const u = j.funds.unspent;
  if (u !== null && u.stale) c = withReason(c, 'unspent_stale', { days: daysBetween(u.anchor.at, j.inputs.asOf) });
  if (u !== null && u.drifted) c = withReason(c, 'unspent_drifted', { value: u.value, suggested: j.funds.suggested });
  if (j.month.reasons.includes('quick_estimates_used')) c = withReason(c, 'quick_estimates');
  // D-58: a pay counted as missed is a careful answer that still works; the reason carries the pay left out.
  const missed = (j.month.unseenPay ?? []).filter((p) => p.arrived === false);
  if (missed.length > 0) c = withReason(c, 'pay_missed', { count: missed.length, amount: minorFromBigInt(missed.reduce((t, p) => t + BigInt(p.amount), 0n), 'judgeConfidence') });
  return c;
}

/** A comparable key: a date, or the first of a month. null (never) sorts last. */
function readyKey(r: ReadyBy | null): string {
  if (r === null) return '9999-99-99';
  return r.kind === 'date' ? r.date : `${r.month}-01`;
}

/**
 * 05.4 FIN-02 / ENG-04 (D-35, D-41): the facts of a purchase that dips into the net. used is the larger of what the split takes
 * from the protected part and what the purchase adds to the 90-day dip the net carries; the wait date is the later of the payday that clears
 * the dip and the month spare money covers the price alone (a tie keeps the exact day).
 */
function netDipFacts(j: JudgeInput, net: ResolvedNet, one: OneOffPart, p: Purchase, unspent: MinorUnits | null, protectedUsed: MinorUnits, fromExtra: MinorUnits): Fact[] {
  // D-56: one protected figure feeds both the split's 'emergency' segment and net_used.
  const dip = netDip(protectedUsed, fromExtra, net, j.month.typicalLeft);
  const waits: ReadyBy[] = [];
  if (j.cash.kind === 'net' && j.cash.until !== null) waits.push({ kind: 'date', date: j.cash.until });
  // The split takes protected net money only past known unspent money (ladder), so unspent is known here.
  if (one.netUsed > 0) {
    const ready = readyMonth(j.month, p.dayOne, (unspent as MinorUnits) + net.aboveSize);
    if (ready !== null) waits.push(ready);
  }
  const wait = waits.reduce<ReadyBy | null>((a, b) => (a === null || readyKey(b) > readyKey(a) ? b : a), null);
  const out: Fact[] = [];
  if (p.canUseEmergency) out.push({ code: 'need_net_line', values: {} });
  else if (wait !== null) out.push({ code: 'wait_keeps_net', values: wait.kind === 'date' ? { date: wait.date } : { month: wait.month } });
  out.push({ code: 'net_used', values: { used: dip.used } });
  // A 90-day dip the net carries also uses the money above its size first: what stays is the net at that low point.
  const atLow = j.cash.kind === 'net' ? net.saved - net.aboveSize - j.cash.used : dip.left;
  out.push({ code: 'net_left', values: { left: mu(Math.max(0, Math.min(dip.left, atLow))) } });
  if (dip.refillMonths !== null) out.push({ code: 'net_refill', values: { months: dip.refillMonths } });
  if (net.zeroIsOff) out.push({ code: 'net_zero_is_off', values: { zero: 0 } });
  else if (net.off) out.push({ code: 'net_protection_off', values: {} });
  else if (net.state === 'small') out.push({ code: 'net_progress', values: { saved: net.saved, size: net.size } });
  return out;
}

/**
 * 05.4 FIN-01 (D-06, D-25, D-35): what the answer says about the net when it does not dip into it. Empty or small: the starter
 * line or the progress line, on any fit (a losing no_net / small_net variant keeps its fact) and on Uses your overdraft (round
 * 1b). Above its size: the spare money above it. Untouched only when something is saved (D-25). A $0 net says it counts as off.
 */
function netStateFacts(net: ResolvedNet, code: Code, dips: boolean, extraUsed: boolean): Fact[] {
  const out: Fact[] = [];
  const fits = code === 'fits_month' || code === 'fits_unspent' || code === 'fits_uses_overdraft' || code === 'fits_on_your_answer'; // FIN-08: Only on your answer too
  if (!dips && !net.off && fits && net.state === 'none') out.push({ code: 'net_none_start', values: { starter: net.starter } });
  if (!dips && !net.off && fits && net.state === 'small') out.push({ code: 'net_progress', values: { saved: net.saved, size: net.size } });
  if (net.aboveSize > 0) out.push({ code: 'net_above_size', values: { above: net.aboveSize } });
  // D-56: extra savings used while the net's size is under 2 months of essential costs: 2 months gives more cover.
  if (extraUsed && net.size < net.starter * 2) out.push({ code: 'net_two_months', values: { twoMonths: mu(net.starter * 2) } });
  if (!dips && net.saved > 0) out.push({ code: 'emergency_untouched', values: { amount: net.off ? net.saved : net.floor } });
  if (!dips && net.zeroIsOff) out.push({ code: 'net_zero_is_off', values: { zero: 0 } });
  return out;
}

/**
 * 05.4 FIN-11 (D-47): the hold-back for yearly and every-3-month bills, then one line per such bill naming it, its amount and its
 * due date, whatever the hold-back (RC-10: nothing held back, the insurance due in 4 months still shown).
 */
function billFacts(funds: Funds): Fact[] {
  const held = funds.billsHeld;
  if (held === undefined) return [];
  const out: Fact[] = [];
  if (held.total > 0) out.push({ code: 'bills_held_back', values: { total: held.total } });
  for (const b of held.parts) out.push({ code: 'yearly_bill_ahead', values: { seriesId: b.seriesId, amount: b.amount, dueDate: b.dueDate } });
  return out;
}

/**
 * 05.4 FIN-05 (05.4-22): when a Not yet plan could start. A plan whose payments all land inside the 90 days, with no running cost,
 * is judged like paying its whole cost at once (BR-12: "judged like paying £900 at once ... £500 more at £80 a month = 7 months";
 * BR-19, BR-20, owner 2026-11-03: "use the hand date from BR-12's whole-cost rule"). Any other plan needs what it takes on day one
 * and its first payment (when that is not already in day one) before it starts (BR-13: "a plan started in March fits"). The later
 * of this and the ready date as judged leads (never earlier); null (never) stays never.
 */
function planReadyBy(month: MonthModel, p: Purchase, asOf: string, spare: number | null, judged: ReadyBy | null): ReadyBy | null {
  const s = p.schedule as NonNullable<Purchase['schedule']>;
  const firstNow = firstPaymentsToday(s, p.share, asOf);
  const inside = p.runningMonthly === 0 && paymentsInRange(s, asOf, addDays(asOf, CASH_PATH_DAYS_V3)).length === s.lastPaying;
  const first = s.firstDate > asOf ? myPart(minorFromBigInt(BigInt(s.payment) + BigInt(s.fees.perPeriod), 'planReadyBy'), p.share) : 0;
  const need = inside ? planTotal(p.dayOne, s, p.share, firstNow) : p.dayOne + first;
  // Spare money that already covers it adds no wait of its own (a payday wait stays the payday).
  if ((spare ?? 0) >= need) return judged;
  const plan = readyMonth(month, need, spare);
  return readyKey(plan) > readyKey(judged) ? plan : judged;
}

/**
 * 05.4 FIN-08 (05.4-23; QE-04, D-44): money kept in savings accounts (a savings account whose use is "kept, not spent"). It never pays
 * a purchase; it can carry a low month's shortfall and counts in the D-46 runway, as money saved in earlier months.
 */
export function keptSavings(accounts: V3Inputs['accounts']): number {
  let total = 0;
  for (const a of accounts ?? []) if (a.kind === 'savings' && a.use !== null && a.use.kind === 'untouched' && a.balance > 0) total += a.balance;
  return total;
}

/** 05.4 FIN-08 (QE-14): the low months dip into the net: what they take, what stays, and how protection reads. */
function lowMonthNetFacts(net: ResolvedNet, used: MinorUnits): Fact[] {
  const out: Fact[] = [{ code: 'net_used', values: { used } }, { code: 'net_left', values: { left: mu(Math.max(0, net.saved - used)) } }];
  if (net.zeroIsOff) out.push({ code: 'net_zero_is_off', values: { zero: 0 } });
  else if (net.off) out.push({ code: 'net_protection_off', values: {} });
  else if (net.state === 'small') out.push({ code: 'net_progress', values: { saved: net.saved, size: net.size } });
  return out;
}

/** 05.4 D-46: the further shortfall the runway is shown with, FURTHER_SHORTFALL_MAJOR in the currency's minor units. */
export function furtherStep(currency: string): MinorUnits {
  return mu(FURTHER_SHORTFALL_MAJOR * 10 ** currencyExponent(currency));
}

/**
 * 05.4 D-40 / D-46 (QE-12): how many of a monthly plan's payments the money on hand carries the usual month's gap for. money is what
 * the month ends with before the plan (spare money after this month's plans, extra savings and kept savings); what the plan takes by
 * month end (day one and this month's later payments) comes off first, and those payments count as covered. QE-12: £15,406.45 -
 * £202.52 = £15,203.93; 1 + floor(15,203.93 / 352.52) = 44 of 48; with another £1,000 a month, 1 + floor(15,203.93 / 1,352.52) = 12.
 * Nothing when the usual month is not short with the payment, the plan is not monthly, or the money covers no further month.
 */
export function runwayFacts(r: { readonly month: MonthModel; readonly purchase: Purchase; readonly asOf: string; readonly money: MinorUnits; readonly step: MinorUnits }): Fact[] {
  const s = r.purchase.schedule as NonNullable<Purchase['schedule']>;
  const tl = r.month.typicalLeft;
  if (tl === null || s.cadence.unit !== 'month' || s.cadence.every !== 1) return [];
  const gap = r.purchase.monthly - tl;
  if (gap <= 0) return [];
  const nextMonth = `${addYearMonths(r.month.month, 1)}-01`;
  const later = paymentsInRange(s, addDays(r.asOf, 1), nextMonth);
  // a payment today is in day one already; count it as one payment covered, never by its amount
  const paid = paymentsInRange(s, r.asOf, addDays(r.asOf, 1)).length + later.length;
  const left = BigInt(r.money) - BigInt(r.purchase.dayOne) - later.reduce((t, p) => t + BigInt(myPart(p.amount, r.purchase.share)), 0n);
  const of = s.lastPaying;
  const covered = (perMonth: number): number => Math.min(of, paid + Number(left / BigInt(perMonth)));
  if (left < BigInt(gap)) return [];
  const out: Fact[] = [{ code: 'covered_from_savings', values: { savings: minorFromBigInt(left, 'runwayFacts'), gap: mu(gap), covered: covered(gap), of } }];
  const further = gap + r.step;
  if (left >= BigInt(further)) out.push({ code: 'further_shortfall_runway', values: { extra: r.step, covered: covered(further), of } });
  return out;
}

export function judge(j: JudgeInput): Result {
  const { month, funds } = j;
  const p = j.purchase;
  const confidence = judgeConfidence(j);
  const reasons = unique([...month.reasons, ...j.purchaseReasons]);
  const band = p?.band ?? j.purchasePreview?.band ?? null;
  const layers = p?.layers ?? j.purchasePreview?.layers ?? [];

  const missing = [...needsInput({ inputs: j.inputs, month, funds, purchase: p, purchaseMissing: j.purchaseMissing })];
  if (p === null && missing.length === 0) missing.push('no_price');
  const notices = judgeNotices(j, missing);

  // D-38: every check judges against available unspent money, the confirmed figure less money held back for earlier
  // plans. Drift and staleness (judgeNotices, judgeConfidence) stay on the confirmed figure (D-30).
  // 05.4 D-56: spare money can be no more than the everyday accounts really hold at month end (never below 0 here: an account
  // below 0 is the cash check's and the overdraft's to judge, D-27, D-28). Absent account (hand-built tests): no cap.
  const confirmed = confirmedUnspent(funds);
  const unspentValue = j.account == null ? confirmed : cappedSpare(confirmed, j.account.spareInAccount, billsHeldTotal(funds));
  const oneRaw = missing.length > 0 || p === null ? null : oneOffPart(j, { unspent: unspentValue, envelope: funds.ownEnvelope });

  const asking = (parts: Result['parts'], ask: readonly MissingCode[], extra: readonly Notice[] = []): Result => ({
    code: 'needs_input',
    variant: null,
    legacyState: LEGACY_STATE_OF_CODE.needs_input,
    split: [],
    facts: j.purchaseFacts,
    notices: [...notices, ...extra],
    missing: inPriority(ask.length > 0 ? ask : ['unspent_not_confirmed']), // D-59
    reasons,
    readyBy: null,
    band,
    layers,
    confidence,
    parts,
    afterBuy: afterBuyBlock({ month, asOf: j.inputs.asOf, purchase: p, fromThisMonth: null, byCash: false }),
  });

  if (oneRaw === null || oneRaw.code === 'needs_input') return asking({ oneOff: 'needs_input', monthly: null }, missing);

  const purchase = p as Purchase;
  const segment = (part: OneOffPart, source: FundingSegment['source']): number => part.split.find((s) => s.source === source)?.amount ?? 0;
  const available = unspentValue === null ? null : mu(unspentValue);
  const net = j.net ?? NO_NET;
  // 05.4 FIN-08 (05.4-23): what a low month draws on after the one-off part: money from earlier months (spare money less this month's
  // own room), money above the net's size and money kept in savings accounts; the net lends only its usable part, never silently.
  const lowSavings =
    unspentValue === null
      ? null
      : mu(unspentValue - Math.max(0, month.monthLeft) - segment(oneRaw, 'unspent_earlier') + net.aboveSize - segment(oneRaw, 'extra_savings') + keptSavings(j.inputs.accounts));
  const mon = monthlyPart(month, purchase.monthly, {
    asOf: j.inputs.asOf,
    purchase,
    available,
    takenByOneOff: mu(segment(oneRaw, 'month') + segment(oneRaw, 'unspent_earlier')),
    expected: j.inputs.expectedIncome ?? [],
    savings: lowSavings,
    netUsable: mu(Math.max(0, net.usable - oneRaw.netUsed)),
  });
  if (mon !== null && mon.code === 'needs_input') return asking({ oneOff: oneRaw.code, monthly: 'needs_input' }, mon.missing, mon.notices);

  // 05.4 D-68: a short plan that money on hand pays in full inside the 90 days is judged by cash, as a one-off of its whole cost.
  // Everything below reads `one` and `dayOne`, so they are that one-off's; with no D-68 they are the plan's own (nothing moves).
  const cashPlan = shortPlanByCash(j, purchase, mon, available, oneOffPart);
  const one = cashPlan === null ? oneRaw : cashPlan.one;
  const dayOne = cashPlan === null ? purchase.dayOne : cashPlan.total;
  const fromMonth = segment(one, 'month');
  const fromEarlier = segment(one, 'unspent_earlier');
  const fromEnvelope = segment(one, 'envelope');
  // The monthly part's bridge, why, rests, saidCover and reasons explain a monthly judgement that no longer decides; its notices
  // stay (income_volatile is shown whatever the answer, D-48).
  const said = cashPlan === null ? mon : null;
  const code = mon === null || cashPlan !== null ? one.code : stricter(one.code, mon.code);
  const lowClause = mon !== null && mon.lowClause;
  // 05.4 FIN-08 / settled dispute 4: the user's word is part of the answer only when it decides it. When the one-off part is as strict
  // or stricter, the records alone give the answer, so it does not rest on the yes (no rests line, no user_said_cover reason).
  const restsOn = said !== null && said.rests !== null && code === 'fits_on_your_answer';
  // 05.4 FIN-03 (D-26, D-36, D-37): the one-off part uses the overdraft. Its facts lead, the not-cleared warning first.
  const od = one.code === 'fits_uses_overdraft' && j.overdraft != null ? overdraftUseFacts(j.inputs.accounts, j.overdraft, readyMonth(month, dayOne, unspentValue)) : null;
  // 05.4 D-35: a fit while the net is empty or below its size is amber; the variant order is fixed (fitVariant) and a losing
  // variant still shows its fact. Protection off (or a $0 net) has no net caution, only protection_off when its money is used.
  const netState: Variant | null = net.off ? null : net.state === 'none' ? 'no_net' : net.state === 'small' ? 'small_net' : null;
  // D-56: on Dips into your safety net, the protected figure is fixed once, and the split is rebuilt around it so its 'emergency'
  // segment equals net_used and the split sums to the price paid on day one.
  const protectedUsed = mu(Math.min(Math.max(one.netUsed, one.cashNet), net.usable, dayOne - fromEnvelope));
  const split: readonly FundingSegment[] =
    one.code === 'fits_uses_net'
      ? sourceSplit({ dayOne, envelope: mu(fromEnvelope), month: mu(fromMonth), earlier: mu(fromEarlier), protectedUsed, aboveSize: net.aboveSize })
      : one.split;
  const fromExtra = split.find((s) => s.source === 'extra_savings')?.amount ?? 0;
  // D-62: a fit paid in part from extra savings is "Fits from extra savings" (on fits_unspent only).
  const extraV = code === 'fits_unspent' && fromExtra > 0 ? (['extra_savings'] as const) : [];
  // 05.4 D-39b: money saved in earlier months (spare money or extra savings, D-56) goes on a fit while a debt at 20% APR or more
  // remains: amber "Fits, but you carry costly debt". This month's spare money alone stays green (DB-11). A caution rule, so the
  // fact-lines switch never hides it or its own facts (I-DB05).
  const costly = code === 'fits_unspent' ? costlyDebt(j.inputs.debts, fromEarlier + fromExtra) : null;
  const costlyV = costly === null ? [] : (['costly_debt'] as const);
  // 05.4 FIN-07 (owner's tight rule): the monthly part of a plan takes more than 80% of the usual room, or leaves under the floor.
  // D-40: a one-off (and a D-68 plan judged by cash, a one-off of its whole cost) leaves under the floor. Floor only, no share.
  const spend = monthlySpendingOf(month);
  const line = j.inputs.tightLine ?? null;
  const fitCode = code === 'fits_month' || code === 'fits_unspent';
  const planTight = fitCode && said !== null && said.code === 'fits_month' && month.typicalLeft !== null && isTight(month.typicalLeft, purchase.monthly, spend, line);
  // The one-off money left (I58): spare money after this month's plans (this month's own figure when spare money is unknown) and the
  // extra savings above the net's size, less what the purchase takes from them (the envelope and the net are not spare money).
  const oneOffLeft = mu((unspentValue ?? month.monthLeft - one.netUsed) + net.aboveSize - fromMonth - fromEarlier - fromExtra);
  const onceTight = fitCode && (cashPlan !== null || purchase.schedule === null) && isTightOneOff(oneOffLeft, spend, line);
  const tightV = planTight || onceTight ? (['tight'] as const) : [];
  const fitV = fitVariant([...tightV, ...(lowClause ? (['low_month'] as const) : []), ...costlyV, ...extraV, ...(netState === null ? [] : [netState])]).variant;
  let variant: Variant | null = null;
  if (code === 'fits_uses_overdraft') variant = od?.variant ?? null;
  else if (code === 'fits_uses_net') variant = net.off ? 'protection_off' : null;
  else if (code === 'fits_month' || code === 'fits_unspent') variant = fitV;
  // When both parts are not yet, the later ready-by leads; ties go to the one-off part (D-36).
  let notYetVariant: Variant | null = null;
  let readyBy: ReadyBy | null = null;
  if (code === 'not_yet') {
    const monthlyLeads = mon !== null && mon.code === 'not_yet' && (one.code !== 'not_yet' || readyKey(mon.readyBy) > readyKey(one.readyBy));
    notYetVariant = monthlyLeads ? 'not_covered' : one.variant;
    readyBy = monthlyLeads ? (mon as MonthlyPart).readyBy : one.readyBy;
    // 05.4 FIN-05: a Not yet plan waits until it could start (planReadyBy); spare money counts the extra savings above the net's size.
    if (purchase.schedule !== null) readyBy = planReadyBy(month, purchase, j.inputs.asOf, unspentValue === null ? null : unspentValue + net.aboveSize, readyBy);
  }

  // Facts (fixed order): overdraft or the no-limit question, month, unspent, held back, yearly bills, emergency, envelope, plan, low month,
  // why months, bridge, lines, other accounts below 0.
  // 05.4 D-54 / D-60 / D-63: the depletion lines lead the answer (computed after the code; they never change it).
  const facts: Fact[] = [
    ...depletionFacts({
      code,
      monthly: purchase.monthly,
      whole: purchase.whole,
      dayOne: purchase.dayOne,
      schedule: purchase.schedule,
      share: purchase.share,
      typicalLeft: month.typicalLeft,
      typicalIncome: month.typicalIncome,
      net,
      netTaken: one.netTaken,
      firstNow: firstPaymentsToday(purchase.schedule, purchase.share, j.inputs.asOf),
      shortPlanCash: cashPlan !== null,
    }),
    ...(od?.facts ?? []),
  ];
  // 05.4 FIN-05: the save-or-borrow line goes right after the depletion and overdraft lines (they lead, I-D54).
  const compareAt = facts.length;
  // 05.4 FIN-07 / D-40: the floor a tight answer is under. Not under a D-63 / D-65 month-short headline (it reads after the tight body).
  if (variant === 'tight' && !monthAlreadyShort(month.typicalLeft)) facts.push(tightFact(tightFloor(spend, line)));
  // D-28, D-38: below 0 with no overdraft limit recorded is Not yet, and the answer asks about it.
  if (code === 'not_yet' && (j.overdraft?.floor ?? 0) === 0 && (j.cash.kind === 'payday' || j.cash.kind === 'not_covered')) {
    facts.push(...noLimitFacts(j.inputs.accounts, j.cash.shortBy, readyBy));
  }
  // 05.4 D-61: a locked net is left out of the answer, and a Not yet says so.
  if (code === 'not_yet' && net.locked && net.floor > 0) facts.push({ code: 'net_locked', values: { locked: net.floor } });
  // 05.4 FIN-02 (D-35, D-41): "Dips into your safety net" leads with its own facts. A need reads "Marked as a need" first and
  // drops the wait line; a want (or no purpose) leads with the date it fits without the net. Purpose changes facts and their
  // order only, never the code, the variant or a figure (I-D41).
  const dips = one.code === 'fits_uses_net' && code !== 'not_yet';
  if (dips) facts.push(...netDipFacts(j, net, one, purchase, unspentValue, protectedUsed, mu(fromExtra)));
  // 05.4 FIN-08 (QE-14): the low months dip into the net; what they take is named (a one-off dip already names its own).
  const lowDips = !dips && said !== null && said.code === 'fits_uses_net' && code === 'fits_uses_net';
  if (lowDips) facts.push(...lowMonthNetFacts(net, (said as MonthlyPart).netUsed));
  const keepSplit =
    code === 'fits_month' ||
    code === 'fits_unspent' ||
    code === 'fits_uses_net' ||
    code === 'fits_uses_overdraft' ||
    code === 'fits_on_your_answer' ||
    (code === 'monthly_short' && one.code !== 'not_yet');
  // D-56 / D-62: the extra savings a fit uses, by name.
  const extraUsed = keepSplit && fromExtra > 0;
  if (extraUsed) facts.push({ code: 'extra_savings_used', values: { used: mu(fromExtra), above: net.aboveSize } });
  // D-39b: the costly debt's monthly interest and, for a card, what the price would cut it by; shown whether or not costly_debt wins.
  if (costly !== null) facts.push(...costlyFacts(costly, mu(dayOne)));
  // D-58: the everyday account alone goes below 0 with the purchase, and money in another account covers it.
  if (j.account != null && (code === 'fits_month' || code === 'fits_unspent' || code === 'fits_uses_net')) {
    const move = moveMoneyBy(j.account.withPurchase, mu(net.aboveSize + (code === 'fits_uses_net' ? net.usable : 0)));
    if (move !== null) facts.push({ code: 'move_money_by', values: { amount: move.amount, date: move.date } });
  }
  // 05.4 FIN-09 (afterBuy.ts, D-22): the month figure is this month after its plans less what the purchase takes from this month:
  // the split's month and protected net parts when the answer keeps a split, else the day-one cost; a plan also loses its later
  // payments this month. Money from earlier months is not this month's: it is named, with where it is (D-44).
  const kept = keepSplit ? split : [];
  const fromThisMonth = kept.length === 0 ? null : mu(kept.reduce((t, s) => t + (s.source === 'month' || s.source === 'emergency' ? s.amount : 0), 0));
  const afterBuy = afterBuyBlock({ month, asOf: j.inputs.asOf, purchase, fromThisMonth, byCash: cashPlan !== null });
  if (one.split.length > 0) facts.push({ code: 'month_left_after', values: { month: month.month, left: afterBuy.month } });
  // every split segment is above 0 (the ladder and sourceSplit drop empty ones)
  for (const s of kept) {
    if (s.source === 'unspent_earlier') facts.push({ code: 'earlier_money_from', values: { amount: s.amount, where: 'account' } });
    if (s.source === 'extra_savings') facts.push({ code: 'earlier_money_from', values: { amount: s.amount, where: 'savings' } });
  }
  // What would leave unspent if it were bought: this month and earlier money, never the envelope or the net.
  const unspentAfter = unspentValue === null ? null : mu(unspentValue - (dayOne - fromEnvelope - one.netTaken));
  if (one.split.length > 0 && unspentValue !== null) {
    facts.push({ code: 'unspent_before_after', values: { before: unspentValue, after: mu(unspentValue - fromMonth - fromEarlier) } });
  }
  // D-38, D-46: money held back for an earlier plan is said once, next to the unspent figure it reduced.
  const heldBack = funds.unspent?.breakdown.heldBack ?? 0;
  if (heldBack > 0) facts.push({ code: 'unspent_held_back', values: { amount: heldBack } });
  facts.push(...billFacts(funds));
  facts.push(...netStateFacts(net, code, dips || lowDips, extraUsed));
  if (fromEnvelope > 0) facts.push({ code: 'envelope_used', values: { used: fromEnvelope, envelopeId: purchase.envelopeId } });
  facts.push(...j.purchaseFacts);
  // 05.4 D-08 (FIN-10, FIN-14): the debt and housing fact lines, on unless switched off; facts only, never the code or variant.
  // 05.4-22 (BR-15): a home loan being judged adds its monthly payment to the housing line.
  const borrow = j.borrowing ?? null;
  const sched = purchase.schedule;
  const newHousing = sched !== null && borrow !== null && borrow.housing ? purchase.monthly : 0;
  facts.push(...debtFacts(j.inputs.debts, month.typicalIncome, j.inputs.factLines !== false, costly?.id ?? null, newHousing));
  // 05.4 D-48 / D-50 (3): every plan answer carries the borrowing facts, whatever its code and even with the fact lines off; the
  // interest line is not said twice when the depletion lines already state it.
  // 05.4 D-46 (QE-12): a Short each month answer that savings carry for a while says for how many payments, and with a further shortfall.
  if (code === 'monthly_short' && sched !== null && unspentValue !== null) {
    facts.push(...runwayFacts({ month, purchase, asOf: j.inputs.asOf, money: mu(unspentValue + net.aboveSize + keptSavings(j.inputs.accounts)), step: furtherStep(j.inputs.currency) }));
  }
  if (sched !== null) {
    const total = planTotal(purchase.dayOne, sched, purchase.share, firstPaymentsToday(sched, purchase.share, j.inputs.asOf));
    facts.push(...borrowingFacts(sched, purchase.share, total, facts.some((f) => f.code === 'interest_is_a_cost')));
  }
  // A losing low_month variant keeps its fact under tight (05.4-21). FIN-08: only when that month really cannot carry the payment (a
  // savings bridge on low pay names its own months in lean_bridge).
  if ((variant === 'low_month' || (variant === 'tight' && lowClause)) && month.low !== null && month.low.left - purchase.monthly < 0) {
    // The low-month clause as a fact (v3 §12 #7, #22): the tight month, its leftover, and the monthly cost it cannot carry.
    facts.push({ code: 'low_month', values: { month: month.low.month, left: month.low.left, monthly: purchase.monthly } });
  }
  if (said !== null && said.why !== null) facts.push(said.why); // D-46
  if (said !== null && said.bridge !== null) facts.push(said.bridge); // D-46
  if (restsOn) facts.push((said as MonthlyPart).rests as Fact); // D-48, FIN-08
  facts.push(
    ...evaluateLines(j.inputs.limits, {
      month,
      purchase,
      debts: j.inputs.debts,
      unspentAfter,
      isHousing: purchase.itemType === 'rent_bill' || purchase.itemType === 'property',
    })
  );
  facts.push(...otherOverdrawnFacts(j.inputs.accounts)); // OD-08: a fact only, never the code

  // 05.4 D-63 / D-65: a usual month already short before the purchase has no ready-by date, and its headline is one of three tiers:
  // a cash fit that eats less than one month of the spare money and extra savings propping the month up (Small), one that eats a
  // month or more (Moderate, from spare money or extra savings), else "No: your month is already short" (Large). A tier's line
  // leads the answer, before the depletion lines. D-66: net_lasts stays gated by !net.locked in depletionFacts (do not loosen it).
  const alreadyShort = monthAlreadyShort(month.typicalLeft);
  const tier = alreadyShort
    ? monthShortTier({
        code,
        // D-68 (refinement a): a short plan judged by cash gets the tier a cash buy of its whole cost gets.
        monthly: cashPlan === null ? purchase.monthly : mu(0),
        typicalLeft: month.typicalLeft as MinorUnits,
        spare: unspentValue,
        monthLeft: month.monthLeft,
        aboveSize: net.aboveSize,
        used: mu(dayOne - fromEnvelope),
        fromExtra: mu(fromExtra),
      })
    : null;
  // 05.4 FIN-05 (D-07, D-39a, D-39c): expensive borrowing is 20% APR or more, or (not for a home loan) interest of 10% or more of the
  // amount borrowed. An expensive plan is compared with paying cash for the same purchase (the cash route, judged once on the same
  // reading): save_vs_borrow leads (QE-12: shown on Short each month too), except for a home loan cash cannot pay. An expensive plan
  // that fits is fits_by_borrowing: "Fits, but borrowing costs more" (borrowing_costs_more) when cash fits, "Only by borrowing" when
  // it does not (not yet, or only with the overdraft or the net). A cheap plan stays as judged (BR-03; 0% plans BR-07..BR-09, BR-11,
  // BR-14; a home loan under 20% APR, BR-15). fits_by_borrowing outranks every other fit (CODE_PRECEDENCE), so a fit's own facts
  // stay and a dearer plan, more bills or less money never look better (I59, I60, I10, I54, I55): the code does not depend on the
  // cash route. When the cash route asks for a figure first, the variant is null and the line says what to add (D-79, kind 'ask').
  // D-80: a cash route ready within 31 days of the check date counts as cash fitting ("Fits, but borrowing costs more", with the
  // ready date in the line). Under an already-short usual month the D-63 / D-65 tier keeps the headline (the variant).
  const fitsNow = code === 'fits_month' || code === 'fits_unspent' || code === 'fits_uses_net' || code === 'fits_uses_overdraft';
  let finalCode: Code = code;
  let borrowVariant: Variant | null = null;
  let compare: Fact | null = null;
  if (sched !== null && borrow !== null && isExpensive(sched, borrow.apr, borrow.housing)) {
    const asks = borrow.cash.code === 'needs_input';
    const route = saveVsBorrow(borrow.cash, sched, purchase.share);
    const fitsByCash = cashFits(route.cashCode) || cashSoon(borrow.cash, j.inputs.asOf);
    if (asks) compare = askFact(borrow.cash);
    else if (fitsByCash || !borrow.housing) compare = saveVsBorrowFact(route);
    if (fitsNow) {
      finalCode = 'fits_by_borrowing';
      borrowVariant = fitsByCash ? 'borrowing_costs_more' : null;
    }
  }
  const borrowed = finalCode === 'fits_by_borrowing';
  if (compare !== null) facts.splice(compareAt, 0, compare);
  // D-68: the caution line comes right after the tier line when there is one, otherwise first.
  const lead: Fact[] = [];
  if (tier !== null && tier.fact !== null) lead.push(tier.fact);
  if (cashPlan !== null) lead.push({ code: 'short_plan_from_cash', values: { monthly: purchase.monthly } });
  return {
    code: finalCode,
    variant: tier !== null ? tier.variant : borrowed ? borrowVariant : code === 'not_yet' ? notYetVariant : variant,
    legacyState: LEGACY_STATE_OF_CODE[finalCode],
    split: keepSplit ? split : [],
    facts: [...lead, ...facts],
    notices: mon === null ? notices : [...notices, ...mon.notices],
    missing: [],
    reasons: unique([...(said === null ? reasons : [...reasons, ...said.reasons]), ...(cashPlan === null && firstPaymentLater(purchase, month.month) ? (['first_payment_later'] as const) : [])]),
    readyBy: alreadyShort ? null : readyBy,
    band,
    layers,
    confidence: restsOn ? withReason(confidence, 'user_said_cover', (said as MonthlyPart).saidCover as { monthly: number; months: number }) : confidence,
    parts: { oneOff: one.code, monthly: mon === null ? null : mon.code },
    afterBuy,
  };
}
