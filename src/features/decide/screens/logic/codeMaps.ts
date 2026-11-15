/**
 * Code → catalogue key map for the one caller left (the past-decision detail screen). The other maps of 05-09 had no
 * production caller once the old engine's codes went (05.5-18: grep proved it) and were deleted. `as const satisfies
 * Record<Code, string>` keeps it exhaustive. Values are `decide.*` keys only.
 */
import type { MethodKey } from '../../snapshot/types';

export const METHOD_LABEL = {
  cash: 'decide.method.cash',
  loan: 'decide.method.loan',
  instalment: 'decide.method.instalment',
  card: 'decide.method.card',
  lump: 'decide.method.lump',
  monthly: 'decide.method.monthly',
} as const satisfies Record<MethodKey, string>;
