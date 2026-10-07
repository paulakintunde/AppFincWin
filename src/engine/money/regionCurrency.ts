/**
 * ISO 3166-1 alpha-2 region -> ISO 4217 home currency (02-31). Pure data: used to suggest a
 * starting home currency from the device region on first sign-in. The caller must still check
 * the result against the currencies the app actually offers (an unsupported code is dropped
 * there), and an unlisted region maps to nothing rather than a guess. Never populated from IP
 * geolocation -- the region comes from the user's override, the device, or its time zone.
 */
const EUR_REGIONS = [
  'AT', 'BE', 'BG', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT',
  'NL', 'PT', 'SI', 'SK',
] as const;

const OTHER_REGION_CURRENCY: Readonly<Record<string, string>> = {
  US: 'USD', CA: 'CAD', GB: 'GBP', AU: 'AUD', NZ: 'NZD', JP: 'JPY', KR: 'KRW', CN: 'CNY', HK: 'HKD',
  TW: 'TWD', SG: 'SGD', MY: 'MYR', TH: 'THB', ID: 'IDR', PH: 'PHP', VN: 'VND', IN: 'INR', PK: 'PKR',
  BD: 'BDT', LK: 'LKR', AE: 'AED', SA: 'SAR', QA: 'QAR', KW: 'KWD', BH: 'BHD', OM: 'OMR', IL: 'ILS',
  TR: 'TRY', EG: 'EGP', NG: 'NGN', KE: 'KES', GH: 'GHS', ZA: 'ZAR', MA: 'MAD', CH: 'CHF', NO: 'NOK',
  SE: 'SEK', DK: 'DKK', IS: 'ISK', PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON', UA: 'UAH',
  MX: 'MXN', BR: 'BRL', AR: 'ARS', CL: 'CLP', CO: 'COP', PE: 'PEN', JM: 'JMD', TT: 'TTD',
};

const REGION_CURRENCY: ReadonlyMap<string, string> = new Map<string, string>([
  ...Object.entries(OTHER_REGION_CURRENCY),
  ...EUR_REGIONS.map((region): [string, string] => [region, 'EUR']),
]);

export function currencyForRegion(region: string | null | undefined): string | undefined {
  if (!region) return undefined;
  return REGION_CURRENCY.get(region.trim().toUpperCase());
}
