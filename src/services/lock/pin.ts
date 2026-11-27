// App-lock PIN helpers (ACC-08/ACC-09).
//
// Plain statement of the limit: a 6-digit PIN has only 10^6 possible values, so the salted hash alone cannot resist
// offline guessing by someone who can read it. The real boundary is the hardware-backed store (SecureStore,
// WHEN_UNLOCKED_THIS_DEVICE_ONLY) plus the wrong-try counter (RESEARCH A10). The PIN and its hash are never logged,
// and the server never sees either.
import * as Crypto from 'expo-crypto';

export const PIN_LENGTH = 6;

/** D-02: how long the app may sit in the background before it asks again. Default 'oneMinute'. */
export const LOCK_TIMING_MS = { now: 0, oneMinute: 60_000, fiveMinutes: 300_000, fifteenMinutes: 900_000 } as const;
export type LockTiming = keyof typeof LOCK_TIMING_MS;

export type Backoff = { kind: 'none' } | { kind: 'wait'; ms: number } | { kind: 'reauth' };

const WAITS_MS: Record<number, number> = { 5: 30_000, 6: 60_000, 7: 120_000, 8: 300_000, 9: 900_000 };

/** 10-review (L-5): the longest wait the ladder can set. A stored wait further away than this means the clock moved back. */
export const MAX_WAIT_MS = Math.max(...Object.values(WAITS_MS));

/** D-03: tries 1-4 no wait; 5th 30 s, then 1, 2, 5, 15 minutes; the 10th needs a fresh sign-in. */
export function backoffFor(wrongTries: number): Backoff {
  if (wrongTries >= 10) return { kind: 'reauth' };
  const ms = WAITS_MS[wrongTries];
  return ms === undefined ? { kind: 'none' } : { kind: 'wait', ms };
}

export function isValidPin(pin: string): boolean {
  return /^[0-9]{6}$/.test(pin);
}

export async function hashPin(pin: string, saltHex: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${saltHex}:${pin}`);
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
