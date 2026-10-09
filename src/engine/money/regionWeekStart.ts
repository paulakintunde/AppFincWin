/**
 * ISO 3166-1 alpha-2 region -> first day of the week (ACT-16, CONTEXT D-23): 0 = Sunday,
 * 1 = Monday. Region-preference precedence: user override, then device region (caller
 * resolves via resolveRegion); never from IP. The caller falls back to Monday (UI-SPEC 12).
 * Assumption A1 in 02.2-RESEARCH.md: low risk, the user can change it.
 */
const SUNDAY_FIRST: ReadonlySet<string> = new Set([
  'AG', 'BD', 'BR', 'BS', 'BT', 'BW', 'BZ', 'CA', 'CO', 'DO', 'GT', 'HK', 'HN', 'ID', 'IL', 'IN',
  'JM', 'JP', 'KE', 'KH', 'KR', 'LA', 'MM', 'MO', 'MT', 'MX', 'MZ', 'NI', 'NP', 'PA', 'PE', 'PH',
  'PK', 'PR', 'SA', 'TH', 'TT', 'TW', 'US', 'VE', 'YE', 'ZA', 'ZW',
]);

/** Every region currencyForRegion knows that is not Sunday-first. */
const MONDAY_FIRST: ReadonlySet<string> = new Set([
  'AT', 'BE', 'BG', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV',
  'NL', 'PT', 'SI', 'SK', 'AD', 'MC', 'SM', 'VA', 'ME', 'XK',
  'GB', 'AU', 'NZ', 'CN', 'SG', 'MY', 'VN', 'LK', 'AE', 'QA', 'KW', 'BH', 'OM', 'TR', 'EG', 'NG',
  'GH', 'MA', 'CH', 'NO', 'SE', 'DK', 'IS', 'PL', 'CZ', 'HU', 'RO', 'UA', 'AR', 'CL', 'LI', 'RU',
]);

export function regionWeekStart(region: string | null | undefined): 0 | 1 | undefined {
  if (!region) return undefined;
  const code = region.trim().toUpperCase();
  if (SUNDAY_FIRST.has(code)) return 0;
  return MONDAY_FIRST.has(code) ? 1 : undefined;
}
