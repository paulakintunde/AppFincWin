const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** 10-17 (T-10-17-05): '2026-08,bad,2026-13' keeps only '2026-08'; nothing valid means undefined (a full export). */
export function parseMonthsParam(raw: string | string[] | undefined): string[] | undefined {
  const text = Array.isArray(raw) ? raw.join(',') : raw;
  if (!text) return undefined;
  const months = text.split(',').map((s) => s.trim()).filter((s) => MONTH.test(s));
  return months.length > 0 ? months : undefined;
}
