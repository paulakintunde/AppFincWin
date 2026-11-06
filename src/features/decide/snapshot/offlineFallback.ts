// PURE. 05.4 APP-01 / ENG-14 / APP-06 (05.4-33): Decide's reads when the new month has nothing cached yet, and the honest
// "records up to" date. No React, no I/O: the read hook (src/data/queries/decide.ts) passes the cached rows and the server
// fetch times in.
import { localDateIn } from '@/engine/time';

/** This month's history window and the first day after it (where the upcoming read starts). */
export interface DecideRanges {
  readonly from: string;
  readonly to: string;
  readonly upcomingFrom: string;
}

/**
 * APP-01: last month's cached reads, moved into this month's windows. History keeps every row from `from` to `to`
 * (last month's history plus last month's upcoming rows that are now in the window); upcoming keeps last month's upcoming
 * rows from `upcomingFrom` on. Rows are passed through as they are, never copied or edited, and stay in date order (the
 * upcoming rows are all dated after last month's history).
 */
export function rollForward<R extends { readonly local_date: string }>(
  prevHistory: readonly R[],
  prevUpcoming: readonly R[],
  range: DecideRanges
): { readonly history: R[]; readonly upcoming: R[] } {
  const history = [...prevHistory, ...prevUpcoming].filter((r) => r.local_date >= range.from && r.local_date <= range.to);
  const upcoming = prevUpcoming.filter((r) => r.local_date >= range.upcomingFrom);
  return { history, upcoming };
}

/**
 * APP-06, D-126: "Records up to" is the local day of the OLDEST real server fetch among the record reads used. Null when
 * there are none, when any of them has no known server fetch, or when the time zone is not valid: unknown is never "today".
 */
export function recordsAsOfOf(times: readonly (number | null)[], timeZone: string): string | null {
  if (times.length === 0) return null;
  let oldest = Infinity;
  for (const t of times) {
    if (t === null || !Number.isFinite(t)) return null;
    if (t < oldest) oldest = t;
  }
  try {
    return localDateIn(new Date(oldest), timeZone);
  } catch {
    return null;
  }
}
