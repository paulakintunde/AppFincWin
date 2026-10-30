// 05.3-36: text-fit allowlist for the saved-plan and past-decisions lists. Paths are relative to src/features/decide.
import type { FitAllow } from '../../shared/fitAllowTypes';

export const FIT_ALLOW: FitAllow = {
  number: [
    { path: 'v3/lists/SavedPlanRow.tsx', kind: 'figure', count: 1, reason: 'the price stays on one line and scales to fit; the item name wraps' },
    { path: 'v3/lists/DecisionsScreen.tsx', kind: 'figure', count: 1, reason: 'the price stays on one line and scales to fit; the item name wraps' },
  ],
  geometry: [],
  overlay: [],
};
