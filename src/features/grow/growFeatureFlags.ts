// 06-09: the single level-gating seam for Grow (06-CONTEXT discretion). Pure: no React or I/O import.
// Until Phase 9 gating lands every feature is on; Phase 9 swaps the default for the level-derived value.
// A screen asks growFeatureFlags() and never reads a level itself.

export interface GrowFeatureFlags {
  goals: boolean;
  debts: boolean;
  investing: boolean;
  /** Investment entries (buy / sale / dividend / fee). */
  lots: boolean;
  /** The growth illustration and "See what it could grow to". */
  growthIllustration: boolean;
  calculators: boolean;
}

const ALL_ON: GrowFeatureFlags = {
  goals: true,
  debts: true,
  investing: true,
  lots: true,
  growthIllustration: true,
  calculators: true,
};

export function growFeatureFlags(overrides: Partial<GrowFeatureFlags> = {}): GrowFeatureFlags {
  return { ...ALL_ON, ...overrides };
}

/** The Basics state: goals, debts and investing all off, so Grow shows the safety net card and the "Choose what to track" card. */
export function isGrowBasics(flags: GrowFeatureFlags): boolean {
  return !flags.goals && !flags.debts && !flags.investing;
}

export type GrowSegment = 'goals' | 'debts' | 'investing';

/** The segments to show, in order; segments for features that are off are hidden. */
export function growSegments(flags: GrowFeatureFlags): GrowSegment[] {
  const out: GrowSegment[] = [];
  if (flags.goals) out.push('goals');
  if (flags.debts) out.push('debts');
  if (flags.investing) out.push('investing');
  return out;
}
