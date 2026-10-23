/**
 * 05-85 (D-80, R15.2/R15.3): the notes under the instalment card. Pure: CopyRefs from the inputs and the engine's plan, no
 * React and no t(). Without a rate the notes are the implied-rate / below-price / missing ones; with a rate the note reads the
 * scored payment back with the typed rate and the interest, and a quote that differs from the worked-out payment adds the
 * difference note. The quote is the one scored; the note only shows what the rate works out to.
 */
import type { Plan, PlanReason } from '@/engine/decide';
import type { CheckInputs } from '../snapshot/types';
import { percentText } from './percentText';
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

export function instalmentNotes(
  inputs: CheckInputs,
  plan: Plan | null,
  reasons: readonly PlanReason[],
  fmt: InstalmentFmt,
  resolved: ResolvedPriceLike | null,
): CopyRef[] {
  const inst = inputs.instalment;
  const hasRate = inst.hasRate === true;
  const { whole, exact } = fmt;

  if (hasRate) {
    if (plan !== null) {
      const next = inst.firstPayment === 'next_month';
      const out: CopyRef[] = [
        ref(next ? 'decide.pay.instalmentRateNoteMonth' : 'decide.pay.instalmentRateNote', {
          count: plan.months,
          payment: exact(plan.monthly),
          apr: inst.aprText ?? '',
          interest: whole(plan.interest ?? 0),
        }),
      ];
      // a typed quote that differs by at least one minor unit from the worked-out payment
      if (plan.computedPayment !== undefined && inst.amount !== null && inst.amount !== plan.computedPayment) {
        out.push(ref('decide.pay.instalmentCalcNote', { calc: exact(plan.computedPayment), typed: exact(inst.amount) }));
      }
      return out;
    }
    if (reasons.includes('instalment_total_below_price') && inst.amount !== null && inst.count !== null && resolved !== null) {
      return [belowPrice(inst.amount, inst.count, resolved, fmt)];
    }
    return [ref('decide.pay.instalmentMissing')];
  }

  if (plan !== null && inst.amount !== null && inst.count !== null) {
    // the instalments alone: amount x count, which is plan.total less any on-the-day fees
    const total = whole((plan.total ?? 0) - plan.dayFees);
    const pct = plan.impliedAnnualRate === null ? '' : percentText(plan.impliedAnnualRate);
    return [
      plan.dayFees > 0
        ? ref('decide.pay.instalmentNoteFees', { count: inst.count, payment: exact(inst.amount), total, financed: whole(plan.financed), pct })
        : ref('decide.pay.instalmentNote', { count: inst.count, payment: exact(inst.amount), total, price: whole(plan.price), pct }),
    ];
  }
  if (reasons.includes('instalment_total_below_price') && inst.amount !== null && inst.count !== null && resolved !== null) {
    return [belowPrice(inst.amount, inst.count, resolved, fmt)];
  }
  return [ref('decide.pay.instalmentMissing')];
}

function belowPrice(amount: number, count: number, resolved: ResolvedPriceLike, { whole, exact }: InstalmentFmt): CopyRef {
  return ref('decide.pay.instalmentBelowPrice', {
    count,
    payment: exact(amount),
    total: whole(amount * count),
    financed: whole(resolved.price - resolved.dayFees),
  });
}
