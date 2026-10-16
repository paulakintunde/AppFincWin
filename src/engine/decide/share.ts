import { allocate } from '../split/allocate';
import { assertNever } from '../guards/assertNever';
import { minorUnits, type MinorUnits } from '../money/types';

/**
 * Household share under the four resolved split rules (DEC-08, D-15).
 *
 * The rule is resolved OUTSIDE the engine (category default, then household
 * rule, then per-check override); the engine receives the resolved rule.
 * D-34: that rule applies to the purchase only. My share of existing
 * household spending is resolved separately (plan 04-13) with these same
 * resolveShare/myPart primitives.
 *
 * `amount` figures are per-person amounts typed for this purchase and are
 * used as proportions, so bisected or cheaper prices scale consistently.
 *
 * All arithmetic is delegated to allocate() (largest remainder); there is no
 * second split implementation. Known largest-remainder property (Alabama
 * paradox): with 3+ unequal weights, raising `total` by 1 can lower one
 * member's part by 1 minor unit. The bisection contract in plan 04-09
 * accounts for this.
 */
export type SplitRule =
  | { readonly kind: 'mine' }
  | { readonly kind: 'even' }
  | { readonly kind: 'weight'; readonly weights: readonly number[] }
  | { readonly kind: 'amount'; readonly amounts: readonly MinorUnits[] };

export type ShareScope =
  | { readonly kind: 'personal' }
  | {
      readonly kind: 'household';
      readonly memberCount: number;
      readonly myIndex: number;
      readonly rule: SplitRule;
    };

/** Non-negative integer weights with a positive sum. */
export interface ResolvedShare {
  readonly weights: readonly number[];
  readonly myIndex: number;
}

export const SOLE_SHARE: ResolvedShare = Object.freeze({
  weights: Object.freeze([1]),
  myIndex: 0,
});

export type ShareResolution =
  | { readonly ok: true; readonly share: ResolvedShare }
  | { readonly ok: false; readonly reason: 'split_weights_zero' | 'split_amounts_zero' };

function checkFigures(values: readonly number[], memberCount: number, label: string): number {
  if (values.length !== memberCount) {
    throw new RangeError(
      `resolveShare: ${label} length ${values.length} must equal memberCount ${memberCount}`,
    );
  }
  let total = 0;
  for (const v of values) {
    if (!Number.isSafeInteger(v) || v < 0) {
      throw new RangeError(`resolveShare: ${label} entry ${v} must be a non-negative integer`);
    }
    total += v;
  }
  return total;
}

function resolveRule(rule: SplitRule, memberCount: number, myIndex: number): ShareResolution {
  switch (rule.kind) {
    case 'mine':
      return { ok: true, share: SOLE_SHARE };
    case 'even':
      return { ok: true, share: { weights: Array<number>(memberCount).fill(1), myIndex } };
    case 'weight': {
      if (checkFigures(rule.weights, memberCount, 'weights') === 0) {
        return { ok: false, reason: 'split_weights_zero' };
      }
      return { ok: true, share: { weights: [...rule.weights], myIndex } };
    }
    case 'amount': {
      if (checkFigures(rule.amounts, memberCount, 'amounts') === 0) {
        return { ok: false, reason: 'split_amounts_zero' };
      }
      return { ok: true, share: { weights: [...rule.amounts], myIndex } };
    }
    default:
      return assertNever(rule, 'splitRule');
  }
}

export function resolveShare(scope: ShareScope): ShareResolution {
  switch (scope.kind) {
    case 'personal':
      return { ok: true, share: SOLE_SHARE };
    case 'household': {
      const { memberCount, myIndex, rule } = scope;
      if (!Number.isSafeInteger(memberCount) || memberCount < 1) {
        throw new RangeError(`resolveShare: memberCount ${memberCount} must be an integer >= 1`);
      }
      if (!Number.isInteger(myIndex) || myIndex < 0 || myIndex >= memberCount) {
        throw new RangeError(`resolveShare: myIndex ${myIndex} out of range for ${memberCount}`);
      }
      if (memberCount === 1) return { ok: true, share: SOLE_SHARE };
      return resolveRule(rule, memberCount, myIndex);
    }
    default:
      return assertNever(scope, 'shareScope');
  }
}

/**
 * Every member's part of `total`, aligned with `share.weights`. Zero-weight
 * members get 0 and are excluded before allocate(), which rejects zero weights.
 */
export function memberParts(total: MinorUnits, share: ResolvedShare): readonly MinorUnits[] {
  const positive: number[] = [];
  share.weights.forEach((w, i) => {
    if (w > 0) positive.push(i);
  });
  const allocated = allocate(
    total,
    positive.map((i) => share.weights[i]!),
  );
  const parts = share.weights.map(() => minorUnits(0));
  positive.forEach((memberIdx, k) => {
    parts[memberIdx] = allocated[k]!;
  });
  return parts;
}

export function myPart(total: MinorUnits, share: ResolvedShare): MinorUnits {
  if (
    !Number.isInteger(share.myIndex) ||
    share.myIndex < 0 ||
    share.myIndex >= share.weights.length
  ) {
    throw new RangeError(`myPart: myIndex ${share.myIndex} out of range`);
  }
  return memberParts(total, share)[share.myIndex]!;
}
