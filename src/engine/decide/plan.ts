/**
 * resolvePlan: port of the prototype's `dplan` (DEC-04, DEC-05, DEC-10).
 *
 * Every payment method resolves to one comparable Plan, or to `missing` with reason codes exactly when its terms are
 * unspecified. The `missing` flag drives the `missing` verdict, so it must be exactly right (T-04-06-01).
 *
 * Corrections to the prototype, each with a named deviation test under __tests__/deviations:
 * - D-07 (refined 2026-09-26): a card with no APR on record is `missing` for the months and minimum plans; the
 *   prototype's 22.9% default is gone. The full (next statement) plan charges nothing and reads no rate, so it cannot
 *   invent one.
 * - D-16: card minimum terms come from the card record; absent terms are `card_minimum_terms_missing`.
 * - D-16 clarified: one currency per check; a card in another currency is a contract violation (RangeError).
 * - D-17: a card minimum that never clears has interest and total `null`; the prototype substituted `cap * 3`. A card
 *   minimum still open at the 600-month cap is not a cleared cost either (04-REVIEW HI-02): interest, total, cardCosts
 *   and payoffMonths are `null` and `card.remainingAtCap` carries the balance still owed.
 * - D-18: a vehicle on a card uses the card up to the dealer cap and the rest becomes day-one cash; the prototype
 *   marked the whole plan missing (`miss: rule === 'blocked' || rest > 0`).
 * - Instalment: the prototype returned `miss: true` unconditionally, treated as a bug (CONTEXT Claude's discretion).
 *   The plan is `missing` only when the amount or the count is absent.
 *
 * D-20: figures come from amortiseSchedule / simulateMinimumSchedule with a single-rate schedule, which equal
 * amortise / simulateMinimum exactly for one segment (proved in 04-14). The residual sits in the last payment, and
 * D-64 rounds the level payment up so that last payment is never more than `monthly` (04-REVIEW HI-04).
 * Phase 5 writes recurring series from `paymentSteps`, the source of truth (05 D-09); `finalMonthly` and
 * `impliedAnnualRate` are display figures derived from the user's own numbers, never defaults (D-07).
 *
 * D-63: a card plan's `cardCosts` sums the user's own card terms, the APR interest and the one-off `cardFees` charged
 * for this purchase (a transaction or balance-transfer fee), which are paid on day one. A recurring card fee is out of
 * scope and Phase 5 must not pass one here.
 *
 * D-48: promotional terms are user data. A loan or card plan with `promo` follows the rate schedule: the payment is
 * re-amortised at the promo end over the remaining months, deferred interest is added at the promo end only when the
 * user flagged it and the balance is still open (code `deferred_interest_charged`), and `Plan.monthly` is the highest
 * scheduled payment so the month test never understates a month. Allocation across several balances and forfeiture of
 * a promo after late payments are out of scope (04-14; 04-REPLAN-NOTES 2026-10-15 expansion, default 3). Without a
 * promo `monthly` stays the first payment, so plans without credit terms equal 04-06's exactly.
 *
 * D-49: `variable` is only validated; stress at higher rates is reported beside the verdict by 04-19's stressTest and
 * the verdict stays on the entered rate (04-REPLAN-NOTES default 4).
 *
 * W3: `paymentSteps` is the series source for Phase 5. For a promo plan `monthly` is the highest payment, so
 * `monthly * (months - 1) + finalMonthly` overstates the series; `finalMonthly` is a display figure.
 *
 * D-50: an instalment plan with a user-entered `lateFee` reports the cost of one and two late payments as
 * fee x n (n capped at the instalments remaining) and min(..., the user's optional total cap). The fee and the cap are
 * what the user faces (Clearpay's second fee, Klarna's per-instalment cap); there is no default cap (04-RESEARCH
 * addendum section D; 04-REPLAN-NOTES default 6). No other plan figure changes.
 *
 * D-07: nothing in credit terms is defaulted or inferred; the rate after a promo is still required.
 * This file never imports suggestItemType, suggestSecured or marketDefaults (D-05, D-14).
 */
