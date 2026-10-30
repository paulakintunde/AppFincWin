// 05.3-28: text-fit allowlist for the whole-plan screen. Paths are relative to src/features/decide.
import type { FitAllow } from '../../shared/fitAllowTypes';

export const FIT_ALLOW: FitAllow = {
  number: [
    { path: 'v3/plan/PlanSummaryCard.tsx', kind: 'figure', count: 1, reason: 'rule N the payment figure shrinks to its line, never breaks' },
    { path: 'v3/plan/WholePlanScreen.tsx', kind: 'figure', count: 1, reason: 'rule N row and total figures shrink to their line, never break' },
  ],
  geometry: [{ path: 'v3/plan/PlanMixBar.tsx', count: 2, reason: 'mix bar (16 high) and legend dot (10), no text' }],
  overlay: [],
};
