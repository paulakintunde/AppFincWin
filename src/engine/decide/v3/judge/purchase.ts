/**
 * CheckV2 -> Purchase (05.1 plan 21). v3 §4.3 whole value, §4.5 day one P and monthly M.
 * I32: the band comes from the whole value alone (price + tax + one-off fees, my share), never from the pay option.
 * I36: no invented amounts. Running costs and one-off extras come only from amounts the user typed (CheckV2.extras,
 *      keyed by library question id or OwnQuestion.id); a missing plan fact is a MissingCode, never a default.
 * I41: the scored payment is the larger of the worked-out and the quoted payment (scoredPayment).
 * D-04 first payment, D-09 foreign price at today's rate, D-18 household share, D-19 own questions, D-24 pause interest.
 *
 * SHARE CONVENTION (types.ts): the schedule is on the FULL lender amount; myPart is applied once to dayOne and once to
 * M = myPart(schedule.monthlyEquivalent + full running costs). The plan card is also on the full amount.
 * Debt payments already in the user's month are not counted here (the cash path takes them out, I19); this module only
 * adds the new purchase's own money.
 */
import { divideHalfUp } from '../../../money/rounding';
import type { MinorUnits } from '../../../money/types';
import { minorFromBigInt, rateDenominator, ZERO_PERCENT, type PeriodsPerYear } from '../../../payoff/types';
import { myPart, resolveShare, type ResolvedShare } from '../../share';
import { purchaseFlows } from '../cash/path';
import type { DatedFlow } from '../cash/path';
import { percentText } from '../adapters/inputsV2';
import { addDays } from '../dates';
import { amortBase, countFromTerm, monthlyEquivalentOf, scaledApr } from '../plan/cadence';
import { planCard, salesTaxOf, type PlanCard } from '../plan/planCard';
import { checkQuoted, scoredPayment, type QuotedCheck } from '../plan/quoted';
import { buildSchedule, paymentsInRange } from '../plan/schedule';
import type {
  Band,
  CheckV2,
  CustomOptions,
  Fact,
  HomeThresholds,
  Layer,
  LocalDate,
  MissingCode,
  Purchase,
  ReasonCode,
  Schedule,
} from '../types';
import { bandOf, layersFor } from './bands';
import { isNeedPurpose, resolveItemType } from './options';
import { questionSpec } from './presetQuestions';

const FN = 'buildPurchase';

/** A quote whose implied rate is beyond the largest rate the engine solves for reads as this plain figure. */
const ABOVE_MAX_RATE_TEXT = '9999';

export interface PurchaseBuild {
  readonly purchase: Purchase | null;
  readonly planCard: PlanCard | null;
  readonly quoted: QuotedCheck;
  readonly missing: readonly MissingCode[];
  readonly reasons: readonly ReasonCode[];
  readonly facts: readonly Fact[];
  /** Band and layers from the price alone, present while the plan fields are incomplete (same functions as the built Purchase). */
  readonly preview: { readonly band: Band; readonly layers: readonly Layer[] } | null;
}

const NONE: QuotedCheck = { kind: 'none' };

function nothing(missing: readonly MissingCode[], reasons: readonly ReasonCode[] = [], facts: readonly Fact[] = [],
  preview: PurchaseBuild['preview'] = null
): PurchaseBuild {
  return { purchase: null, planCard: null, quoted: NONE, missing, reasons, facts, preview };
}

const mb = (v: bigint): MinorUnits => minorFromBigInt(v, FN);

interface ExtraSpec {
  readonly id: string;
  readonly cadence: 'monthly' | 'yearly' | 'one_off' | 'none';
  readonly cash: boolean;
  readonly role: 'cost' | 'credit' | 'modelled_elsewhere';
}

/** How the level payments run, so a larger payment can be walked to its own last paying period (L-09). */
interface PayoffWalk {
  /** Rate per period, already scaled for the cadence (scaledApr). */
  readonly rate: bigint;
  readonly base: PeriodsPerYear;
  /** true: the first payment falls on the day, before any interest (annuity-due). */
  readonly due: boolean;
}

/**
 * Pays `financed + pauseInterest` off with a level `payment`, the last payment taking whatever is left, the same walk
 * amortise uses. Returns the paying periods, the last payment and the total paid (before per-period and end fees).
 */
