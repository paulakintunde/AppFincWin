/**
 * WR-A09: a counter the sign-out wipe bumps, so write-queue work that belongs to the previous
 * user can recognise itself and stop.
 *
 * `getMutationCache().clear()` removes mutations from the cache but cannot stop a request that
 * is already on the wire, nor a retryer sleeping through its backoff. When those settle, their
 * success/error callbacks would write the previous user's rows into the freshly cleared cache
 * and their attempted payloads (amounts, notes) into the freshly wiped failed-writes list --
 * and a retry could even replay the write under the next user's session on a shared device.
 *
 * Each write's variables object is tagged with the epoch it was created in (in onMutate, or
 * on its first attempt for a mutation restored from disk). guardSession then throws
 * SessionWipedError instead of sending, or instead of returning a result, once the epoch has
 * moved on; that error is classified 'discarded' and every callback ignores it.
 */
let epoch = 0;
const varsEpoch = new WeakMap<object, number>();

export class SessionWipedError extends Error {
  readonly code = 'session-wiped';

  constructor() {
    super('The session this write belonged to was wiped (sign-out)');
    this.name = 'SessionWipedError';
  }
}

export function currentSessionEpoch(): number {
  return epoch;
}

/** Called by the sign-out wipe, before anything is cleared. */
export function bumpSessionEpoch(): void {
  epoch += 1;
}

/** Tags a write's variables with the current epoch, unless already tagged. */
export function markSession(vars: object): void {
  if (!varsEpoch.has(vars)) varsEpoch.set(vars, epoch);
}

/** True when this write belongs to a session that has since been wiped. */
export function isFromWipedSession(vars: object): boolean {
  const tagged = varsEpoch.get(vars);
  return tagged !== undefined && tagged !== epoch;
}

/**
 * Runs one attempt of a write for `vars`. Refuses to start if the write's session was wiped,
 * and turns a result (or error) that arrives after a wipe into SessionWipedError.
 */
export async function guardSession<T>(vars: object, attempt: () => Promise<T>): Promise<T> {
  markSession(vars);
  if (isFromWipedSession(vars)) throw new SessionWipedError();
  let result: T;
  try {
    result = await attempt();
  } catch (err) {
    if (isFromWipedSession(vars)) throw new SessionWipedError();
    throw err;
  }
  if (isFromWipedSession(vars)) throw new SessionWipedError();
  return result;
}
