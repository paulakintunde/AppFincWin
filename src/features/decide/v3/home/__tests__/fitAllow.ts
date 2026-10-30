// 05.3-23 / 05.3-39: text-fit allowlist for the Decide home. Paths are relative to src/features/decide.
import type { FitAllow } from '../../shared/fitAllowTypes';

export const FIT_ALLOW: FitAllow = {
  number: [
    { path: 'v3/home/MonthBarCard.tsx', kind: 'figure', count: 1, reason: 'the month figure scales to fit on one line (05.3-60: the figure rows never clamp or shrink)' },
    { path: 'v3/home/EnvelopeGrid.tsx', kind: 'figure', count: 1, reason: 'the envelope amount scales to fit on one line' },
  ],
  geometry: [
    { path: 'v3/home/MonthBarCard.tsx', count: 2, reason: 'bar track (16 high) and legend dot (10 x 10); no text inside' },
    { path: 'v3/home/HomeScreen.tsx', count: 5, reason: 'three skeleton bars, the header menu dot (4 x 4) and the row chevron (8 x 8); no text inside' },
    { path: 'v3/home/SomethingChangedRow.tsx', count: 1, reason: 'the row chevron (8 x 8); no text inside' },
  ],
  overlay: [],
};
