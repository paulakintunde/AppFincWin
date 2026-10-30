// 05.3-26: text-fit allowlist for the answer parts. Paths are relative to src/features/decide.
import type { FitAllow } from '../../shared/fitAllowTypes';

export const FIT_ALLOW: FitAllow = {
  number: [],
  geometry: [{ path: 'v3/answerParts/FundingStrip.tsx', count: 3, reason: 'strip bar and segment heights (16) and legend dot (10): drawing, no text' }],
  overlay: [],
};
