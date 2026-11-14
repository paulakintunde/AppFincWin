/**
 * 06.1-72 (G-73-2): a short hold for device reads that render paths repeat many times a second. Reading the locale and calendar
 * is a native call, and turning an instant into today's local date builds two Intl.DateTimeFormat objects; Decide home under the
 * answer did both in every hook of every render (about 21 s of a 77 s busy window on the emulator dev build, 06.1-73). A held
 * value is read again after `ttl` ms, so a time-zone or region change in the system settings shows within a second.
 *
 * No imports, so a test setup can set the hold without loading expo-localization.
 */
export const DEVICE_READ_TTL_MS = 1_000;

let ttl = DEVICE_READ_TTL_MS;

/** Test seam: 0 turns the hold off (every call reads again), so a test that changes a mocked device value sees it at once. */
export function setDeviceReadTtl(ms: number): void {
  ttl = ms;
}

export function deviceReadTtl(): number {
  return ttl;
}

/**
 * Wraps `read` so its value is reused for `deviceReadTtl()` ms per `key`. A different key, a clock that went back, or an expired
 * hold reads again. With the hold off, every call reads.
 */
export function heldRead<K, T>(read: (key: K) => T): (key: K) => T {
  let held: { key: K; at: number; value: T } | null = null;
  return (key: K): T => {
    const now = Date.now();
    const hold = ttl;
    if (held !== null && hold > 0 && Object.is(held.key, key) && now >= held.at && now - held.at < hold) return held.value;
    const value = read(key);
    held = { key, at: now, value };
    return value;
  };
}
