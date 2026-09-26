// FND-09 / D-25: the single, pure, tested function that decides which route the root layout
// shows. Kept free of any React/Expo Router import so it stays trivially testable and so the
// version gate is provably enforced ahead of every other routing concern.

export type Route = 'splash' | 'update-required' | 'welcome' | 'app';

export type GateStatus = 'checking' | 'ok' | 'blocked';
export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

export interface RouteInput {
  gate: GateStatus;
  auth: AuthStatus;
}

/**
 * Ordering is deliberate: a blocked version gate wins over everything else, including an
 * already-signed-in session (T-00-17-01's mitigation only works if this check can never be
 * bypassed by auth state). Only once the gate is resolved does auth status decide the route.
 */
export function resolveRoute({ gate, auth }: RouteInput): Route {
  if (gate === 'blocked') return 'update-required';
  if (gate === 'checking' || auth === 'loading') return 'splash';
  return auth === 'signedOut' ? 'welcome' : 'app';
}
