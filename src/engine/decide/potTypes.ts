// Leaf (05.1, D-16): v3 imports this file; it must never import the old engine.
// Pot types (D-101, R18.2) and the set-aside bound, moved verbatim from types.ts and constants.ts.
import type { MinorUnits } from '../money/types';

export type PotKind = 'wait' | 'pot';
export interface PotInput {
  readonly id: string;
  readonly kind: PotKind;
  readonly target: MinorUnits | null;
  readonly monthlyAmount: MinorUnits | null;
  readonly readyBy: string | null; // 'YYYY-MM-DD'
  readonly saved: MinorUnits; // opening saved + tagged paid lines
}
export type PotState = 'active' | 'reached' | 'past_due';
export interface PotLine {
  readonly id: string;
  readonly monthly: MinorUnits;
  readonly months: number | null;
  readonly state: PotState;
}

// Cite: D-101 / R18.2 FincWin's own bound on the set-aside sum: up to 500 pots (the 50 a user creates plus the Wait goals of open checks). With each pot's set-aside at most 10^13 minor units the sum is at most 5 x 10^15, inside the safe-integer range (2^53 is about 9 x 10^15), so it converts with a plain Number().
export const MAX_SET_ASIDE_POTS = 500;
