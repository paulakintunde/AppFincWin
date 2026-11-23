// Time-zone logic for alert delivery (10-23, ALR-03/04, D-11). Pure: Intl only, no date library, no I/O.
export type LocalParts = { date: string; minutes: number };

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

function parts(now: Date, tz: string): { y: number; mo: number; d: number; h: number; mi: number } {
  const o: Record<string, number> = {};
  for (const p of fmt(tz).formatToParts(now)) if (p.type !== 'literal') o[p.type] = Number(p.value);
  return { y: o.year, mo: o.month, d: o.day, h: o.hour % 24, mi: o.minute };
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export function localParts(now: Date, tz: string): LocalParts {
  const p = parts(now, tz);
  return { date: `${pad(p.y, 4)}-${pad(p.mo)}-${pad(p.d)}`, minutes: p.h * 60 + p.mi };
}

/** 'HH:MM' or 'HH:MM:SS' (a Postgres time as JSON) to minutes after midnight. */
export function hmToMinutes(hm: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(hm);
  if (!m) throw new Error('bad time');
  return Number(m[1]) * 60 + Number(m[2]);
}

export function inQuietHours(now: Date, tz: string, enabled: boolean, start: string, end: string): boolean {
  if (!enabled) return false;
  const s = hmToMinutes(start);
  const e = hmToMinutes(end);
  if (s === e) return false;
  const { minutes } = localParts(now, tz);
  return s < e ? minutes >= s && minutes < e : minutes >= s || minutes < e;
}

// Offset of the zone from UTC at an instant, in ms.
function offsetMs(t: number, tz: string): number {
  const p = parts(new Date(t), tz);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - Math.floor(t / 60000) * 60000;
}

/** The UTC instant of a local wall-clock time. Two passes settle across a DST change. */
function wallToInstant(y: number, mo: number, d: number, minutes: number, tz: string): number {
  const wall = Date.UTC(y, mo - 1, d, 0, minutes);
  let t = wall - offsetMs(wall, tz);
  t = wall - offsetMs(t, tz);
  return t;
}

/** The next instant, strictly after now, at which the local clock reads `end`. */
export function quietEndsAt(now: Date, tz: string, end: string): Date {
  const e = hmToMinutes(end);
  const p = parts(now, tz);
  const nowMin = p.h * 60 + p.mi;
  // Calendar arithmetic on the local date; Date.UTC normalises day overflow.
  const dayShift = nowMin < e ? 0 : 1;
  const day = new Date(Date.UTC(p.y, p.mo - 1, p.d + dayShift));
  return new Date(wallToInstant(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), e, tz));
}

/** The 8:00 digest window: local time in [08:00, 08:15) and today's digest not yet sent. */
export function isDigestWindow(now: Date, tz: string, lastDigestDate: string | null): boolean {
  const { date, minutes } = localParts(now, tz);
  if (minutes < 8 * 60 || minutes >= 8 * 60 + 15) return false;
  return lastDigestDate === null || lastDigestDate < date;
}
