// 05.3-29 / 05.3-88: text-fit allowlist for the instead screen. The card head figure is one shrinking line so a long amount never breaks.
import type { FitAllow } from '../../shared/fitAllowTypes';

export const FIT_ALLOW: FitAllow = {
  number: [{ path: 'v3/instead/FutureCard.tsx', kind: 'figure', count: 1, reason: 'rule N card head figure, shrinks to its line (05.3-88)' }],
  geometry: [],
  overlay: [],
};
