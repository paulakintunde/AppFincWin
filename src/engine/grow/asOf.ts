/** D-12, GRW-10: a typed value older than 30 days is stale on day 31, not day 30. */
export const VALUE_STALE_DAYS = 30;

/** Days since 1970-01-01 for a civil date (proleptic Gregorian), integer arithmetic only. */
function civilDay(date: string): number {
  const y0 = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  const y = m <= 2 ? y0 - 1 : y0;
  const era = (y - (((y % 400) + 400) % 400)) / 400;
  const yoe = y - era * 400;
  const doy = ((153 * (m > 2 ? m - 3 : m + 9) + 2) - ((153 * (m > 2 ? m - 3 : m + 9) + 2) % 5)) / 5 + d - 1;
  const doe = yoe * 365 + (yoe - (yoe % 4)) / 4 - (yoe - (yoe % 100)) / 100 + doy;
  return era * 146097 + doe - 719468;
}

export function isValueStale(asOf: string, today: string): boolean {
  return civilDay(today) - civilDay(asOf) > VALUE_STALE_DAYS;
}