function walkPayoff(s: Schedule, payment: bigint, w: PayoffWalk): { last: number; final: bigint; paid: bigint } {
  const D = rateDenominator(w.base);
  let bal = BigInt(s.financed) + BigInt(s.pauseInterest);
  let paid = 0n;
  let final = 0n;
  let last = 0;
  for (let k = 0; k < s.count && bal > 0n; k += 1) {
    const owed = bal + (w.due && k === 0 ? 0n : divideHalfUp(bal * w.rate, D));
    const p = k === s.count - 1 || payment >= owed ? owed : payment;
    bal = owed - p;
    paid += p;
    final = p;
    last = k + 1;
  }
  return { last, final, paid };
}

/**
 * The scored schedule: when the quote is the larger figure it replaces the level payment (I41). With a `walk` the
 * larger payment clears the loan sooner, so the paying periods, the last payment and the total are worked out again for
 * it (L-09); without one (a quote with no rate, whose implied rate already fits the count) the periods are kept.
 */
function withPayment(s: Schedule, payment: bigint, source: Schedule['source'], walk: PayoffWalk | null): Schedule {
  const pay = mb(payment);
  let lastPaying = s.lastPaying;
  let finalPayment = pay;
  let principalPaid = payment * BigInt(s.lastPaying);
  if (walk !== null) {
    const w = walkPayoff(s, payment, walk);
    lastPaying = w.last;
    finalPayment = mb(w.final);
    principalPaid = w.paid;
  }
  const feeTotal = BigInt(s.fees.perPeriod) * BigInt(lastPaying) + BigInt(s.fees.end);
  const totalPaid = principalPaid + feeTotal;
  const interest = totalPaid - feeTotal - BigInt(s.financed);
  return {
    ...s,
    payment: pay,
    finalPayment,
    lastPaying,
    totalPaid: mb(totalPaid),
    totalInterest: mb(interest < 0n ? 0n : interest),
    monthlyEquivalent: monthlyEquivalentOf(mb(payment + BigInt(s.fees.perPeriod)), s.cadence),
    source,
  };
}

export function buildPurchase(
  check: CheckV2,
  ctx: { readonly asOf: LocalDate; readonly thresholds: HomeThresholds; readonly custom: CustomOptions }
): PurchaseBuild {
  if (check.legacyKind === 'invest') return nothing(['legacy_invest_check']);

  let share: ResolvedShare;
  try {
    const r = resolveShare(check.share);
    if (!r.ok) return nothing(['share_invalid']);
    share = r.share;
  } catch (e) {
    if (e instanceof RangeError) return nothing(['share_invalid']);
    throw e;
  }

  try {
    return buildResolved(check, ctx, share);
  } catch (e) {
    // minorFromBigInt (and the schedule's own range guards) throw RangeError past safe integers: a reason, never a throw.
    if (e instanceof RangeError) return nothing([], ['exceeds_range']);
    throw e;
  }
}

