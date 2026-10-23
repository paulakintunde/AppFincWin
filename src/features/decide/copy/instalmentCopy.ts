/**
 * 05-85 (D-80, R15.2/R15.3), reworded by 05-102 (D-89, D-90, R16.16 M6): the notes under the instalment card. Pure:
 * CopyRefs from the inputs and the engine's plan, no React and no t(). One table: the row is the frequency, the column is
 * whether a rate was quoted, and `{when}` follows the first payment's timing.
 *
 * Without a rate the note is the lead for the frequency plus one rate clause: the true APR the settled path solved
 * (rounded up to one decimal), "0%" when the total equals the amount financed, "above 999.99%" past the cap, nothing for
 * one payment on the day, and the D-49 below-the-price note instead of both when the total falls short. The solved rate is
 * worked out from the figures typed; it is never written into the rate field and never reaches the verdict (04 D-07).
 * With a rate the note reads the scored payment back with the typed rate and the interest, and a quote that differs from the
 * worked-out payment adds the difference note.
 */
import type { InstalmentFreq, Plan, PlanReason } from '@/engine/decide';
import { impliedAprDisplay } from '@/engine/payoff';
import type { ImpliedAprResult } from '@/engine/payoff';
import type { CheckInputs } from '../snapshot/types';
import { ref } from './types';
import type { CopyRef, Fmt } from './types';

export interface InstalmentFmt {
  whole: Fmt;
  exact: Fmt;
}

/** The price and on-the-day fees the check resolved to, for the "below the price" note when no plan resolved. */
export interface ResolvedPriceLike {
  price: number;
  dayFees: number;
}

const P = 'decide.pay.';

export function instalmentNotes(
  inputs: CheckInputs,
  plan: Plan | null,
  reasons: readonly PlanReason[],
  fmt: InstalmentFmt,
  resolved: ResolvedPriceLike | null,
  /** CheckComputation.impliedApr: only the settled path has it, so the clause waits for it. */
  implied: ImpliedAprResult = null,
): CopyRef[] {
  const inst = inputs.instalment;
  const hasRate = inst.hasRate === true;
  const freq: InstalmentFreq = inst.freq ?? 'monthly';
  const today = (inst.firstPayment ?? 'today') === 'today';
  const { whole, exact } = fmt;

  if (hasRate) {
    if (plan !== null) {
      // the typed quote is the payment scored; without one it is the worked-out payment
      const payment = inst.amount ?? plan.computedPayment ?? plan.monthly;
      const out: CopyRef[] = [
        ref(
          `${P}instRate.${freq}`,
          { count: inst.count!, payment: exact(payment), apr: inst.aprText ?? '', monthly: exact(plan.monthly), interest: whole(plan.interest ?? 0) },
          { when: `${P}when.${today ? 'today' : freq}` },
        ),
      ];
      // a typed quote that differs by at least one minor unit from the worked-out payment
      if (plan.computedPayment !== undefined && inst.amount !== null && inst.amount !== plan.computedPayment) {
        out.push(ref(`${P}instalmentCalcNote`, { calc: exact(plan.computedPayment), typed: exact(inst.amount) }));
      }
      return out;
    }
    return unresolved(inst.amount, inst.count, reasons, fmt, resolved);
  }

  if (plan !== null) {
    const count = inst.count!;
    const lead = ref(`${P}instNoRate.${freq}`, { count, payment: exact(inst.amount!), monthly: exact(plan.monthly) });
    if (count === 1 && today) return [lead]; // one payment on the day: no rate clause
    if (implied === null) return [lead];
    if ('aboveMax' in implied) return [lead, ref(`${P}instRateAbove`)];
    if (implied.apr === 0n) return [lead, ref(`${P}instRateZero`)];
    return [lead, ref(`${P}instRateAbout`, { apr: impliedAprDisplay(implied.apr) })];
  }
  return unresolved(inst.amount, inst.count, reasons, fmt, resolved);
}

/** No plan: the D-49 below-the-price note when the typed total falls short, otherwise what is missing. */
function unresolved(
  amount: number | null,
  count: number | null,
  reasons: readonly PlanReason[],
  fmt: InstalmentFmt,
  resolved: ResolvedPriceLike | null,
): CopyRef[] {
  if (reasons.includes('instalment_total_below_price') && amount !== null && count !== null && resolved !== null) {
    return [belowPrice(amount, count, resolved, fmt)];
  }
  return [ref(`${P}instalmentMissing`)];
}

function belowPrice(amount: number, count: number, resolved: ResolvedPriceLike, { whole, exact }: InstalmentFmt): CopyRef {
  return ref(`${P}instalmentBelowPrice`, {
    count,
    payment: exact(amount),
    total: whole(amount * count),
    financed: whole(resolved.price - resolved.dayFees),
  });
}
