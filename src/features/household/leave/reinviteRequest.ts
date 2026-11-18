// 08-24 (D-28): Undo on the "Sam removed" toast asks the server for a reinvite code after the remove screen has closed.
// The code is handed to the Household home, which owns the InviteSheet. A request made while Home is not mounted waits
// here until Home mounts and takes it (one at a time; the newest wins).

export interface ReinviteCode {
  code: string;
  expiresAt: string;
}

type Listener = (r: ReinviteCode) => void;

let pending: ReinviteCode | null = null;
let listener: Listener | null = null;

/** Hands a reinvite code to the Household home (now, or when it next mounts). */
export function requestReinvite(r: ReinviteCode): void {
  if (listener) listener(r);
  else pending = r;
}

/** Household home: receive codes; a waiting one is delivered at once. Returns the unsubscribe. */
export function onReinvite(l: Listener): () => void {
  listener = l;
  if (pending) {
    const r = pending;
    pending = null;
    l(r);
  }
  return () => {
    if (listener === l) listener = null;
  };
}

export function resetReinviteForTests(): void {
  pending = null;
  listener = null;
}
