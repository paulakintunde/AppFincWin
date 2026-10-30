// 05.3-38: text-fit allowlist for the answer's lower half. Paths are relative to src/features/decide.
import type { FitAllow } from '../../shared/fitAllowTypes';

export const FIT_ALLOW: FitAllow = {
  number: [{ path: 'v3/answerLower/FactRows.tsx', kind: 'figure', count: 1, reason: 'rule N fact figure, shrinks to its line' }],
  geometry: [{ path: 'v3/answerLower/AnswerLinks.tsx', count: 1, reason: 'row chevron glyph (no text)' }],
  overlay: [],
};
