// 10.1-04 (D-02): the one rule set for parts; plan 10.1-05 mirrors it in SQL. First failing check wins.
import type { Part, PartsInvalidReason } from './types';

export const PARTS_MIN = 2;
export const PARTS_MAX = 20;

export function validateParts(
  total: number,
  parts: readonly Part[],
  opts?: { allowGap?: boolean },
): PartsInvalidReason | null {
  if (parts.length < PARTS_MIN) return 'too_few';
  if (parts.length > PARTS_MAX) return 'too_many';
  if (parts.some((p) => !Number.isSafeInteger(p.amount))) return 'not_integer';
  if (parts.some((p) => p.amount === 0)) return 'zero_part';
  if (total === 0) return 'over_total';
  const negative = total < 0;
  if (parts.some((p) => p.amount < 0 !== negative)) return 'mixed_sign';
  const sum = parts.reduce((s, p) => s + p.amount, 0);
  if (Math.abs(sum) > Math.abs(total)) return 'over_total';
  if (opts?.allowGap !== true && sum !== total) return 'not_total';
  return null;
}