import { assertNever } from '../guards/assertNever';
import { divideHalfUp } from '../money/rounding';
import { minorUnits, type MinorUnits } from '../money/types';
import {
  MAX_TERM_MONTHS,
  ONE_HUNDRED_PERCENT,
  SIMULATION_MONTH_CAP,
  ZERO_PERCENT,
  amortise,
  amortiseDue,
  amortiseSchedule,
  ceilDivide,
  minorFromBigInt,
  percentFromScaled,
  simulateMinimumSchedule,
  singleRate,
  type AmortisationResult,
  type MinimumOutcome,
  type Percent,
  type PeriodsPerYear,
  type RateSchedule,
  type ScheduledAmortisation,
  type ScheduledMinimumResult,
} from '../payoff';
import { cardEligibility } from './cardRule';
import { LATE_PAYMENT_COUNTS, MAX_APR_PERCENT, MONTHS_PER_YEAR } from './constants';
import { assertCurrency } from './currency';
import { monthlyEquivalent } from './series';
import type {
  BuyCheck,
  BuyPayment,
  InstalmentFreq,
  InvestCheck,
  LateFeeCost,
  PaymentStep,
  Plan,
  PlanReason,
  PlanResult,
  PromoOutcome,
  PromoTerms,
  PurchaseCheck,
} from './types';

const FN = 'resolvePlan';

type CardPayment = Extract<BuyPayment, { method: 'card' }>;

