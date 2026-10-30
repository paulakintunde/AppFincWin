/**
 * 05.3-21 (DSV-09): view-model for "The whole plan". Every figure is the engine's: the summary and rows come from
 * Purchase.schedule and PlanCard, nothing is amortised here. The lender-comparable total is PlanCard.total (planTotal);
 * the screen's total row adds the running costs it lists, so the rows and the mix bar add up to what is shown.
 */
import type { Cadence, PlanCard, Purchase, QuotedCheck } from '@/engine/decide/v3';
import type { MinorUnits } from '@/engine/money';
import { minorUnits } from '@/engine/money';
import { PERCENT_SCALE, type Percent } from '@/engine/payoff';

export type CadenceWord = 'week' | 'twoWeeks' | 'month' | 'other';

export interface PlanRow {
  readonly labelKey: string;
  readonly labelParams: Readonly<Record<string, string | number>>;
  readonly amount: MinorUnits;
}

export interface PlanMixPart {
  readonly part: 'price' | 'taxFees' | 'interest' | 'running';
  readonly amount: MinorUnits;
}

export interface PlanModel {
  readonly summary: {
    readonly count: number;
    readonly payment: MinorUnits;
    readonly finalPayment: MinorUnits;
    readonly cadence: Cadence;
    readonly cadenceWord: CadenceWord;
    readonly perMonth: MinorUnits;
    readonly endsYm: string;
    readonly running: MinorUnits;
  };
  readonly rows: readonly PlanRow[];
  readonly total: { readonly months: number; readonly amount: MinorUnits };
  /** PlanCard.total, exact: price + tax + one-off costs + interest + fees (no running costs). */
  readonly planTotal: MinorUnits;
  readonly mix: readonly PlanMixPart[];
  readonly quotedDiffers: { readonly quoted: MinorUnits; readonly computed: MinorUnits } | null;
  readonly rateZero: boolean;
  readonly taxRate: string | null;
}

const KEY = 'decide.v3.ui.plan';
const OVER_KEY = 'decide.v3.fact.implied_rate_over';
/** D-11: the sentence is "over 999%" whatever the engine's solvable maximum. */
const OVER_RATE_TEXT = '999';

/** Exact decimal text of a scaled Percent ("6.9", "0"). */
function rateText(p: Percent): string {
  const whole = p / PERCENT_SCALE;
  const frac = (p % PERCENT_SCALE).toString().padStart(PERCENT_SCALE.toString().length - 1, '0').replace(/0+$/, '');
  return frac === '' ? whole.toString() : `${whole}.${frac}`;
}

function cadenceWordOf(c: Cadence): CadenceWord {
  if (c.unit === 'month' && c.every === 1) return 'month';
  if (c.unit === 'week' && c.every === 1) return 'week';
  if (c.unit === 'week' && c.every === 2) return 'twoWeeks';
  return 'other';
}

/** Whole months the plan spans (weeks converted at 12/52, the same rule the deposit comparison uses). */
function monthsOf(c: Cadence, count: number): number {
  const span = c.every * count;
  return Math.max(1, c.unit === 'month' ? span : Math.round((span * 12) / 52));
}

export function planModel(args: {
  purchase: Purchase;
  planCard: PlanCard | null;
  quoted: QuotedCheck;
  taxPercent: Percent | null;
  /** The rate the user typed, when there is one. */
  rate?: Percent | null;
  /** The down payment, for its row. It is part of the price, so it is not added to any total. */
  deposit?: MinorUnits;
}): PlanModel | null {
  const { purchase, planCard: card, quoted } = args;
  const s = purchase.schedule;
  if (card === null || s === null) return null;

  const months = monthsOf(s.cadence, s.count);
  const running = card.runningMonthly;
  const runningOver = minorUnits(running * months);
  const taxFees = minorUnits(card.tax + card.oneOffFees + card.fees);

  // The rate shown: a typed rate first, then the rate the quote implies; above the cap the D-11 sentence replaces it.
  const over = quoted.kind === 'from_quote' && quoted.impliedApr === 'above_max';
  let rate: Percent | null = args.rate ?? null;
  if (rate === null && quoted.kind === 'from_quote' && quoted.impliedApr !== null && quoted.impliedApr !== 'above_max') {
    rate = quoted.impliedApr;
  }
  const interestRow: PlanRow = over
    ? { labelKey: OVER_KEY, labelParams: { rate: OVER_RATE_TEXT }, amount: card.interest }
    : rate !== null
      ? { labelKey: `${KEY}.interest`, labelParams: { rate: rateText(rate) }, amount: card.interest }
      : { labelKey: `${KEY}.interestPlain`, labelParams: {}, amount: card.interest };
  const rateZero = !over && (rate === null ? card.interest === 0 : rate === 0n);

  const deposit = args.deposit ?? minorUnits(0);
  const rows: PlanRow[] = [{ labelKey: `${KEY}.price`, labelParams: {}, amount: card.price }];
  rows.push({ labelKey: `${KEY}.tax`, labelParams: {}, amount: minorUnits(card.tax + card.oneOffFees) });
  rows.push({ labelKey: `${KEY}.fees`, labelParams: {}, amount: card.fees });
  if (deposit > 0) rows.push({ labelKey: `${KEY}.deposit`, labelParams: {}, amount: deposit });
  rows.push(interestRow);
  if (running > 0) rows.push({ labelKey: `${KEY}.runningOver`, labelParams: { count: months }, amount: runningOver });

  const mix: PlanMixPart[] = [{ part: 'price', amount: card.price }];
  if (taxFees > 0) mix.push({ part: 'taxFees', amount: taxFees });
  if (card.interest > 0) mix.push({ part: 'interest', amount: card.interest });
  if (runningOver > 0) mix.push({ part: 'running', amount: runningOver });

  return {
    summary: {
      count: s.count,
      payment: s.payment,
      finalPayment: s.finalPayment,
      cadence: s.cadence,
      cadenceWord: cadenceWordOf(s.cadence),
      perMonth: s.monthlyEquivalent,
      endsYm: card.endDate.slice(0, 7),
      running,
    },
    rows,
    total: { months, amount: minorUnits(card.total + runningOver) },
    planTotal: card.total,
    mix,
    quotedDiffers: quoted.kind === 'differs' ? { quoted: quoted.quoted, computed: quoted.computed } : null,
    rateZero,
    taxRate: args.taxPercent === null ? null : rateText(args.taxPercent),
  };
}
