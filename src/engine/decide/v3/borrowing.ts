/**
 * Borrowing costed and compared with saving (05.4 FIN-05, ENG-08, UX-13). Pure; integer minor units; engine-only imports.
 *
 * D-07 (owner question 5), as changed by D-39a and D-39c (owner round 1): "When cash would fit but a loan or plan is chosen, add a
 * caution if the APR is 20% or more, OR the total interest is 10% or more of the amount borrowed. The interest is shown next to the
 * cash route. These are FincWin's thresholds, not law." D-39a: the answer is "Fits, but borrowing costs more" with the total
 * interest. D-39c: mortgages skip the 10%-of-amount interest test (still costed and shown).
 * D-48 (owner round 2): every borrowing answer, mortgages included, shows as facts the total interest as a cost ("money that could
 * stay with you"), that a safety net covers surprises while repaying, and that more income or lower costs makes repaying easier.
 * Declarative only. D-50 (3): the D-48 lines always show, even with the fact lines switched off.
 *
 * A schedule is on the FULL lender amount (types.ts SHARE CONVENTION); the figures a person pays are their share (myPart), once.
 * The 10% test is a ratio, so it reads the full amounts on both sides.
 */
import { minorUnits, type MinorUnits } from '../../money/types';
import { PERCENT_SCALE, minorFromBigInt, type Percent } from '../../payoff/types';
import { myPart, type ResolvedShare } from '../share';
import { EXPENSIVE_APR_BP, EXPENSIVE_INTEREST_SHARE_BP } from './constants';
import type { Code, Fact, ReadyBy, Result, Schedule } from './types';

const FN = 'borrowing';

/** A plan's own costs, on the full lender amount. totalPaid = financed + interest + every plan fee. */
export interface PlanCost {
  readonly interest: MinorUnits;
  readonly fees: MinorUnits;
  readonly totalPaid: MinorUnits;
  readonly financed: MinorUnits;
}

/** The interest (pause interest included, schedule.ts) and every plan fee: setup, per payment and at the end. */
export function planCost(s: Schedule): PlanCost {
  const fees = BigInt(s.fees.setup) + BigInt(s.fees.perPeriod) * BigInt(s.lastPaying) + BigInt(s.fees.end);
  return {
    interest: s.totalInterest,
    fees: minorFromBigInt(fees, FN),
    totalPaid: minorFromBigInt(BigInt(s.financed) + BigInt(s.totalInterest) + fees, FN),
    financed: s.financed,
  };
}

/**
 * The plan's yearly rate as the engine knows it: the rate typed, else the rate a quote implies ('above_max' when it is past the
 * largest rate the engine solves for), else null (not known: only the 10% test can apply).
 */
export type PlanRate = Percent | 'above_max' | null;

/** D-07: an APR of EXPENSIVE_APR_BP basis points (20%) or more. */
export function isExpensiveRate(apr: PlanRate): boolean {
  if (apr === null) return false;
  if (apr === 'above_max') return true;
  return apr * 100n >= BigInt(EXPENSIVE_APR_BP) * PERCENT_SCALE;
}

/**
 * D-07 / D-39c: expensive borrowing is an APR of 20% or more, OR (not for a home loan) total interest of 10% or more of the amount
 * borrowed. Nothing borrowed is never expensive.
 */
export function isExpensive(s: Schedule, apr: PlanRate, housing: boolean): boolean {
  if (s.financed <= 0) return false;
  if (isExpensiveRate(apr)) return true;
  return !housing && BigInt(s.totalInterest) * 10_000n >= BigInt(s.financed) * BigInt(EXPENSIVE_INTEREST_SHARE_BP);
}

/** The cash route counts as a fit only on the clean fit codes: no overdraft, no safety-net money (D-61). */
export function cashFits(code: Code): boolean {
  return code === 'fits_month' || code === 'fits_unspent';
}

