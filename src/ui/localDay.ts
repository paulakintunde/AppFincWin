// 05.3-104: a stored timestamp is a UTC instant; the screens show the user's local day, never the UTC day.
import { localDateIn } from '@/engine/time';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The local YYYY-MM-DD of a stored timestamp in the given zone. A bare date is already a local day. Null for empty, garbage or a bad zone. */
export function localDayOf(timestamp: string | null | undefined, timeZone: string): string | null {
  if (timestamp === null || timestamp === undefined || timestamp === '') return null;
  if (DAY.test(timestamp)) return timestamp;
  const at = new Date(timestamp);
  if (Number.isNaN(at.getTime())) return null;
  try {
    return localDateIn(at, timeZone);
  } catch {
    return null;
  }
}
