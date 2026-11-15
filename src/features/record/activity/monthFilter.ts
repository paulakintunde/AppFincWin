// 06.1-71 (H-10, FQ10, CN-9): Decide's "Records for <month>" links open Activity on that month with a banner saying what Decide is
// missing there, through the route parameters `?month=YYYY-MM&why=<code>`. Same pattern as debtFilter.ts: a parameter is used only
// when it validates, else it is ignored (T-06.1-71-01). Pure and React-free.

/** Why Decide sent the user to a month: a readiness item kind, a month not complete, or no entry in the last days. */
export const DECIDE_WHY_CODES = ['bill', 'pay', 'spending', 'late_start', 'month', 'recent'] as const;
export type DecideWhy = (typeof DECIDE_WHY_CODES)[number];

export interface DecideMonthBanner {
  month: string;
  why: DecideWhy;
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function first(raw: string | readonly string[] | undefined | null): unknown {
  return Array.isArray(raw) ? raw[0] : raw;
}

/** The route parameter as a month: YYYY-MM with a real month, else null. */
export function monthParamOf(raw: string | readonly string[] | undefined | null): string | null {
  const v = first(raw);
  return typeof v === 'string' && MONTH_RE.test(v) ? v : null;
}

/** The route parameter as a known reason code, else null (an unknown code shows no banner). */
export function whyParamOf(raw: string | readonly string[] | undefined | null): DecideWhy | null {
  const v = first(raw);
  return typeof v === 'string' && (DECIDE_WHY_CODES as readonly string[]).includes(v) ? (v as DecideWhy) : null;
}

/** The banner for a valid month and reason; null when either is missing or invalid. */
export function decideBannerOf(
  month: string | readonly string[] | undefined | null,
  why: string | readonly string[] | undefined | null
): DecideMonthBanner | null {
  const m = monthParamOf(month);
  const w = whyParamOf(why);
  return m === null || w === null ? null : { month: m, why: w };
}