export interface SaveVsBorrow {
  readonly cashCode: Code;
  /** A Not yet cash route's ready date (the first time cash fits without the net, D-61); null otherwise. */
  readonly readyBy: ReadyBy | null;
  /** What borrowing costs on top of paying the price in cash: the interest and the plan's fees, my share. */
  readonly costsMore: MinorUnits;
  /**
   * What paying cash leaves (BR-02 $400, BR-04 $1,000, DB-09 £200), the money really left (D-75): the spare money after this month's
   * plans less the price (unspent_before_after's after), else this month's figure (month_left_after, D-22), plus the extra savings
   * still above the net's size (net_above_size less extra_savings_used); null when the cash route does not fit.
   */
  readonly cashLeft: MinorUnits | null;
}

const readyText = (r: ReadyBy): string => (r.kind === 'date' ? r.date : r.month);

/**
 * The cash route, read from the same purchase judged as paid once on the same prepared reading (prepare.ts: no second prepare).
 * Its ready date is the Not yet date (the first time cash fits without touching a locked net, D-61). A cash route that fits only by
 * dipping into the net or the overdraft says so; it is not read from that answer's wait line, which a need drops (D-41: the purpose
 * never changes a figure, I-D41).
 */
export function saveVsBorrow(cash: Result, s: Schedule, share: ResolvedShare): SaveVsBorrow {
  const c = planCost(s);
  const costsMore = myPart(minorFromBigInt(BigInt(c.interest) + BigInt(c.fees), FN), share);
  const fits = cashFits(cash.code);
  const value = (code: Fact['code'], key: string): unknown => cash.facts.find((f) => f.code === code)?.values[key];
  const spare = value('unspent_before_after', 'after') ?? value('month_left_after', 'left');
  const above = value('net_above_size', 'above');
  const used = value('extra_savings_used', 'used');
  const extra = (typeof above === 'number' ? above : 0) - (typeof used === 'number' ? used : 0);
  const left = typeof spare === 'number' ? spare + extra : null;
  const readyBy = cash.code === 'not_yet' ? cash.readyBy : null;
  return { cashCode: cash.code, readyBy, costsMore, cashLeft: fits && left !== null ? minorUnits(left) : null };
}

/**
 * save_vs_borrow: kind 'cash_fits' { left, more }; 'ready' { readyBy, more }; 'with_net' or 'with_overdraft' { more } (paying cash
 * now would dip into the safety net or the overdraft); or 'no_date' { more } (no ready date in the months ahead).
 */
export function saveVsBorrowFact(v: SaveVsBorrow): Fact {
  if (v.cashLeft !== null) return { code: 'save_vs_borrow', values: { kind: 'cash_fits', left: v.cashLeft, more: v.costsMore } };
  if (v.readyBy !== null) return { code: 'save_vs_borrow', values: { kind: 'ready', readyBy: readyText(v.readyBy), more: v.costsMore } };
  if (v.cashCode === 'fits_uses_net') return { code: 'save_vs_borrow', values: { kind: 'with_net', more: v.costsMore } };
  if (v.cashCode === 'fits_uses_overdraft') return { code: 'save_vs_borrow', values: { kind: 'with_overdraft', more: v.costsMore } };
  return { code: 'save_vs_borrow', values: { kind: 'no_date', more: v.costsMore } };
}

/**
 * D-48: the borrowing facts every loan, plan or mortgage answer carries. interest_is_a_cost { interest, total } only with interest
 * (a 0% plan gets the other two); `total` is the plan's whole cost, my share (depletion.ts planTotal). `stated` is true when the
 * depletion lines already state the interest, so it is never said twice (no twin).
 */
export function borrowingFacts(s: Schedule, share: ResolvedShare, total: MinorUnits, stated: boolean): Fact[] {
  const out: Fact[] = [];
  if (!stated && s.totalInterest > 0) out.push({ code: 'interest_is_a_cost', values: { interest: myPart(s.totalInterest, share), total } });
  out.push({ code: 'net_covers_surprises', values: {} });
  out.push({ code: 'income_or_costs_first', values: {} });
  return out;
}