function assertMoney(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${FN}: ${label} ${value} must be a non-negative integer`);
  }
}

function assertTerm(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1 || value > MAX_TERM_MONTHS) {
    throw new RangeError(`${FN}: ${label} ${value} must be an integer between 1 and ${MAX_TERM_MONTHS}`);
  }
}

const m = (n: number): MinorUnits => minorUnits(n);

function missing(reasons: readonly PlanReason[]): PlanResult {
  return { status: 'missing', reasons };
}

/**
 * Merge equal consecutive amounts into { fromMonth, toMonth, amount } runs. Zero-amount runs are dropped: they write
 * no payment (a zero financed balance).
 */
function compressSteps(amounts: readonly MinorUnits[], fromMonth = 1): PaymentStep[] {
  const steps: PaymentStep[] = [];
  amounts.forEach((amount, i) => {
    const month = fromMonth + i;
    const last = steps[steps.length - 1];
    if (last !== undefined && last.amount === amount && last.toMonth === month - 1) {
      steps[steps.length - 1] = { ...last, toMonth: month };
    } else if (amount > 0) {
      steps.push({ fromMonth: month, toMonth: month, amount });
    }
  });
  return steps;
}

const NO_CREDIT_TERMS = { promo: null, lateFees: null } as const;

/**
 * The rate schedule for a balance: the check's own APR throughout, or the promotional APR for `promo.months` and then
 * the APR (D-48). Nothing is defaulted.
 */
export function rateScheduleFor(apr: Percent, promo: PromoTerms | undefined): RateSchedule {
  if (promo === undefined) return singleRate(apr);
  assertTerm(promo.months, 'promo months');
  if (promo.deferredInterest && promo.apr !== ZERO_PERCENT) {
    throw new RangeError(`${FN}: deferred interest needs a 0% promotional rate`);
  }
  return {
    segments: [
      { fromMonth: 1, apr: promo.apr },
      { fromMonth: promo.months + 1, apr },
    ],
    deferredInterest: promo.deferredInterest,
  };
}

/** D-49: the flag is only validated; it changes nothing in the plan. */
function assertVariable(variable: boolean | undefined): void {
  if (variable !== undefined && typeof variable !== 'boolean') {
    throw new RangeError(`${FN}: variable must be a boolean`);
  }
}

function promoOutcome(
  promo: PromoTerms,
  principal: number,
  first: MinorUnits,
  after: MinorUnits | null,
  clears: boolean,
  interestAfter: MinorUnits | null,
  charged: MinorUnits,
  highest: MinorUnits
): PromoOutcome {
  return {
    promoMonths: promo.months,
    promoApr: promo.apr,
    deferredInterest: promo.deferredInterest,
    paymentDuringPromo: first,
    paymentAfterPromo: after,
    clearsBeforePromoEnd: clears,
    interestAfterPromo: interestAfter,
    deferredInterestCharged: charged,
    deferredInterestCode: charged > 0 ? 'deferred_interest_charged' : null,
    highestMonthlyPayment: highest,
    // HI-01 (04-REVIEW) and D-64: the smallest level payment that clears the financed balance inside the promo, so
    // paying it for promo.months months leaves nothing open and no deferred interest is charged. Rounded up, never
    // half-up: a half-up figure can leave a few minor units owing at the promo end and trigger the whole deferred charge.
    paymentToClearInPromo: minorFromBigInt(ceilDivide(BigInt(principal), BigInt(promo.months)), FN),
  };
}

function promoFromAmortisation(promo: PromoTerms, principal: number, am: ScheduledAmortisation): PromoOutcome {
  const clears = am.balanceAtPromoEnd === 0;
  return promoOutcome(
    promo,
    principal,
    am.payment,
    clears ? null : am.paymentsByMonth[promo.months]!,
    clears,
    am.interestAfterPromo,
    am.deferredInterestCharged,
    am.highestPayment
  );
}

function promoFromMinimum(promo: PromoTerms, principal: number, s: ScheduledMinimumResult): PromoOutcome {
  return promoOutcome(
    promo,
    principal,
    s.firstPayment,
    s.paymentAfterPromo,
    s.clearedBeforePromoEnd,
    // HI-02: a balance still open at the cap has no finite "interest after the promo" either.
    s.outcome === 'exceeds_month_cap' ? null : s.interestAfterPromo,
    s.deferredInterestCharged,
    s.highestPayment
  );
}

function planCash(check: BuyCheck): PlanResult {
  return {
    status: 'resolved',
    plan: {
      price: check.price,
      dayOne: check.price,
      monthly: m(0),
      months: 0,
      financed: m(0),
      total: check.price,
      interest: m(0),
      dayFees: check.dayFees,
      card: null,
      finalMonthly: null,
      impliedAnnualRate: null,
      paymentSteps: [],
      ...NO_CREDIT_TERMS,
    },
  };
}

function planLoan(check: BuyCheck, p: Extract<BuyPayment, { method: 'loan' }>): PlanResult {
  assertMoney(p.deposit, 'deposit');
  assertVariable(p.variable);
  if (p.termMonths !== null) assertTerm(p.termMonths, 'loan term');
  // Collect every reason before returning (customCurrency pattern): an early return on the first gap would hide the second.
  const reasons: PlanReason[] = [];
  if (p.termMonths === null) reasons.push('loan_term_missing');
  if (p.apr === null) reasons.push('loan_apr_missing');
  if (p.termMonths === null || p.apr === null) return missing(reasons);

  // Prototype dplan loan branch: the deposit cannot exceed what is left after the on-the-day fees.
  const deposit = Math.max(0, Math.min(p.deposit, check.price - check.dayFees));
  const financed = Math.max(0, check.price - deposit - check.dayFees);
  const am = amortiseSchedule(m(financed), rateScheduleFor(p.apr, p.promo), p.termMonths);
  const promo = p.promo === undefined ? null : promoFromAmortisation(p.promo, financed, am);
  const dayOne = deposit + check.dayFees;
  const total = dayOne + am.totalPaid;
  return {
    status: 'resolved',
    plan: {
      price: check.price,
      dayOne: m(dayOne),
      // D-48: with a promo the month test uses the highest scheduled payment
      monthly: promo === null ? am.payment : am.highestPayment,
      // 04-REVIEW ME-03: the months actually paid; a rounded-up payment (D-64) can clear before the term ends
      months: am.months,
      financed: m(financed),
      total: m(total),
      interest: m(Math.max(0, total - check.price)),
      dayFees: check.dayFees,
      card: null,
      finalMonthly: am.finalPayment,
      impliedAnnualRate: null,
      paymentSteps: compressSteps(am.paymentsByMonth),
      promo,
      lateFees: null,
    },
  };
}

/** D-50: min(fee x min(n, instalments remaining), cap), reported beside the plan. Nothing is defaulted. */
function lateFeesFor(fee: MinorUnits | undefined, cap: MinorUnits | undefined, count: number): LateFeeCost | null {
  if (fee === undefined) return null;
  const cost = (n: number): MinorUnits => {
    const raw = m(fee * Math.min(n, count));
    return cap !== undefined && raw > cap ? cap : raw;
  };
  const [one, two] = LATE_PAYMENT_COUNTS as readonly [number, number];
  return { feePerLatePayment: fee, capTotal: cap ?? null, oneLate: cost(one), twoLate: cost(two) };
}

/** The payments of a worked-out schedule: the level payment, then the adjusted final one (D-64). */
function scheduleOf(am: AmortisationResult): MinorUnits[] {
  return Array.from({ length: am.months }, (_, i) => (i === am.months - 1 ? am.finalPayment : am.payment));
}

/** D-89: payments per year of each instalment frequency (the amortise periodsPerYear). */
const PERIODS_PER_YEAR: Readonly<Record<InstalmentFreq, PeriodsPerYear>> = {
  weekly: 52,
  fortnightly: 26,
  monthly: 12,
  quarterly: 4,
};

/**
 * D-89: the plan's steps as calendar-month runs. A monthly or frequency-less plan already is month-indexed and is returned
 * as it is. Otherwise each month 1..plan.months carries the monthly equivalent (M6, half-up once), capped at what is left,
 * and the last month carries the remainder, so the total equals the instalments after day one. Every month-indexed
 * consumer reads this, never `plan.paymentSteps` (see PaymentStep).
 */
export function monthlyStepsOf(plan: Plan): readonly PaymentStep[] {
  if (plan.freq === undefined || plan.freq === 'monthly') return plan.paymentSteps;
  let remaining = plan.paymentSteps.reduce((sum, s) => sum + BigInt(s.amount) * BigInt(s.toMonth - s.fromMonth + 1), 0n);
  const amounts: MinorUnits[] = [];
  for (let month = 1; month <= plan.months; month += 1) {
    const take = month === plan.months || BigInt(plan.monthly) > remaining ? remaining : BigInt(plan.monthly);
    amounts.push(minorFromBigInt(take, 'monthlyStepsOf'));
    remaining -= take;
  }
  return compressSteps(amounts);
}

function planInstalment(check: BuyCheck, p: Extract<BuyPayment, { method: 'instalment' }>): PlanResult {
  if (p.lateFee !== undefined) assertMoney(p.lateFee, 'lateFee');
  if (p.lateFeeCapTotal !== undefined) {
    if (p.lateFee === undefined) throw new RangeError(`${FN}: lateFeeCapTotal needs lateFee`);
    assertMoney(p.lateFeeCapTotal, 'lateFeeCapTotal');
  }
  if (p.instalmentAmount !== null) assertMoney(p.instalmentAmount, 'instalment amount');
  if (p.instalmentCount !== null) assertTerm(p.instalmentCount, 'instalment count');
  if (p.apr != null && p.apr > MAX_APR_PERCENT) throw new RangeError(`${FN}: instalment apr is above the maximum`);
  // D-80: apr absent = no rate on this plan; apr null = a rate is expected and not given; a Percent = work the payment out.
  const rateExpected = p.apr !== undefined;
  const reasons: PlanReason[] = [];
  if (!rateExpected && p.instalmentAmount === null) reasons.push('instalment_amount_missing');
  if (p.instalmentCount === null) reasons.push('instalment_count_missing');
  if (p.apr === null) reasons.push('instalment_rate_missing');
  if (reasons.length > 0) return missing(reasons);

  const count = p.instalmentCount!;
  const freq: InstalmentFreq = p.freq ?? 'monthly';
  const ppy = PERIODS_PER_YEAR[freq];
  // D-89: 'next_month' is the deprecated alias of 'next_period'; either way the first payment is not on the day.
  const today = (p.firstPayment ?? 'today') === 'today';
  // 04-REVIEW ME-02: the on-the-day fees inside the price are paid on the day, as on the loan path; the instalments
  // cover the rest (financed = price - dayFees, floored at 0). Before this the fees left cash nowhere: dayOne was the
  // first instalment alone and total was amount x count, so the cash check was understated by the fees.
  const financed = Math.max(0, check.price - check.dayFees);
  // D-80: with a rate the payment is worked out on the financed amount. 'today' is an annuity-due (first payment on the
  // day), 'next_month' an ordinary annuity. A typed amount is always the one scored; computedPayment is the worked-out one.
  const computed =
    p.apr === undefined || p.apr === null ? null : (today ? amortiseDue : amortise)(m(financed), p.apr, count, ppy);
  const amounts: MinorUnits[] =
    p.instalmentAmount !== null ? Array.from({ length: count }, () => m(p.instalmentAmount!)) : scheduleOf(computed!);
  // 04-REVIEW LO-05 (and D-80, with or without a rate): payments that add up to less than the financed amount are
  // inconsistent terms, so the plan is `missing` with a code rather than a verdict on a plan whose total sits below the
  // price. Re-priced checks (withPrice, HI-03) never trip it: a typed amount is scaled up with the price.
  const paid = amounts.reduce((sum, a) => sum + BigInt(a), 0n);
  if (paid < BigInt(financed)) return missing(['instalment_total_below_price']);
  const total = minorFromBigInt(paid + BigInt(check.dayFees), FN);
  // The prototype's flat figure (total/price - 1) x (12/n) x 100 on what the instalments finance, from the user's own
  // numbers (never a default, D-07). Without on-the-day fees this is the prototype's figure exactly. With a rate the
  // plan carries the rate itself, so there is nothing to imply.
  const impliedAnnualRate: Percent | null = rateExpected
    ? null
    : financed > 0
      ? percentFromScaled(
          divideHalfUp(
            (paid - BigInt(financed)) * BigInt(ppy) * ONE_HUNDRED_PERCENT,
            BigInt(financed) * BigInt(count)
          )
        )
      : ZERO_PERCENT;
  const first = today && amounts.length > 0 ? amounts[0]! : m(0);
  // D-89 (M6): the level payment's monthly equivalent, rounded half-up once; a monthly plan is unchanged.
  const level = p.instalmentAmount !== null ? m(p.instalmentAmount) : computed!.payment;
  return {
    status: 'resolved',
    plan: {
      price: check.price,
      dayOne: m(first + check.dayFees),
      monthly: monthlyEquivalent(level, freq),
      // D-89: the months the plan spans, ceil(payments x 12 / periodsPerYear); a monthly plan's payments are its months
      months: freq === 'monthly' ? amounts.length : Math.ceil((amounts.length * MONTHS_PER_YEAR) / ppy),
      financed: m(financed),
      total,
      interest: rateExpected ? minorFromBigInt(paid - BigInt(financed), FN) : m(Math.max(0, total - check.price)),
      dayFees: check.dayFees,
      card: null,
      finalMonthly: p.instalmentAmount !== null ? m(p.instalmentAmount) : computed!.finalPayment,
      impliedAnnualRate,
      // 'today': the first instalment is paid on the day (dayOne), the rest follow in months 1..count-1.
      // 'next_month': nothing but the fees on the day, payments in months 1..count.
      paymentSteps: compressSteps(today ? amounts.slice(1) : amounts),
      promo: null,
      lateFees: lateFeesFor(p.lateFee, p.lateFeeCapTotal, count),
      ...(computed === null ? {} : { computedPayment: computed.payment }),
      // D-89: carried when the check names a frequency, so a plan with none stays exactly as it was
      ...(p.freq === undefined ? {} : { freq: p.freq }),
    },
  };
}

function planCard(check: BuyCheck, p: CardPayment): PlanResult {
  const { card, payoff, dealerCap } = p;
  const fees = p.cardFees ?? 0;
  assertMoney(fees, 'cardFees');
  assertVariable(p.variable);
  if (dealerCap !== null) assertMoney(dealerCap, 'dealerCap');
  if (payoff.kind === 'months') assertTerm(payoff.months, 'card payoff months');
  if (card !== null) assertCurrency(check.currency, card.currency, `card ${card.id}`, FN);

  const eligibility = cardEligibility(check.itemType);
  // D-18: a blocked item is simply not accepted; no further reasons.
  if (eligibility === 'blocked') return missing(['card_not_accepted']);

  const reasons: PlanReason[] = [];
  if (card === null) reasons.push('card_missing');
  if (eligibility === 'capped' && dealerCap === null) reasons.push('dealer_cap_missing');
  // D-07 as refined 2026-09-26: never invent a rate. APR is required only for months and minimum; the full
  // (next statement) branch reads no rate, so it cannot invent one.
  if (card !== null && payoff.kind !== 'full' && card.apr === null) reasons.push('card_apr_missing');
  // D-16: the minimum-payment formula is the card record's own.
  if (card !== null && payoff.kind === 'minimum' && card.minimumTerms === null) {
    reasons.push('card_minimum_terms_missing');
  }
  if (reasons.length > 0) return missing(reasons);

  // D-18: the part above the dealer cap is day-one cash, not `missing`. dealerCap is non-null here when capped.
  const onCard = eligibility === 'capped' ? Math.min(check.price, dealerCap!) : check.price;
  const remainder = check.price - onCard;

  let monthly = 0;
  let months = 0;
  let interest: number | null = 0;
  let payoffMonths: number | null = 1;
  let minimumOutcome: MinimumOutcome | null = null;
  let remainingAtCap: MinorUnits | null = null;
  let finalMonthly: MinorUnits | null = null;
  let steps: PaymentStep[] = [];
  let promo: PromoOutcome | null = null;

  switch (payoff.kind) {
    case 'full':
      break;
    case 'months': {
      const am = amortiseSchedule(m(onCard), rateScheduleFor(card!.apr!, p.promo), payoff.months);
      promo = p.promo === undefined ? null : promoFromAmortisation(p.promo, onCard, am);
      monthly = promo === null ? am.payment : am.highestPayment;
      // 04-REVIEW ME-03: the months actually paid, which can be fewer than the term entered (D-64 rounds up)
      months = am.months;
      interest = am.totalInterest;
      payoffMonths = am.months;
      finalMonthly = am.finalPayment;
      steps = compressSteps(am.paymentsByMonth);
      break;
    }
    case 'minimum': {
      const s = simulateMinimumSchedule(m(onCard), rateScheduleFor(card!.apr!, p.promo), card!.minimumTerms!);
      promo = p.promo === undefined ? null : promoFromMinimum(p.promo, onCard, s);
      monthly = promo === null ? s.firstPayment : s.highestPayment;
      months = s.months;
      minimumOutcome = s.outcome;
      steps = compressSteps(s.paymentsByMonth);
      if (s.outcome === 'never_clears') {
        // D-17: unbounded. The prototype substituted cap * 3; the balance never falls, so the last payment repeats to
        // the simulation cap.
        interest = null;
        payoffMonths = null;
        const last = steps[steps.length - 1]!;
        steps[steps.length - 1] = { ...last, toMonth: SIMULATION_MONTH_CAP };
      } else if (s.outcome === 'exceeds_month_cap') {
        // HI-02 (04-REVIEW), D-17: the balance is still open after SIMULATION_MONTH_CAP months. Its cost is not a cleared
        // total: interest, total, cardCosts and payoffMonths are null, as for never_clears, and the open balance is
        // reported as remainingAtCap. The prototype-style finite total understated the cost by the whole open balance.
        interest = null;
        payoffMonths = null;
        remainingAtCap = s.remainingBalance;
      } else {
        interest = s.totalInterest;
        payoffMonths = s.months;
      }
      break;
    }
    default:
      return assertNever(payoff, 'card payoff');
  }

  // D-63: card fees are one-off, paid on the day, and are not interest. A full payoff is paid at the next statement,
  // which the prototype counted as day-one cash (day = cap + rest).
  const dayOne = remainder + fees + (payoff.kind === 'full' ? onCard : 0);
  return {
    status: 'resolved',
    plan: {
      price: check.price,
      dayOne: m(dayOne),
      monthly: m(monthly),
      months,
      financed: m(onCard),
      total: interest === null ? null : m(check.price + interest + fees),
      interest: interest === null ? null : m(interest),
      dayFees: check.dayFees,
      card: {
        eligibility,
        onCard: m(onCard),
        remainderOnDay: m(remainder),
        payoff: payoff.kind,
        payoffMonths,
        minimumOutcome,
        remainingAtCap,
        fees: m(fees),
        cardCosts: interest === null ? null : m(interest + fees),
      },
      finalMonthly,
      impliedAnnualRate: null,
      paymentSteps: steps,
      promo,
      lateFees: null,
    },
  };
}

function resolveBuy(check: BuyCheck): PlanResult {
  assertMoney(check.price, 'price');
  assertMoney(check.dayFees, 'dayFees');
  const { payment } = check;
  switch (payment.method) {
    case 'cash':
      return planCash(check);
    case 'loan':
      return planLoan(check, payment);
    case 'instalment':
      return planInstalment(check, payment);
    case 'card':
      return planCard(check, payment);
    default:
      return assertNever(payment, 'payment method');
  }
}

function resolveInvest(check: InvestCheck): PlanResult {
  assertMoney(check.amount, 'amount');
  const { payment } = check;
  const base = {
    price: check.amount,
    financed: m(0),
    interest: m(0),
    dayFees: m(0),
    card: null,
    impliedAnnualRate: null,
    ...NO_CREDIT_TERMS,
  };
  switch (payment.method) {
    case 'lump':
      return {
        status: 'resolved',
        plan: {
          ...base,
          dayOne: check.amount,
          monthly: m(0),
          months: 0,
          total: check.amount,
          finalMonthly: null,
          paymentSteps: [],
        },
      };
    case 'monthly': {
      if (payment.termMonths === null) return missing(['invest_term_missing']);
      assertTerm(payment.termMonths, 'invest term');
      return {
        status: 'resolved',
        plan: {
          ...base,
          dayOne: m(0),
          monthly: check.amount,
          months: payment.termMonths,
          total: m(check.amount * payment.termMonths),
          finalMonthly: check.amount,
          paymentSteps: [{ fromMonth: 1, toMonth: payment.termMonths, amount: check.amount }],
        },
      };
    }
    default:
      return assertNever(payment, 'invest payment method');
  }
}

export function resolvePlan(check: PurchaseCheck): PlanResult {
  switch (check.kind) {
    case 'invest':
      return resolveInvest(check);
    case 'buy':
      return resolveBuy(check);
    default:
      return assertNever(check, 'check kind');
  }
}

/** For callers that re-price a check whose terms already resolved. */
export function resolvePlanStrict(check: PurchaseCheck): Plan {
  const result = resolvePlan(check);
  if (result.status === 'missing') {
    throw new Error(`resolvePlanStrict: plan is missing (${result.reasons.join(', ')})`);
  }
  return result.plan;
}

/**
 * The same check at another price (bisection, the alternatives' cheaper row).
 *
 * 04-REVIEW HI-03: an instalment plan's amount scales with the price, keeping the count, rounded UP to the minor unit
 * (ceil(amount x price / original price)), so 12 x 150.00 on 1,800.00 becomes 12 x 100.00 on 1,200.00 and the scaled
 * instalments still cover the scaled price. Before this the instalments stayed fixed, so no affordable price existed for
 * a failing instalment check and the cheaper row falsely reported that the month still did not close. A check priced at
 * 0 has nothing to scale against and keeps its amount. Loan deposits are not scaled here (bisection keeps the user's
 * deposit; alternatives scales it itself).
 */
export function withPrice(check: PurchaseCheck, price: MinorUnits): PurchaseCheck {
  if (check.kind === 'invest') return { ...check, amount: price };
  const { payment } = check;
  if (payment.method !== 'instalment' || payment.instalmentAmount === null || check.price === 0) {
    return { ...check, price };
  }
  const scaled = ceilDivide(BigInt(payment.instalmentAmount) * BigInt(price), BigInt(check.price));
  return { ...check, price, payment: { ...payment, instalmentAmount: minorFromBigInt(scaled, 'withPrice') } };
}
