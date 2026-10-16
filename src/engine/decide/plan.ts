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
 * - D-17: a card minimum that never clears has interest and total `null`; the prototype substituted `cap * 3`.
 * - D-18: a vehicle on a card uses the card up to the dealer cap and the rest becomes day-one cash; the prototype
 *   marked the whole plan missing (`miss: rule === 'blocked' || rest > 0`).
 * - Instalment: the prototype returned `miss: true` unconditionally, treated as a bug (CONTEXT Claude's discretion).
 *   The plan is `missing` only when the amount or the count is absent.
 *
 * D-20: figures come from amortiseSchedule / simulateMinimumSchedule with a single-rate schedule, which equal
 * amortise / simulateMinimum exactly for one segment (proved in 04-14). The residual sits in the last payment.
 * Phase 5 writes recurring series from `paymentSteps`, the source of truth (05 D-09); `finalMonthly` and
 * `impliedAnnualRate` are display figures derived from the user's own numbers, never defaults (D-07).
 *
 * D-63: a card plan's `cardCosts` sums the user's own card terms, the APR interest and the one-off `cardFees` charged
 * for this purchase (a transaction or balance-transfer fee), which are paid on day one. A recurring card fee is out of
 * scope and Phase 5 must not pass one here.
 *
 * Credit terms (promo, variable, late fees: D-48, D-49, D-50) arrive in 04-22; plans here carry promo null and
 * lateFees null. This file never imports suggestItemType, suggestSecured or marketDefaults (D-05, D-14).
 */
import { assertNever } from '../guards/assertNever';
import { divideHalfUp } from '../money/rounding';
import { minorUnits, type MinorUnits } from '../money/types';
import {
  MAX_TERM_MONTHS,
  ONE_HUNDRED_PERCENT,
  SIMULATION_MONTH_CAP,
  ZERO_PERCENT,
  amortiseSchedule,
  percentFromScaled,
  simulateMinimumSchedule,
  singleRate,
  type MinimumOutcome,
  type Percent,
} from '../payoff';
import { cardEligibility } from './cardRule';
import { MONTHS_PER_YEAR } from './constants';
import { assertCurrency } from './currency';
import type {
  BuyCheck,
  BuyPayment,
  InvestCheck,
  PaymentStep,
  Plan,
  PlanReason,
  PlanResult,
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
  if (p.termMonths !== null) assertTerm(p.termMonths, 'loan term');
  // Collect every reason before returning (customCurrency pattern): an early return on the first gap would hide the second.
  const reasons: PlanReason[] = [];
  if (p.termMonths === null) reasons.push('loan_term_missing');
  if (p.apr === null) reasons.push('loan_apr_missing');
  if (p.termMonths === null || p.apr === null) return missing(reasons);

  // Prototype dplan loan branch: the deposit cannot exceed what is left after the on-the-day fees.
  const deposit = Math.max(0, Math.min(p.deposit, check.price - check.dayFees));
  const financed = Math.max(0, check.price - deposit - check.dayFees);
  const am = amortiseSchedule(m(financed), singleRate(p.apr), p.termMonths);
  const dayOne = deposit + check.dayFees;
  const total = dayOne + am.totalPaid;
  return {
    status: 'resolved',
    plan: {
      price: check.price,
      dayOne: m(dayOne),
      monthly: am.payment,
      months: p.termMonths,
      financed: m(financed),
      total: m(total),
      interest: m(Math.max(0, total - check.price)),
      dayFees: check.dayFees,
      card: null,
      finalMonthly: am.finalPayment,
      impliedAnnualRate: null,
      paymentSteps: compressSteps(am.paymentsByMonth),
      ...NO_CREDIT_TERMS,
    },
  };
}

function planInstalment(check: BuyCheck, p: Extract<BuyPayment, { method: 'instalment' }>): PlanResult {
  if (p.instalmentAmount !== null) assertMoney(p.instalmentAmount, 'instalment amount');
  if (p.instalmentCount !== null) assertTerm(p.instalmentCount, 'instalment count');
  const reasons: PlanReason[] = [];
  if (p.instalmentAmount === null) reasons.push('instalment_amount_missing');
  if (p.instalmentCount === null) reasons.push('instalment_count_missing');
  if (p.instalmentAmount === null || p.instalmentCount === null) return missing(reasons);

  const amount = p.instalmentAmount;
  const count = p.instalmentCount;
  const total = amount * count;
  // The prototype's flat figure (total/price - 1) x (12/n) x 100, from the user's own numbers (never a default, D-07).
  const impliedAnnualRate: Percent =
    check.price > 0 && total > check.price
      ? percentFromScaled(
          divideHalfUp(
            BigInt(total - check.price) * BigInt(MONTHS_PER_YEAR) * ONE_HUNDRED_PERCENT,
            BigInt(check.price) * BigInt(count)
          )
        )
      : ZERO_PERCENT;
  return {
    status: 'resolved',
    plan: {
      price: check.price,
      dayOne: m(amount),
      monthly: m(amount),
      months: count,
      financed: check.price,
      total: m(total),
      interest: m(Math.max(0, total - check.price)),
      dayFees: check.dayFees,
      card: null,
      finalMonthly: m(amount),
      impliedAnnualRate,
      // The first instalment is paid on the day (dayOne); the rest follow in months 1..count-1.
      paymentSteps: compressSteps(Array.from({ length: count - 1 }, () => m(amount))),
      ...NO_CREDIT_TERMS,
    },
  };
}

function planCard(check: BuyCheck, p: CardPayment): PlanResult {
  const { card, payoff, dealerCap } = p;
  const fees = p.cardFees ?? 0;
  assertMoney(fees, 'cardFees');
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
  let finalMonthly: MinorUnits | null = null;
  let steps: PaymentStep[] = [];

  switch (payoff.kind) {
    case 'full':
      break;
    case 'months': {
      const am = amortiseSchedule(m(onCard), singleRate(card!.apr!), payoff.months);
      monthly = am.payment;
      months = payoff.months;
      interest = am.totalInterest;
      payoffMonths = payoff.months;
      finalMonthly = am.finalPayment;
      steps = compressSteps(am.paymentsByMonth);
      break;
    }
    case 'minimum': {
      const s = simulateMinimumSchedule(m(onCard), singleRate(card!.apr!), card!.minimumTerms!);
      monthly = s.firstPayment;
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
        fees: m(fees),
        cardCosts: interest === null ? null : m(interest + fees),
      },
      finalMonthly,
      impliedAnnualRate: null,
      paymentSteps: steps,
      ...NO_CREDIT_TERMS,
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

export function withPrice(check: PurchaseCheck, price: MinorUnits): PurchaseCheck {
  return check.kind === 'buy' ? { ...check, price } : { ...check, amount: price };
}
