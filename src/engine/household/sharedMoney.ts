import { memberParts } from '../decide/share';
import type { MinorUnits } from '../money/types';

/**
 * 08.1-03 (CMP-F19, SC8): one member's slice of the money two or more partners have agreed to count together.
 * Slices come from the same largest-remainder path as every other split (`memberParts`), so they always add up to
 * `totalShared`: two people each told "Fits" up to their own slice can never spend more than the shared money.
 *
 * `weights` are the household weights in join order (at least one positive); `index` is the member asking.
 * Throws RangeError for an empty or all-zero weight list (from allocate) or an index outside the list.
 */
export function sharedMoneyFor(
  totalShared: MinorUnits,
  weights: readonly number[],
  index: number,
): MinorUnits {
  if (!Number.isInteger(index) || index < 0 || index >= weights.length) {
    throw new RangeError(`sharedMoneyFor: index ${index} out of range`);
  }
  return memberParts(totalShared, { weights, myIndex: index })[index]!;
}
