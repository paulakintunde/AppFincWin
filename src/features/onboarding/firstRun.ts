// 09-23 (D-28, D-29, D-30, UI-SPEC 3): where a signed-in person lands. Pure, no React or I/O.
// Order: a waiting invite first (join, then the partner questions), then the setup row. A person whose setup exists on the
// server (any device, or backfilled as an existing user) goes Home. A setup read error goes Home too: never trap a person
// behind a failed read (T-09-78).

export type OnboardingRouteMode = 'first_run' | 'partner';

export type FirstRunTarget = 'checking' | 'join' | { onboarding: OnboardingRouteMode } | 'home';

export interface SetupSnapshot {
  completedAt: string | null;
  partnerVersion: boolean;
  /** A level set without finishing (an abandoned partner run lands on Everyday, D-30) also counts as done. */
  level?: number | null;
}

export interface FirstRunInput {
  pendingInvite: string | null;
  setup: SetupSnapshot | null;
  setupLoading: boolean;
  setupError: boolean;
  /** People in the person's household (plan_state members). */
  members: number;
  /** The person owns their household. */
  isOwner: boolean;
}

/** True once the person has a level on the server: finished setup, backfilled existing user, or an abandoned partner run. */
export function setupDone(setup: SetupSnapshot | null | undefined): boolean {
  if (setup === null || setup === undefined) return false;
  return setup.completedAt !== null || (setup.level !== null && setup.level !== undefined);
}

export function firstRunTarget(input: FirstRunInput): FirstRunTarget {
  if (input.pendingInvite !== null) return 'join';
  if (input.setupLoading) return 'checking';
  if (input.setupError) return 'home';
  if (setupDone(input.setup)) return 'home';
  const joinedOthers = input.members >= 2 && !input.isOwner;
  if (input.setup?.partnerVersion === true || joinedOthers) return { onboarding: 'partner' };
  return { onboarding: 'first_run' };
}

/** The onboarding mode a target asks for, or null when it is not an onboarding target. */
export function onboardingModeOf(target: FirstRunTarget): OnboardingRouteMode | null {
  return typeof target === 'object' ? target.onboarding : null;
}
