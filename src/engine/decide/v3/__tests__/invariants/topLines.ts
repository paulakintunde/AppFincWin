/**
 * 08.1 D-06 / D-07 and 08.1-13 (owner option 1, 2026-11-20): lines that sit near the top of an answer, ahead of the
 * depletion block and the safety net's own lines. One shared list so the invariant tests cannot drift from the engine
 * again (nightly-safetynet-depletion: the two later-dip lines were missing here, I-D41 and I-D54 failed from 2026-11-23).
 */
export const TOP_LINES: ReadonlySet<string> = new Set([
  'not_within_year',
  'below_zero_without',
  'below_zero_later_without',
  'below_zero_later_with',
]);