function buildResolved(
  check: CheckV2,
  ctx: { readonly asOf: LocalDate; readonly thresholds: HomeThresholds; readonly custom: CustomOptions },
  share: ResolvedShare
): PurchaseBuild {
  const { pay } = check;
  const missing: MissingCode[] = [];
  const reasons: ReasonCode[] = [];
  const facts: Fact[] = [];

  if (check.price === null) missing.push('no_price');
  let count: number | null = null;
  if (pay.mode === 'plan') {
    count = pay.count ?? (pay.termMonths === null ? null : countFromTerm(pay.cadence, pay.termMonths));
    if (count === null || count === 0) missing.push('plan_count_missing');
    if (pay.apr === null && pay.quotedPayment === null) missing.push('plan_rate_missing');
    if (pay.firstPayment === null) missing.push('first_payment_not_chosen');
    else if (pay.firstPayment.kind === 'deferred' && pay.firstPayment.interestDuringPause === null) {
      missing.push('pause_interest_not_answered');
    }
  }
  if (check.price === null) return nothing(missing);
  const price = check.price;
  const passed = pay.mode === 'plan' && pay.firstPayment?.kind === 'deferred' && pay.firstPayment.firstDate < ctx.asOf;

  // Whole value, full (before my share): price + tax + one-off fees.
  let fullWhole: bigint;
  let whole: MinorUnits;
  let tax: MinorUnits;
  let resolved: ReturnType<typeof resolveItemType>;
  const specs: ExtraSpec[] = [];
  let bandResult: ReturnType<typeof bandOf>;
  let band: Band;
  let layers: readonly Layer[];
  try {
    tax = salesTaxOf(price, check.taxPercent);
    fullWhole = BigInt(price) + BigInt(tax) + BigInt(check.oneOffFees);
    whole = myPart(mb(fullWhole), share);
    // Typed amounts only (I36, D-19). Library questions and own questions are treated alike.
    resolved = resolveItemType(check.itemType, ctx.custom);
    for (const id of resolved.questionIds) {
      const s = questionSpec(id);
      if (s !== null) specs.push({ id, cadence: s.cadence, cash: s.cash, role: s.role });
    }
    for (const o of resolved.ownQuestions) specs.push({ id: o.id, cadence: o.cadence, cash: o.cash, role: 'cost' });
    bandResult = bandOf(whole, ctx.thresholds);
    band = bandResult.band;
    layers = layersFor(band, { periodic: pay.mode === 'plan', hasExtras: specs.length > 0 });
  } catch (e) {
    // An incomplete check keeps its missing list even when the price is out of range; a complete one reports exceeds_range.
    if (e instanceof RangeError && (missing.length > 0 || passed)) return nothing(missing.length > 0 ? missing : ['first_payment_passed']);
    throw e;
  }
  const preview = { band, layers };
  if (missing.length > 0) return nothing(missing, [], [], preview);
  // L-01: a deferred first payment dated before today asks for a new date; it is not an out-of-range schedule.
  if (passed) return nothing(['first_payment_passed'], [], [], preview);

  reasons.push(...resolved.reasons);
  let runningFull = 0n;
  let oneOffExtras = 0n;
  let credits = 0n;
  const planTradeIn = pay.mode === 'plan' && pay.tradeIn > 0;
  for (const s of specs) {
    const amount = check.extras[s.id];
    if (amount === undefined || !Number.isSafeInteger(amount) || amount <= 0) continue;
    if (!s.cash || s.cadence === 'none' || s.role === 'modelled_elsewhere') continue;
    // M-08: a typed trade-in lowers day one, and is ignored when the plan already carries pay.tradeIn (one route per fact).
    if (s.role === 'credit') {
      if (!planTradeIn) credits += BigInt(amount);
      continue;
    }
    if (s.cadence === 'monthly') runningFull += BigInt(amount);
    else if (s.cadence === 'yearly') runningFull += divideHalfUp(BigInt(amount), 12n);
    else oneOffExtras += BigInt(amount);
  }

  reasons.push(...bandResult.reasons);

  if (check.foreign !== null) facts.push({ code: 'at_todays_rate', values: { currency: check.foreign.currency } });

  let schedule: Schedule | null = null;
  let card: PlanCard | null = null;
  let quoted: QuotedCheck = NONE;
  let dayOne: bigint;
  let monthly: bigint;

  if (pay.mode === 'once') {
    const onceTotal = fullWhole + oneOffExtras - credits;
    dayOne = BigInt(myPart(mb(onceTotal < 0n ? 0n : onceTotal), share));
    monthly = BigInt(myPart(mb(runningFull), share));
  } else {
    const financedBig = fullWhole - BigInt(pay.deposit) - BigInt(pay.tradeIn);
    const financed = mb(financedBig < 0n ? 0n : financedBig);
    const quoteOnly = pay.apr === null;
    const aprUsed = pay.apr ?? ZERO_PERCENT;
    const out = buildSchedule({
      asOf: ctx.asOf,
      financed,
      apr: aprUsed,
      cadence: pay.cadence,
      count,
      firstPayment: pay.firstPayment,
      fees: pay.fees,
    });
    if (!out.ok) return nothing([out.missing]);
    let sched = out.schedule;
    const timing = pay.firstPayment?.kind === 'today' ? 'due' : 'ordinary';
    quoted = checkQuoted({
      computed: quoteOnly ? null : sched.payment,
      quoted: pay.quotedPayment,
      tolerance: ctx.thresholds.quotedTolerance,
      financed,
      count: sched.count,
      cadence: pay.cadence,
      timing,
    });
    if (quoted.kind === 'from_quote') {
      reasons.push('quote_used_no_rate');
      // A quote whose payments cannot cover the financed amount has no rate: terms are inconsistent, not scoreable.
      if (quoted.impliedApr === null) return nothing(['plan_rate_missing'], reasons, facts);
      facts.push({ code: 'implied_rate', values: { rate: quoted.impliedApr === 'above_max' ? ABOVE_MAX_RATE_TEXT : percentText(quoted.impliedApr) } });
      sched = withPayment(sched, BigInt(quoted.quoted), 'from_quote', null);
    } else if (quoted.kind === 'matches' || quoted.kind === 'differs') {
      const scored = scoredPayment(sched.payment, quoted.quoted);
      if (scored !== null && scored > sched.payment) {
        const walk: PayoffWalk = { rate: scaledApr(aprUsed, pay.cadence), base: amortBase(pay.cadence), due: pay.firstPayment?.kind !== 'one_period' };
        sched = withPayment(sched, BigInt(scored), 'quoted', walk);
      }
      if (quoted.kind === 'differs') {
        facts.push({
          code: 'quoted_differs',
          values: { quoted: quoted.quoted, computed: quoted.computed },
        });
      }
    }
    if (pay.deferredInterestTerm) facts.push({ code: 'deferred_interest_term', values: {} });
    schedule = sched;

    // A first payment dated today is part of day one (P); purchaseCashFlows removes it from the dated schedule flows.
    const firstNow = paymentsInRange(sched, ctx.asOf, addDays(ctx.asOf, 1)).reduce((a, p) => a + BigInt(p.amount), 0n);
    const upfrontRaw = BigInt(pay.deposit) + BigInt(pay.fees.setup) + firstNow + oneOffExtras - credits;
    dayOne = BigInt(myPart(mb(upfrontRaw < 0n ? 0n : upfrontRaw), share));
    monthly = BigInt(myPart(mb(BigInt(sched.monthlyEquivalent) + runningFull), share));
    card = planCard({ price, tax, oneOffFees: check.oneOffFees, schedule: sched, runningMonthly: mb(runningFull) });
  }

  const base = resolved.base;
  const purchase: Purchase = {
    whole,
    dayOne: mb(dayOne),
    monthly: mb(monthly),
    runningMonthly: myPart(mb(runningFull), share),
    schedule,
    share,
    itemType: base,
    purpose: check.purpose,
    emergency: check.emergency,
    canUseEmergency: isNeedPurpose(check.purpose), // D-41: reads as a need; wording only
    band,
    layers,
    financed: pay.mode === 'plan',
    secured: base === 'vehicle' || base === 'property',
    categoryId: check.categoryId,
    envelopeId: check.envelopeId,
    volatileCover: check.volatileCover ?? null, // D-48: the user's answer rides with the plan
  };
  return { purchase, planCard: card, quoted, missing: [], reasons, facts, preview: { band, layers } };
}

/**
 * Dated flows of the purchase for the cash path. Purchase.dayOne already contains a first payment dated today
 * (P, v3 §4.5), and purchaseFlows also emits every schedule payment from asOf on, so that payment would land twice.
 * This takes it out of the day-one flow once; the total on asOf is exactly dayOne plus nothing extra.
 */
export function purchaseCashFlows(
  purchase: Pick<Purchase, 'dayOne' | 'schedule' | 'share'>,
  asOf: LocalDate,
  days: number
): DatedFlow[] {
  const s = purchase.schedule;
  // L-03: the first payment due today is taken out of the day-one flow and put back by purchaseFlows, both as the same
  // myPart, so the two cancel and the total on asOf is exactly dayOne. There is no clamp: a clamp would hide a negative
  // remainder and make the cash path disagree with the ladder (buildPurchase already floors dayOne itself at 0).
  let dayOne = BigInt(purchase.dayOne);
  if (s !== null) {
    for (const p of paymentsInRange(s, asOf, addDays(asOf, 1))) dayOne -= BigInt(myPart(p.amount, purchase.share));
  }
  return purchaseFlows({ dayOne: mb(dayOne), schedule: s, share: purchase.share }, asOf, days);
}
