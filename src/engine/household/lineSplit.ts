import { memberParts, type SplitRule } from '../decide/share';
import { minorUnits, type MinorUnits } from '../money/types';

/** One person on a shared line, in household join order (HH-05). */
export interface LineParticipant {
  readonly key: string;
  readonly included: boolean;
  readonly weight: number;
}

export type LineSplitResult =
  | { readonly ok: true; readonly parts: readonly MinorUnits[] }
  | {
      readonly ok: false;
      readonly reason: 'split_weights_zero' | 'amounts_not_total' | 'no_other_member';
      readonly leftToAssign?: MinorUnits;
    };

/**
 * Splits one shared line across household members. Reuses SplitRule and
 * memberParts from engine/decide/share.ts (ARC-17): there is one rule type and
 * one largest-remainder path, ties by join order.
 */
export function splitLine(
  total: MinorUnits,
  rule: SplitRule,
  participants: readonly LineParticipant[],
  payerIndex: number,
): LineSplitResult {
  if (rule.kind === 'mine') {
    const weights = participants.map((_, i) => (i === payerIndex ? 1 : 0));
    return done(total, weights, payerIndex);
  }

  if (rule.kind === 'amount') {
    const amounts = participants.map((x, i) => (x.included ? rule.amounts[i]! : 0));
    const sum = amounts.reduce((s, v) => s + v, 0);
    const abs = Math.abs(total);
    if (sum !== abs) {
      return { ok: false, reason: 'amounts_not_total', leftToAssign: minorUnits(abs - sum) };
    }
    return done(total, amounts, payerIndex);
  }

  const others = participants.filter((x, i) => x.included && i !== payerIndex).length;
  if (others < 1) return { ok: false, reason: 'no_other_member' };

  const weights = participants.map((x) =>
    x.included ? (rule.kind === 'even' ? 1 : x.weight) : 0,
  );
  if (weights.every((w) => w === 0)) return { ok: false, reason: 'split_weights_zero' };
  return done(total, weights, payerIndex);
}

function done(total: MinorUnits, weights: readonly number[], payerIndex: number): LineSplitResult {
  if (total === 0) return { ok: true, parts: weights.map(() => minorUnits(0)) };
  return { ok: true, parts: memberParts(total, { weights, myIndex: payerIndex }) };
}
