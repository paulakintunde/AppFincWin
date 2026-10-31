// Clock text whose hour and minute are computed here. Some runtimes (Hermes Intl on Android) label the
// 12 o'clock hour with the wrong day period, so only the words and the clock type are read from Intl,
// and only from times that are unambiguous (09:00 and 15:00).
export interface DayPeriodWords {
  am: string;
  pm: string;
  twelveHour: boolean;
  /** The literal between the minute and the period word (a space or a narrow no-break space). */
  sep: string;
  /** 24-hour locales: whether the hour is zero-padded. */
  padHour: boolean;
}

type Fmt = (d: Date) => Intl.DateTimeFormatPart[];

/** The locale's period words, read from 09:00 and 15:00 (never from the 12 o'clock hour), and whether it uses a 12-hour clock. */
export function dayPeriodWords(
  locale: string,
  parts: Fmt = (d) =>
    new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).formatToParts(d),
): DayPeriodWords {
  const morning = parts(new Date(Date.UTC(2026, 0, 1, 9, 0)));
  const afternoon = parts(new Date(Date.UTC(2026, 0, 1, 15, 0)));
  const period = (p: Intl.DateTimeFormatPart[]) => p.find((x) => x.type === 'dayPeriod')?.value ?? '';
  const am = period(morning);
  const pm = period(afternoon);
  const minuteAt = afternoon.findIndex((x) => x.type === 'minute');
  const literal = minuteAt >= 0 ? afternoon[minuteAt + 1] : undefined;
  const hour = afternoon.find((x) => x.type === 'hour')?.value ?? '';
  return {
    am,
    pm,
    twelveHour: am !== '' && pm !== '',
    sep: literal?.type === 'literal' ? literal.value : ' ',
    padHour: hour.length === 2,
  };
}

/** "12:39 p.m." / "12:39": hour and minute computed here; only the words and the clock type come from Intl. */
export function clockText(
  t: { hours: number; minutes: number },
  locale: string,
  words: DayPeriodWords = dayPeriodWords(locale),
): string {
  const mm = String(t.minutes).padStart(2, '0');
  if (words.twelveHour) {
    const h = t.hours % 12 || 12;
    return `${h}:${mm}${words.sep}${t.hours < 12 ? words.am : words.pm}`;
  }
  const h = words.padHour ? String(t.hours).padStart(2, '0') : String(t.hours);
  return `${h}:${mm}`;
}
