// 10.1-09: plain-data helpers for Activity, caps and the Decide builder (no db types).
import { expandParts } from './expandParts';
import { scaleParts } from './scaleParts';
import type { CategoryAmount, LinePartsInput } from './types';

/** Category rows in the home currency; null when the home amount is unknown. */
export function homeCategoryAmounts(line: LinePartsInput, amountHome: number | null): CategoryAmount[] | null {
  if (amountHome === null) return null;
  return scaleParts(line, amountHome);
}

/** True when the line's category, or any part's category (the gap is null), is in the list. */
export function partsMatch(line: LinePartsInput, categoryIds: readonly (string | null)[]): boolean {
  return expandParts(line).some((r) => categoryIds.includes(r.categoryId));
}

/** Sum of the matching home-scaled rows; null when the home amount is unknown. */
export function amountInCategories(line: LinePartsInput, amountHome: number | null, categoryIds: readonly (string | null)[]): number | null {
  const rows = homeCategoryAmounts(line, amountHome);
  if (rows === null) return null;
  return rows.filter((r) => categoryIds.includes(r.categoryId)).reduce((s, r) => s + r.amount, 0);
}
