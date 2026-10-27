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
import { minorFromBigInt, ZERO_PERCENT } from '../../../payoff/types';
import { myPart, resolveShare, type ResolvedShare } from '../../share';
import { purchaseFlows } from '../cash/path';
import type { DatedFlow } from '../cash/path';
import { percentText } from '../adapters/inputsV2';
import { addDays } from '../dates';
import { countFromTerm, monthlyEquivalentOf } from '../plan/cadence';
import { planCard, salesTaxOf, type PlanCard } from '../plan/planCard';
import { checkQuoted, scoredPayment, type QuotedCheck } from '../plan/quoted';
import { buildSchedule, paymentsInRange } from '../plan/schedule';
import type {
  Band,
  CheckV2,
  CustomOptions,
  Fact,
  HomeThresholds,
  LocalDate,
  MissingCode,
  Purchase,
  ReasonCode,
  Schedule,
} from '../types';
import { bandOf, layersFor } from './bands';
import { canUseEmergency, resolveItemType } from './options';
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
}

const NONE: QuotedCheck = { kind: 'none' };

function nothing(missing: readonly MissingCode[], reasons: readonly ReasonCode[] = [], facts: readonly Fact[] = []): PurchaseBuild {
  return { purchase: null, planCard: null, quoted: NONE, missing, reasons, facts };
}

const mb = (v: bigint): MinorUnits => minorFromBigInt(v, FN);

interface ExtraSpec {
  readonly id: string;
  readonly cadence: 'monthly' | 'yearly' | 'one_off' | 'none';
  readonly cash: boolean;
  readonly role: 'cost' | 'credit' | 'modelled_elsewhere';
}

/** The scored schedule: when the quote is the larger figure it replaces the level payment (I41). */
function withPayment(s: Schedule, payment: bigint, source: Schedule['source']): Schedule {
  const feeTotal = BigInt(s.fees.perPeriod) * BigInt(s.lastPaying) + BigInt(s.fees.end);
  const totalPaid = payment * BigInt(s.lastPaying) + feeTotal;
  const interest = totalPaid - feeTotal - BigInt(s.financed);
  const pay = mb(payment);
  return {
    ...s,
    payment: pay,
    finalPayment: pay,
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
  if (missing.length > 0 || check.price === null) return nothing(missing);
  // L-01: a deferred first payment dated before today asks for a new date; it is not an out-of-range schedule.
  if (pay.mode === 'plan' && pay.firstPayment?.kind === 'deferred' && pay.firstPayment.firstDate < ctx.asOf) {
    return nothing(['first_payment_passed']);
  }

  // Whole value, full (before my share): price + tax + one-off fees.
  const tax = salesTaxOf(check.price, check.taxPercent);
  const fullWhole = BigInt(check.price) + BigInt(tax) + BigInt(check.oneOffFees);
  const whole = myPart(mb(fullWhole), share);

  // Typed amounts only (I36, D-19). Library questions and own questions are treated alike.
  const resolved = resolveItemType(check.itemType, ctx.custom);
  reasons.push(...resolved.reasons);
  const specs: ExtraSpec[] = [];
  for (const id of resolved.questionIds) {
    const s = questionSpec(id);
    if (s !== null) specs.push({ id, cadence: s.cadence, cash: s.cash, role: s.role });
  }
  for (const o of resolved.ownQuestions) specs.push({ id: o.id, cadence: o.cadence, cash: o.cash, role: 'cost' });
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

  const bandResult = bandOf(whole, ctx.thresholds);
  reasons.push(...bandResult.reasons);
  const band: Band = bandResult.band;
  const layers = layersFor(band, { periodic: pay.mode === 'plan', hasExtras: specs.length > 0 });

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
    const out = buildSchedule({
      asOf: ctx.asOf,
      financed,
      apr: pay.apr ?? ZERO_PERCENT,
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
      sched = withPayment(sched, BigInt(quoted.quoted), 'from_quote');
    } else if (quoted.kind === 'matches' || quoted.kind === 'differs') {
      const scored = scoredPayment(sched.payment, quoted.quoted);
      if (scored !== null && scored > sched.payment) sched = withPayment(sched, BigInt(scored), 'quoted');
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
    card = planCard({ price: check.price, tax, oneOffFees: check.oneOffFees, schedule: sched, runningMonthly: mb(runningFull) });
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
    canUseEmergency: canUseEmergency(check.purpose),
    band,
    layers,
    financed: pay.mode === 'plan',
    secured: base === 'vehicle' || base === 'property',
    categoryId: check.categoryId,
    envelopeId: check.envelopeId,
  };
  return { purchase, planCard: card, quoted, missing: [], reasons, facts };
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
  let dayOne = BigInt(purchase.dayOne);
  if (s !== null) {
    for (const p of paymentsInRange(s, asOf, addDays(asOf, 1))) dayOne -= BigInt(myPart(p.amount, purchase.share));
  }
  if (dayOne < 0n) dayOne = 0n;
  return purchaseFlows({ dayOne: mb(dayOne), schedule: s, share: purchase.share }, asOf, days);
}
