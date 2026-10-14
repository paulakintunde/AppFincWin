// H7: a fast double tap on a push target (avatar, Accounts card, Import, Activity links) must not
// stack two screens. One guard for every tap-driven push: a push to the same href within PUSH_GUARD_MS
// of the last accepted one is dropped. Module state holds only a timestamp (no user data, nothing to wipe).
import { router, type Href } from 'expo-router';

export const PUSH_GUARD_MS = 600;

let lastAt: number | null = null;
let lastKey: string | null = null;

export function acceptPush(last: number | null, now: number): boolean {
  return last === null || now - last >= PUSH_GUARD_MS;
}

export function pushOnce(href: Href): void {
  const now = Date.now();
  // WR-03: the guard is per target, so a push to a different route is never silently dropped.
  const key = typeof href === 'string' ? href : JSON.stringify(href);
  if (key === lastKey && !acceptPush(lastAt, now)) return;
  lastAt = now;
  lastKey = key;
  router.push(href);
}

export function resetPushOnceForTests(): void {
  lastAt = null;
  lastKey = null;
}
