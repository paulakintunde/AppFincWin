// 05.3-25 and 05.3-41: text-fit allowlist for the answer hero, confidence chip and sheet, notice tiles and the Answer header.
// Paths are relative to src/features/decide.
import type { FitAllow } from '../../shared/fitAllowTypes';

export const FIT_ALLOW: FitAllow = {
  number: [
    {
      path: 'v3/answer/AnswerHeader.tsx',
      kind: 'user-name',
      count: 1,
      reason: 'Rule T: the "{Item} · {price}" title is a user-typed name in a one-line header; the full name and price are in the button label',
    },
  ],
  geometry: [
    { path: 'v3/answer/AnswerHeader.tsx', count: 2, reason: 'The round back control and its chevron are icon-only boxes of fixed size (as BackButton); no text sits in them' },
  ],
  overlay: [],
};
