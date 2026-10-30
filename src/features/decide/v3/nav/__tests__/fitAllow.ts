// 05.3-14: text-fit allowlist for the nav kit. Paths are relative to src/features/decide.
import type { FitAllow } from '../../shared/fitAllowTypes';

export const FIT_ALLOW: FitAllow = {
  number: [],
  geometry: [{ path: 'v3/nav/V3Skeleton.tsx', count: 2, reason: 'loading skeleton bar heights (no text)' }],
  overlay: [],
};
