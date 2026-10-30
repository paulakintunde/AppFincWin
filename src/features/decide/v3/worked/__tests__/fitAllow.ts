// 05.3-30: text-fit allowlist for How this was worked out. Paths are relative to src/features/decide.
import type { FitAllow } from '../../shared/fitAllowTypes';

export const FIT_ALLOW: FitAllow = {
  number: [
    { path: 'v3/worked/WorkedScreen.tsx', kind: 'figure', count: 1, reason: 'the result figure scales to fit on one line' },
    { path: 'v3/worked/SixMonthBars.tsx', kind: 'figure', count: 1, reason: 'the bar amount scales to fit its column on one line' },
  ],
  geometry: [
    { path: 'v3/worked/SixMonthBars.tsx', count: 3, reason: 'bar area (120) and the two bar heights; no text inside' },
  ],
  overlay: [],
};
