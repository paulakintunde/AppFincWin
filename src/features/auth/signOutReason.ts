// 10-12 (ACC-07): why this phone last signed out, so the signed-out screen can say
// "You were signed out of this device." after a remote revoke. A tiny module store, not React state.
export type SignOutReason = 'local' | 'remote' | 'deleted';

let reason: SignOutReason | null = null;
let localInProgress = false;

export function setSignOutReason(r: SignOutReason): void {
  reason = r;
}

export function lastSignOutReason(): SignOutReason | null {
  return reason;
}

/** Reads the reason once and clears it. */
export function consumeSignOutReason(): SignOutReason | null {
  const r = reason;
  reason = null;
  return r;
}

/** True while performSignOut runs, so AuthProvider can tell its own SIGNED_OUT from a remote one. */
export function isLocalSignOutInProgress(): boolean {
  return localInProgress;
}

export function setLocalSignOutInProgress(v: boolean): void {
  localInProgress = v;
}
